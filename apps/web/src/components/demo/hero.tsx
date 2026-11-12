import { BookOpen, Sparkles } from 'lucide-react'

import { GoalComposer } from './goal-composer'

const STATS = [
  { value: '6–8', label: '可验收任务' },
  { value: 'SSE', label: '逐字流式输出' },
  { value: 'AUTO', label: 'PostgreSQL 归档' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="paper-grid absolute inset-y-0 right-0 w-[58%] opacity-[0.28] [mask-image:linear-gradient(to_left,black,transparent_85%)]" />
        <div className="absolute -right-28 -top-40 size-[520px] rounded-full border border-primary/10" />
        <div className="absolute -right-8 top-10 size-[340px] rounded-full border border-primary/[0.07]" />
        <div className="absolute left-1/2 top-0 h-px w-[70%] -translate-x-1/2 hairline" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 pb-12 pt-12 lg:pb-16 lg:pt-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
          <div className="animate-rise">
            <div className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-clay" />
              <span className="text-[11px] font-medium tracking-[0.22em] text-foreground/70">
                公务员遴选 · AI 任务拆解
              </span>
              <span className="h-px w-8 bg-border" />
              <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
                BETA 0.1
              </span>
            </div>

            <h1 className="font-display mt-6 text-[clamp(1.85rem,9.3vw,3.95rem)] leading-[1.14] tracking-[-0.01em] text-foreground sm:mt-7 sm:text-[3.45rem] xl:text-[3.95rem]">
              把宏大的备考目标，
              <br />
              <span className="whitespace-nowrap">
                拆成
                <span className="relative inline-block text-primary">
                  今天能做的事
                  <span className="absolute -bottom-1.5 left-0 -z-10 h-[9px] w-full -rotate-[0.6deg] rounded-full bg-ochre/35" />
                </span>
                。
              </span>
            </h1>

            <p className="mt-7 max-w-[31rem] text-[14.5px] leading-7 text-muted-foreground">
              输入你的遴选目标，AI 教研员会在几秒内给出 6–8 条可执行、可验收的任务。
              从「知道要努力」到「知道下一步做什么」，中间只隔一次拆解。
            </p>

            <div className="mt-9 grid max-w-[30rem] grid-cols-3 gap-4 border-t border-border/80 pt-6">
              {STATS.map((stat, index) => (
                <div
                  key={stat.label}
                  className={index === 0 ? '' : 'border-l border-border/80 pl-4'}
                >
                  <div className="font-display text-xl text-foreground sm:text-2xl">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 tracking-wide text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-2.5 text-[11px] text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full border border-border bg-card">
                <BookOpen className="size-3.5 text-primary" />
              </span>
              <span>
                教研提示：目标越具体，拆解越接近可执行。
                <span className="ml-1 text-foreground/60">说清层级、时间与短板。</span>
              </span>
              <Sparkles className="ml-1 size-3 text-ochre" />
            </div>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <GoalComposer />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 xl:block">
        <span
          className="font-display text-[10px] tracking-[0.4em] text-foreground/25"
          style={{ writingMode: 'vertical-rl' }}
        >
          以考促学 · 以学促用
        </span>
      </div>
    </section>
  )
}
