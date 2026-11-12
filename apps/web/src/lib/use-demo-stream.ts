'use client'

import type { DemoStreamEvent } from '@xs/shared'
import { useCallback } from 'react'

import { useDemoStore } from '@/store/demo-store'

/**
 * One stream at a time for the whole demo, shared by every hook instance
 * (composer, stream panel, result actions) so "stop" always aborts the real
 * request. Kept at module scope deliberately — the stream is a page-level
 * resource, not a component-level one.
 */
let activeController: AbortController | null = null

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: DemoStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')

        if (data) {
          try {
            onEvent(JSON.parse(data) as DemoStreamEvent)
          } catch {
            // Ignore malformed frames (e.g. a truncated heartbeat).
          }
        }

        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function useDemoStream() {
  const start = useCallback(async (goal: string) => {
    const trimmed = goal.trim()
    const store = useDemoStore.getState()
    if (trimmed.length < 2 || store.status === 'streaming') return

    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    store.begin(trimmed)

    try {
      // Same-origin Next.js route handler proxies to Elysia. Works in dev and
      // production without exposing the API origin to the browser.
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string
          error?: string
        } | null
        throw new Error(payload?.message ?? payload?.error ?? `请求失败（${response.status}）`)
      }

      if (!response.body) throw new Error('服务器未返回可读取的流。')

      await consumeSse(response.body, (event) => {
        const current = useDemoStore.getState()

        switch (event.type) {
          case 'meta':
            current.setMeta(event.data)
            break
          case 'delta':
            current.appendDelta(event.data.text)
            break
          case 'todos':
            current.setTodos(event.data.todos)
            break
          case 'done':
            current.finish(event.data)
            void current.loadHistory()
            break
          case 'error':
            current.fail(event.data.message)
            void current.loadHistory()
            break
        }
      })

      if (useDemoStore.getState().status === 'streaming') {
        useDemoStore.getState().fail('连接提前结束，请重试。')
      }
    } catch (error) {
      if (controller.signal.aborted) {
        useDemoStore.getState().markStopped()
        return
      }

      useDemoStore
        .getState()
        .fail(error instanceof Error ? error.message : '生成失败，请稍后重试。')
    } finally {
      if (activeController === controller) activeController = null
    }
  }, [])

  const stop = useCallback(() => {
    activeController?.abort()
  }, [])

  return { start, stop }
}
