import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

import { DemoWorkbench } from './demo-workbench'
import { Hero } from './hero'
import { HistoryPanel } from './history-panel'

export function DemoPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        <Hero />
        <DemoWorkbench />
        <HistoryPanel />
      </main>
      <SiteFooter />
    </div>
  )
}
