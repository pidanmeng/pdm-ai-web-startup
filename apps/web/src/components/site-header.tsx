import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { SystemStatus } from '@/components/system-status'
import { API_URL } from '@/lib/api'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/demo" className="group flex items-center gap-3">
            <span className="relative grid size-10 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--jade)]">
              <span className="font-display text-[21px] leading-none">遴</span>
              <span className="absolute inset-[3px] rounded-[7px] border border-primary-foreground/25" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-[0.04em]">
                XS 遴选 <span className="text-muted-foreground">AI 中台</span>
              </span>
              <span className="mt-1.5 hidden font-mono text-[9px] tracking-[0.2em] text-muted-foreground/80 sm:block">
                PUBLIC SELECTION · INTELLIGENCE
              </span>
            </span>
          </Link>

          <span className="hidden h-7 w-px bg-border md:block" />

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="#workbench"
              className="rounded-full px-3 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              任务拆解
            </Link>
            <Link
              href="#archive"
              className="rounded-full px-3 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              归档记录
            </Link>
            <a
              href={`${API_URL}/openapi`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-3 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              API 文档
            </a>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <SystemStatus />
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <a href={`${API_URL}/openapi`} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              OpenAPI
            </a>
          </Button>
          <div className="hidden size-8 place-items-center rounded-full border border-border bg-secondary/60 font-display text-xs text-foreground/80 sm:grid">
            研
          </div>
        </div>
      </div>
    </header>
  )
}
