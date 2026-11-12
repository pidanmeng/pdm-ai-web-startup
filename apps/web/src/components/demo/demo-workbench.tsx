'use client'

import { AlertCircle, X } from 'lucide-react'
import dynamic from 'next/dynamic'

import { Button } from '@/components/ui/button'
import { useDemoStream } from '@/lib/use-demo-stream'
import { useDemoStore } from '@/store/demo-store'

import { ChecklistPanel } from './checklist-panel'
import { EmptyWorkbench } from './empty-workbench'
import { StreamPanel } from './stream-panel'
import { WorkbenchStatus } from './workbench-status'

const CopilotDock = dynamic(
  () => import('@/components/copilot/copilot-dock').then((mod) => mod.CopilotDock),
  { ssr: false },
)

export function DemoWorkbench() {
  const goal = useDemoStore((state) => state.goal)
  const status = useDemoStore((state) => state.status)
  const rawText = useDemoStore((state) => state.rawText)
  const todos = useDemoStore((state) => state.todos)
  const error = useDemoStore((state) => state.error)
  const reset = useDemoStore((state) => state.reset)
  const { start } = useDemoStream()

  const showWorkbench = status !== 'idle' || rawText.length > 0 || todos.length > 0

  return (
    <section
      id="workbench"
      className="relative mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-14 pt-4"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/70">
            <span className="text-clay">02</span>
            <span className="h-px w-6 bg-border" />
            WORKBENCH
          </div>
          <h2 className="font-display mt-2 text-[1.7rem] text-foreground sm:text-[2rem]">
            AI 工作台
            <span className="ml-2 align-middle font-sans text-[10px] font-normal tracking-wider text-muted-foreground">
              目标 → 任务 → 行动
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <WorkbenchStatus status={status} />
          {showWorkbench && status !== 'streaming' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-muted-foreground hover:text-foreground"
            >
              新目标
            </Button>
          )}
        </div>
      </div>

      {status === 'error' && error && rawText.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.045] px-4 py-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void start(goal)}
            className="border-destructive/20 text-destructive hover:bg-destructive/5"
          >
            重试
          </Button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full p-1 transition-colors hover:bg-destructive/10"
            aria-label="关闭错误提示"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {showWorkbench ? (
        <div className="animate-rise grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <StreamPanel />
          <ChecklistPanel />
        </div>
      ) : (
        <div className="animate-rise">
          <EmptyWorkbench />
        </div>
      )}

      <CopilotDock goal={goal} todos={todos} />
    </section>
  )
}
