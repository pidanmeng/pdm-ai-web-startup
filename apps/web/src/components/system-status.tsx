'use client'

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Status = 'checking' | 'online' | 'degraded' | 'offline'

export function SystemStatus() {
  const [status, setStatus] = useState<Status>('checking')
  const [db, setDb] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    let active = true

    api.api.health
      .get()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          setStatus('offline')
          return
        }
        setDb(data.database)
        setStatus(data.database === 'up' ? 'online' : 'degraded')
      })
      .catch(() => {
        if (active) setStatus('offline')
      })

    return () => {
      active = false
    }
  }, [])

  const label =
    status === 'checking'
      ? '正在连接'
      : status === 'online'
        ? '服务在线'
        : status === 'degraded'
          ? '数据库未连接'
          : 'API 离线'

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="relative flex size-1.5">
        {status === 'checking' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-muted-foreground opacity-60" />
        )}
        <span
          className={cn(
            'relative inline-flex size-1.5 rounded-full',
            status === 'online' && 'bg-primary',
            status === 'checking' && 'bg-muted-foreground',
            status === 'degraded' && 'bg-ochre',
            status === 'offline' && 'bg-destructive',
          )}
        />
      </span>
      <span>{label}</span>
      {db === 'up' && <span className="hidden font-mono text-[10px] opacity-60 lg:inline">PG</span>}
    </div>
  )
}
