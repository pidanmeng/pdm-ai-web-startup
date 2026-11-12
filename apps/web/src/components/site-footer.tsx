import Link from 'next/link'

import { API_URL } from '@/lib/api'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/70">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-primary font-display text-sm text-primary-foreground">
              遴
            </span>
            <span className="text-sm font-medium tracking-wide">XS 遴选 · AI 中台</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground">
              v0.1
            </span>
          </div>
          <p className="mt-3 max-w-md text-xs leading-6 text-muted-foreground">
            面向公务员遴选教培的 AI SaaS
            中台原型。目标拆解只是第一条业务线，后续可扩展为教研资产、批改与学情分析。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="font-mono text-[10px] tracking-widest">NEXT.JS / ELYSIA / DEEPSEEK</span>
          <Link href="#workbench" className="transition-colors hover:text-foreground">
            工作台
          </Link>
          <a
            href={`${API_URL}/api/health`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            健康检查
          </a>
          <a
            href={`${API_URL}/openapi`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            API 文档
          </a>
        </div>
      </div>
    </footer>
  )
}
