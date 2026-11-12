'use client'

import type { TodoItem, TodoPriority } from '@xs/shared'
import { PRIORITY_LABEL } from '@xs/shared'
import { Check, CheckCheck, Copy, Database, Loader2, RotateCcw, Square } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useDemoStream } from '@/lib/use-demo-stream'
import { cn } from '@/lib/utils'
import { useDemoStore } from '@/store/demo-store'

const PRIORITY_STYLE: Record<TodoPriority, string> = {
  high: 'border-clay/25 bg-clay/10 text-clay',
  medium: 'border-primary/20 bg-primary/[0.07] text-primary',
  low: 'border-border bg-secondary/60 text-muted-foreground',
}

const PRIORITY_SHORT: Record<TodoPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function TodoCard({ todo }: { todo: TodoItem }) {
  const checked = useDemoStore((state) => state.checked[todo.id] ?? false)
  const toggleTodo = useDemoStore((state) => state.toggleTodo)

  return (
    <button
      type="button"
      onClick={() => toggleTodo(todo.id)}
      aria-pressed={checked}
      className={cn(
        'group flex w-full gap-3 rounded-xl border p-3.5 text-left transition-all duration-200',
        checked
          ? 'border-primary/20 bg-primary/[0.045]'
          : 'border-border/90 bg-card hover:-translate-y-px hover:border-primary/25 hover:shadow-[0_12px_30px_-24px_var(--jade)]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-foreground/25 bg-background group-hover:border-primary/50',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/70">
            TASK {String(todo.position).padStart(2, '0')}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] leading-none',
              PRIORITY_STYLE[todo.priority],
            )}
            title={PRIORITY_LABEL[todo.priority]}
          >
            {PRIORITY_SHORT[todo.priority]}
          </span>
        </span>

        <span
          className={cn(
            'mt-1.5 block text-[13px] leading-5 font-medium transition-colors',
            checked ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {todo.title}
        </span>

        {todo.detail && (
          <span
            className={cn(
              'mt-1 block text-[11px] leading-5',
              checked ? 'text-muted-foreground/60' : 'text-muted-foreground',
            )}
          >
            {todo.detail}
          </span>
        )}
      </span>
    </button>
  )
}

export function ChecklistPanel() {
  const todos = useDemoStore((state) => state.todos)
  const checked = useDemoStore((state) => state.checked)
  const status = useDemoStore((state) => state.status)
  const latencyMs = useDemoStore((state) => state.latencyMs)
  const persisted = useDemoStore((state) => state.persisted)
  const goal = useDemoStore((state) => state.goal)
  const reset = useDemoStore((state) => state.reset)
  const { start, stop } = useDemoStream()
  const [copied, setCopied] = useState(false)

  const doneCount = todos.filter((todo) => checked[todo.id]).length
  const percent = todos.length === 0 ? 0 : (doneCount / todos.length) * 100
  const isStreaming = status === 'streaming'

  async function copyChecklist() {
    if (todos.length === 0) return
    const markdown = [
      `# ${goal}`,
      '',
      '## 任务拆解',
      ...todos.map(
        (todo) =>
          `- [${checked[todo.id] ? 'x' : ' '}] ${todo.title} | ${todo.detail} | ${PRIORITY_LABEL[todo.priority]}`,
      ),
    ].join('\n')

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="border-b border-border/80 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-md bg-primary/10 font-mono text-[9px] text-primary">
              ✓
            </span>
            <span className="text-[13px] font-medium tracking-wide">执行清单</span>
            <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/70">
              / ACTION
            </span>
          </div>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {doneCount}/{todos.length || '—'}
          </span>
        </div>

        <div className="mt-3.5">
          <Progress value={percent} />
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {todos.length === 0
                ? '等待任务生成'
                : doneCount === todos.length
                  ? '清单已全部完成'
                  : `完成 ${Math.round(percent)}%，先做高优先级任务`}
            </span>
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-clay">
                <Loader2 className="size-2.5 animate-spin" />
                实时补全
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="scrollbar-thin h-[500px] space-y-2.5 overflow-y-auto px-4 py-4 sm:h-[540px]">
        {todos.length > 0 ? (
          todos.map((todo) => <TodoCard key={todo.id} todo={todo} />)
        ) : isStreaming ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-xl border border-border/80 p-3.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-2 w-16" />
                  <Skeleton className="h-3.5 w-7 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-3 w-[72%]" />
                <Skeleton className="mt-2.5 h-2 w-[90%]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="font-display text-4xl text-border">待</span>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              目标开始拆解后，
              <br />
              可执行的任务会逐条出现在这里。
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-border/80 bg-secondary/20 px-4 py-3.5">
        {status === 'done' && (
          <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Database className={cn('size-3', persisted ? 'text-primary' : 'text-ochre')} />
            {persisted
              ? `已归档 · 用时 ${((latencyMs ?? 0) / 1000).toFixed(1)}s`
              : '未归档（数据库暂不可用）'}
          </div>
        )}

        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Button variant="outline" size="sm" onClick={stop} className="flex-1">
              <Square className="size-2.5 fill-current" />
              停止生成
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void start(goal)}
              disabled={goal.trim().length < 2}
              className="flex-1"
            >
              <RotateCcw />
              重新生成
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyChecklist()}
            disabled={todos.length === 0}
            className="flex-1"
          >
            {copied ? <CheckCheck className="text-primary" /> : <Copy />}
            {copied ? '已复制' : '复制清单'}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reset}
            title="开始一个新目标"
            aria-label="开始一个新目标"
          >
            <RotateCcw className="text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  )
}
