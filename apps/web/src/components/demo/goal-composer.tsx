'use client'

import { ArrowUpRight, Database, Loader2, RotateCcw, Sparkles, Target } from 'lucide-react'
import { useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useDemoStream } from '@/lib/use-demo-stream'
import { cn } from '@/lib/utils'
import { useDemoStore } from '@/store/demo-store'

const EXAMPLES = [
  '三个月通过省直机关遴选笔试',
  '30 天补齐公文写作短板',
  '面试冲刺：结构化表达与岗位匹配',
]

export function GoalComposer() {
  const goal = useDemoStore((state) => state.goal)
  const status = useDemoStore((state) => state.status)
  const setGoal = useDemoStore((state) => state.setGoal)
  const { start } = useDemoStream()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isStreaming = status === 'streaming'
  const hasResult = status === 'done' || status === 'stopped' || status === 'error'
  const canSubmit = goal.trim().length >= 2 && !isStreaming

  function submit() {
    if (!canSubmit) return
    void start(goal)
    window.requestAnimationFrame(() => {
      document.getElementById('workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-primary/[0.035] blur-2xl" />

      <div className="paper-noise relative overflow-hidden rounded-2xl border border-border bg-card shadow-float">
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.16em] text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-md border border-border bg-background">
              <Target className="size-3.5 text-primary" />
            </span>
            OBJECTIVE
            <span className="text-border">/</span>
            <span className="tracking-normal text-foreground/70">备考目标</span>
          </div>
          <Badge variant="amber" className="gap-1.5 py-1 font-mono text-[9px] tracking-[0.18em]">
            <span className="size-1 rounded-full bg-clay" />
            LIVE DEMO
          </Badge>
        </div>

        <div className="px-6 pt-6">
          <Textarea
            ref={inputRef}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
            maxLength={200}
            disabled={isStreaming}
            placeholder="例如：三个月内通过省直机关遴选笔试。行测基础一般，公文写作是短板，每天能投入 2 小时。"
            aria-label="备考目标"
            className="min-h-[148px] text-[16px] leading-8"
          />

          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] tracking-wide text-muted-foreground/70">
              描述层级、时间与短板，拆解会更准确
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {goal.length}/200
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-0.5 text-[10px] tracking-wider text-muted-foreground">试试</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setGoal(example)
                  inputRef.current?.focus()
                }}
                disabled={isStreaming}
                className={cn(
                  'rounded-full border border-border bg-background/60 px-3 py-1.5 text-[11px] text-foreground/65 transition-all',
                  'hover:border-primary/30 hover:bg-secondary/60 hover:text-foreground disabled:opacity-50',
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-border/90 bg-secondary/25 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[10px] leading-5 text-muted-foreground">
            <Database className="size-3.5 shrink-0 text-primary/70" />
            生成结果自动归档，可随时回看与复用
          </div>

          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={!canSubmit}
            className="group w-full justify-between px-5 sm:w-auto sm:min-w-[178px]"
          >
            <span className="flex items-center gap-2">
              {isStreaming ? (
                <Loader2 className="animate-spin" />
              ) : hasResult ? (
                <RotateCcw />
              ) : (
                <Sparkles />
              )}
              {isStreaming ? 'AI 正在拆解' : hasResult ? '重新拆解' : '开始拆解'}
            </span>
            <ArrowUpRight className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60">
        <span>⌘ / CTRL + ENTER 快速提交</span>
        <span>MAX 200 CHARS</span>
      </div>
    </div>
  )
}
