import { parseTodos, type DemoStreamEvent } from '@xs/shared'
import { streamText } from 'ai'

import { DemoRepository } from '../../db/demo-repository'
import { env } from '../../env'
import { demoModel } from '../../lib/llm'
import { buildUserPrompt, DEMO_SYSTEM_PROMPT } from './prompt'

const encoder = new TextEncoder()

function sse(event: DemoStreamEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof Error && /aborted|abort/i.test(error.message))
  )
}

function readableError(error: unknown): string {
  if (!(error instanceof Error)) return '生成失败，请稍后重试。'
  if (env.nodeEnv === 'production') return 'AI 服务暂时不可用，请稍后重试。'
  return error.message.slice(0, 300)
}

/**
 * Demo business logic, decoupled from the Elysia context.
 * The controller only passes plain values (goal + AbortSignal).
 */
export abstract class DemoService {
  static stream(goal: string, requestSignal?: AbortSignal): Response {
    const runId = crypto.randomUUID()
    const startedAt = Date.now()
    const startedAtIso = new Date(startedAt).toISOString()
    const abortController = new AbortController()

    const abort = () => abortController.abort()
    if (requestSignal?.aborted) abort()
    requestSignal?.addEventListener('abort', abort, { once: true })

    const stream = new ReadableStream<Uint8Array>(
      {
        async start(controller) {
          let closed = false
          let rawOutput = ''
          let lastTodoCount = -1
          let runCreated = false
          let persisted = false
          let heartbeat: ReturnType<typeof setInterval> | undefined

          const send = (event: DemoStreamEvent) => {
            if (closed) return
            try {
              controller.enqueue(sse(event))
            } catch {
              closed = true
            }
          }

          const persistPromise = DemoRepository.createRun({
            id: runId,
            goal,
            model: env.llm.model,
          })
            .then(() => {
              runCreated = true
              return true
            })
            .catch((error: unknown) => {
              console.warn('[demo] run not persisted (database unavailable):', error)
              return false
            })

          try {
            send({
              type: 'meta',
              data: { runId, model: env.llm.model, startedAt: startedAtIso },
            })

            heartbeat = setInterval(() => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(': ping\n\n'))
              } catch {
                closed = true
              }
            }, 15_000)

            if (abortController.signal.aborted) throw new Error('Aborted before generation')

            const result = streamText({
              model: demoModel,
              system: DEMO_SYSTEM_PROMPT,
              prompt: buildUserPrompt(goal),
              temperature: 0.4,
              // Reasoning models spend output tokens on hidden reasoning first.
              // Leave enough headroom for the full checklist.
              maxOutputTokens: 4096,
              providerOptions: {
                openaiCompatible: { reasoningEffort: 'low' },
              },
              abortSignal: abortController.signal,
            })

            for await (const chunk of result.textStream) {
              if (!chunk) continue
              if (abortController.signal.aborted) break

              rawOutput += chunk
              send({ type: 'delta', data: { text: chunk } })

              const todos = parseTodos(rawOutput)
              if (todos.length > 0 && todos.length !== lastTodoCount) {
                lastTodoCount = todos.length
                send({ type: 'todos', data: { todos } })
              }
            }

            if (abortController.signal.aborted) throw new Error('Aborted by client')

            const todos = parseTodos(rawOutput)
            if (todos.length === 0) {
              console.warn(
                `[demo] no parsable todos (chars=${rawOutput.length}, model=${env.llm.model})`,
              )
              throw new Error('模型未返回可解析的任务清单，请重试或换一个目标描述。')
            }

            const latencyMs = Date.now() - startedAt
            runCreated = await persistPromise

            if (runCreated) {
              try {
                await DemoRepository.completeRun(runId, { rawOutput, todos, latencyMs })
                persisted = true
              } catch (error) {
                console.warn('[demo] failed to persist completed run:', error)
              }
            }

            send({ type: 'todos', data: { todos } })
            send({
              type: 'done',
              data: { runId, todos, latencyMs, persisted },
            })
          } catch (error) {
            const aborted = abortController.signal.aborted || isAbortError(error)
            // The run row may still be in flight when the client disconnects.
            // Wait for the insert attempt so we do not leave orphaned "streaming" rows.
            const created = runCreated || (await persistPromise.catch(() => false))
            if (created) {
              try {
                await DemoRepository.failRun(
                  runId,
                  aborted ? '客户端中断生成' : readableError(error),
                )
              } catch {
                // best-effort persistence only
              }
            }

            if (!aborted) {
              console.error('[demo] generation failed:', error)
              send({ type: 'error', data: { message: readableError(error), runId } })
            }
          } finally {
            if (heartbeat) clearInterval(heartbeat)
            requestSignal?.removeEventListener('abort', abort)
            closed = true
            try {
              controller.close()
            } catch {
              // already cancelled by the client
            }
          }
        },

        cancel() {
          abortController.abort()
          requestSignal?.removeEventListener('abort', abort)
        },
      },
      { highWaterMark: 16 },
    )

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Run-Id': runId,
      },
    })
  }
}
