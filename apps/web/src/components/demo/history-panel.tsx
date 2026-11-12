'use client'

import type { DemoRunStatus, DemoRunSummary } from '@xs/shared'
import { ArrowUpRight, Database, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDemoStore } from '@/store/demo-store'

const STATUS_META: Record<
  DemoRunStatus,
  { label: string; variant: 'jade' | 'amber' | 'destructive' | 'outline' }
> = {
  completed: { label: '已完成', variant: 'jade' },
  streaming: { label: '生成中', variant: 'amber' },
  failed: { label: '失败', variant: 'destructive' },
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

function HistoryCard({
  run,
  active,
  busy,
  onOpen,
}: {
  run: DemoRunSummary
  active: boolean
  busy: boolean
  onOpen: () => void
}) {
  const meta = STATUS_META[run.status]

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className={cn(
        'group relative flex h-full flex-col rounded-xl border bg-card p-4 text-left transition-all duration-200',
        active
          ? 'border-primary/35 shadow-[0_18px_44px_-32px_var(--jade)]'
          : 'border-border hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_44px_-32px_var(--jade)]',
        busy && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant={meta.variant} className="px-2 py-0.5 text-[9px]">
          {meta.label}
        </Badge>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground/70">
          {formatDate(run.createdAt)}
        </span>
      </div>

      <p className="font-display mt-3 line-clamp-2 min-h-[3.2rem] text-[15px] leading-[1.6] text-foreground/90">
        {run.goal}
      </p>

      <div className="mt-auto flex items-center justify-between border-t border-dashed border-border/80 pt-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-2 font-mono tracking-wide">
          <span>{run.todoCount} TASKS</span>
          <span className="text-border">/</span>
          <span>{run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)}s` : '—'}</span>
        </span>
        <span className="grid size-6 place-items-center rounded-full border border-border bg-background transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <ArrowUpRight className="size-3" />
        </span>
      </div>
    </button>
  )
}

export function HistoryPanel() {
  const history = useDemoStore((state) => state.history)
  const historyLoading = useDemoStore((state) => state.historyLoading)
  const historyError = useDemoStore((state) => state.historyError)
  const activeRunId = useDemoStore((state) => state.activeRunId)
  const isStreaming = useDemoStore((state) => state.status === 'streaming')
  const loadHistory = useDemoStore((state) => state.loadHistory)
  const loadRun = useDemoStore((state) => state.loadRun)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    void loadHistory()
  }, [loadHistory])

  async function openRun(id: string) {
    setOpeningId(id)
    const ok = await loadRun(id)
    setOpeningId(null)
    if (ok) {
      document.getElementById('workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section id="archive" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/70">
            <span className="text-clay">03</span>
            <span className="h-px w-6 bg-border" />
            ARCHIVE
          </div>
          <h2 className="font-display mt-2 text-[1.7rem] text-foreground sm:text-[2rem]">
            归档记录
            <span className="ml-2 align-middle font-sans text-[10px] font-normal tracking-wider text-muted-foreground">
              {history.length > 0 ? `共 ${history.length} 条` : 'PostgreSQL 持久化'}
            </span>
          </h2>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadHistory()}
          disabled={historyLoading}
        >
          <RefreshCw className={historyLoading ? 'animate-spin' : ''} />
          刷新归档
        </Button>
      </div>

      {historyError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.045] px-4 py-3 text-xs text-destructive">
          <TriangleAlert className="size-4" />
          {historyError}
        </div>
      )}

      {historyLoading && history.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="rounded-xl border border-border bg-card p-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-4 h-4 w-[88%]" />
              <Skeleton className="mt-2 h-4 w-[62%]" />
              <div className="mt-6 flex justify-between border-t border-border/80 pt-3">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="size-6 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : history.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {history.map((run) => (
            <HistoryCard
              key={run.id}
              run={run}
              active={activeRunId === run.id}
              busy={openingId === run.id || isStreaming}
              onOpen={() => void openRun(run.id)}
            />
          ))}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/60 px-6 py-12 text-center">
          <div className="pointer-events-none absolute inset-0 paper-grid opacity-20" />
          <span className="relative mx-auto grid size-11 place-items-center rounded-full border border-border bg-background text-muted-foreground">
            <Database className="size-5" />
          </span>
          <p className="relative mt-4 font-display text-lg text-foreground/80">归档区还是空的</p>
          <p className="relative mx-auto mt-2 max-w-sm text-[11px] leading-6 text-muted-foreground">
            完成一次目标拆解后，任务清单会写入 PostgreSQL。
            连接好数据库，这里会自动出现可回看的历史记录。
          </p>
          {!historyError && (
            <p className="relative mt-4 font-mono text-[9px] tracking-[0.16em] text-muted-foreground/50">
              POSTGRESQL · DRIZZLE ORM
            </p>
          )}
        </div>
      )}
    </section>
  )
}
