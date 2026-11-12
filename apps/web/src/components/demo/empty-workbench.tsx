import { ArrowRight, Layers, ListChecks, Sparkles } from 'lucide-react'

const STEPS = [
  {
    title: '说出目标',
    body: '层级、时间窗口、当前短板，一句话就够。',
  },
  {
    title: 'AI 拆解',
    body: '判断考情，生成 6–8 条按优先级排序的任务。',
  },
  {
    title: '今天开始',
    body: '勾选执行，结果自动归档，随时回看。',
  },
]

const SAMPLE = [
  { title: '用一套真题做基线诊断', detail: '限时完成，标出失分模块', priority: '高' },
  { title: '建立高频考点清单', detail: '按题型整理近三年命题点', priority: '高' },
  { title: '公文写作每日一练', detail: '每天 40 分钟，批改后复盘', priority: '中' },
]

export function EmptyWorkbench() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="pointer-events-none absolute -right-20 -top-28 size-[340px] rounded-full border border-primary/[0.07]" />
      <div className="pointer-events-none absolute -right-8 top-4 size-[200px] rounded-full border border-primary/[0.05]" />

      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative p-7 sm:p-9 lg:p-10">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
              STANDBY
            </span>
            <span className="size-1 rounded-full bg-ochre" />
            <span className="text-[10px] text-muted-foreground">等待一个目标</span>
          </div>

          <h3 className="font-display mt-6 text-[1.9rem] leading-tight text-foreground sm:text-[2.2rem]">
            先说出一个目标。
            <br />
            <span className="text-primary">剩下的交给拆解。</span>
          </h3>

          <p className="mt-4 max-w-sm text-[12.5px] leading-6 text-muted-foreground">
            AI 不会替你许愿，但会把「通过遴选」翻译成今天、这周、这个月分别该做什么。
          </p>

          <ol className="mt-7 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background font-mono text-[9px] text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block text-[12px] font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                    {step.body}
                  </span>
                </span>
                {index < STEPS.length - 1 && (
                  <span className="ml-auto hidden self-end text-border sm:block">↓</span>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1">
              <Layers className="size-3 text-primary/70" />
              自动收束范围
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1">
              <ListChecks className="size-3 text-primary/70" />
              按优先级排序
            </span>
          </div>
        </div>

        <div className="relative border-t border-border/80 bg-secondary/25 p-7 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
          <div className="pointer-events-none absolute inset-0 paper-grid opacity-30" />

          <div className="relative rotate-[-0.35deg] rounded-xl border border-border bg-card p-5 shadow-[0_24px_60px_-36px_var(--jade)]">
            <div className="flex items-center justify-between border-b border-dashed border-border pb-3">
              <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                <Sparkles className="size-3 text-clay" />
                AI 输出预览
              </div>
              <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground/50">
                SAMPLE
              </span>
            </div>

            <div className="mt-4">
              <div className="font-mono text-[8px] tracking-[0.16em] text-muted-foreground/60">
                目标 / OBJECTIVE
              </div>
              <div className="mt-1 text-[12px] text-foreground/80">三个月通过省直机关遴选笔试</div>
            </div>

            <div className="mt-4 space-y-2.5">
              {SAMPLE.map((item, index) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-border/80 bg-background/55 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/60">
                      TASK {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="rounded-full border border-clay/20 bg-clay/10 px-1.5 py-0.5 text-[8px] text-clay">
                      {item.priority}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-medium">{item.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-3 text-[9px] text-muted-foreground/70">
              <span>+ 更多任务将实时生成</span>
              <ArrowRight className="size-3" />
            </div>
          </div>

          <p className="relative mt-4 px-1 text-center text-[10px] leading-5 text-muted-foreground/70">
            每次生成都会写入 PostgreSQL
            <br className="sm:hidden" /> 并在下方「归档记录」中留存
          </p>
        </div>
      </div>
    </div>
  )
}
