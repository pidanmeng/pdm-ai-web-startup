import { cn } from '@/lib/utils'

function Progress({
  value = 0,
  className,
  barClassName,
}: {
  value?: number
  className?: string
  barClassName?: string
}) {
  const safeValue = Math.min(100, Math.max(0, value))

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
      className={cn('bg-secondary h-1.5 w-full overflow-hidden rounded-full', className)}
    >
      <div
        className={cn(
          'bg-primary h-full rounded-full transition-[width] duration-500',
          barClassName,
        )}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}

export { Progress }
