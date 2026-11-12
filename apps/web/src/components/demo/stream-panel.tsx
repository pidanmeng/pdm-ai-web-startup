'use client'

import { AlertCircle, Loader2, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '@/components/ui/button'
import { useDemoStream } from '@/lib/use-demo-stream'
import { cn } from '@/lib/utils'
import { useDemoStore } from '@/store/demo-store'

function useElapsed(active: boolean, startedAt: number | null) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null
  if (!now || !startedAt) return 0
  return Math.max(0, (now - startedAt) / 1000)
}

export function StreamPanel() {
  const rawText = useDemoStore((state) => state.rawText)
  const status = useDemoStore((state) => state.status)
  const meta = useDemoStore((state) => state.meta)
  const source = useDemoStore((state) => state.source)
  const startedAt = useDemoStore((state) => state.startedAt)
  const latencyMs = useDemoStore((state) => state.latencyMs)
  const error = useDemoStore((state) => state.error)
  const { stop } = useDemoStream()

  const elapsed = useElapsed(status === 'streaming', startedAt)
  const seconds =
    status === 'streaming' ? (elapsed ?? 0) : latencyMs !== null ? latencyMs / 1000 : null

  const scrollRef = useRef<HTMLDivElement>(null)
  const [thinkingPhase, setThinkingPhase] = useState(0)

  useEffect(() => {
    if (status !== 'streaming' || rawText.length > 0) return
    const timer = setInterval(() => setThinkingPhase((phase) => (phase + 1) % 3), 2600)
    return () => clearInterval(timer)
  }, [status, rawText.length])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    // Archived runs should open at the beginning; live output follows the tail.
    element.scrollTop = source === 'archive' ? 0 : element.scrollHeight
  }, [rawText, source])

  const hasText = rawText.trim().length > 0

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-primary-foreground/10 bg-jade-deep px-5 py-3.5 text-primary-foreground">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2">
            {status === 'streaming' && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-75" />
            )}
            <span
              className={cn(
                'relative inline-flex size-2 rounded-full',
                status === 'streaming' && 'bg-ochre',
                status === 'done' && 'bg-emerald-300',
                status === 'error' && 'bg-red-300',
                status === 'stopped' && 'bg-primary-foreground/50',
              )}
            />
          </span>
          <span className="text-[13px] font-medium tracking-wide">AI 推演</span>
          <span className="hidden font-mono text-[9px] tracking-[0.2em] text-primary-foreground/45 sm:inline">
            / REASONING
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 font-mono text-[10px] text-primary-foreground/60">
          <span className="tabular-nums">{seconds !== null ? `${seconds.toFixed(1)}s` : '—'}</span>
          <span className="hidden rounded-full border border-primary-foreground/15 px-2 py-0.5 sm:inline">
            {meta?.model ?? 'deepseek-flash'}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin h-[500px] overflow-y-auto px-6 py-6 sm:h-[540px]"
      >
        {error && !hasText ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </span>
            <p className="mt-4 text-sm font-medium">这次没有拆解成功</p>
            <p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">{error}</p>
          </div>
        ) : !hasText && status === 'streaming' ? (
          <div className="flex h-full flex-col justify-center">
            <div className="flex items-center gap-3 text-[11px] tracking-wider text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-clay" />
              {
                [
                  '正在理解目标，建立任务框架',
                  '正在判断考试层级与时间窗口',
                  '正在编排优先级与交付物',
                ][thinkingPhase]
              }
            </div>
            <div className="mt-7 space-y-6">
              {[88, 72, 94, 58].map((width, index) => (
                <div key={width} className="space-y-2.5">
                  <div
                    className="skeleton-sheen h-2.5 rounded-full bg-secondary"
                    style={{ width: `${width}%` }}
                  />
                  {index !== 3 && (
                    <div className="skeleton-sheen h-2 w-[42%] rounded-full bg-secondary/70" />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-8 font-mono text-[9px] tracking-[0.16em] text-muted-foreground/60">
              STREAMING FROM ELYSIA · SSE
            </p>
          </div>
        ) : !hasText ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="font-display text-4xl text-border">稿</span>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              这条记录没有保留推演原文。
              <br />
              右侧执行清单仍然可以查看与复用。
            </p>
          </div>
        ) : (
          <div className="prose prose-sm prose-ink max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
              }}
            >
              {rawText}
            </ReactMarkdown>
            {status === 'streaming' && <span className="stream-caret align-baseline" />}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/80 bg-secondary/20 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/70">
          <span className="truncate">RUN {meta?.runId.slice(0, 8) ?? 'PENDING'}</span>
          <span className="hidden text-border sm:inline">|</span>
          <span className="hidden sm:inline">{rawText.length} CHARS</span>
        </div>

        {status === 'streaming' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stop}
            className="h-7 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-destructive"
          >
            <Square className="size-2.5 fill-current" />
            停止生成
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60">
              {status === 'done'
                ? 'GENERATION COMPLETE'
                : status === 'stopped'
                  ? 'GENERATION STOPPED'
                  : 'GENERATION FAILED'}
            </span>
            {hasText && (
              <button
                type="button"
                onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="rounded-full px-2 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                回到顶部 ↑
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
