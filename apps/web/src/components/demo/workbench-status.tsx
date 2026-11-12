import { cn } from '@/lib/utils'
import type { DemoStatus } from '@/store/demo-store'

const STYLES: Record<DemoStatus, { label: string; dot: string; text: string; border: string }> = {
  idle: {
    label: '等待输入',
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
    border: 'border-border',
  },
  streaming: {
    label: '正在拆解',
    dot: 'bg-ochre animate-pulse',
    text: 'text-clay',
    border: 'border-ochre/35',
  },
  done: {
    label: '拆解完成',
    dot: 'bg-primary',
    text: 'text-primary',
    border: 'border-primary/20',
  },
  stopped: {
    label: '已停止',
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    border: 'border-border',
  },
  error: {
    label: '生成失败',
    dot: 'bg-destructive',
    text: 'text-destructive',
    border: 'border-destructive/25',
  },
}

export function WorkbenchStatus({ status }: { status: DemoStatus }) {
  const style = STYLES[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1.5 font-mono text-[9px] tracking-[0.14em]',
        style.border,
        style.text,
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  )
}
