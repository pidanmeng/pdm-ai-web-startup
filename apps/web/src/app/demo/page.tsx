import type { Metadata } from 'next'

import { DemoPage } from '@/components/demo/demo-page'

export const metadata: Metadata = {
  title: 'AI 任务拆解 · XS 遴选 AI 中台',
  description: '输入一个公务员遴选备考目标，AI 逐字流式拆解为 6–8 条可执行任务。',
}

export default function DemoPageRoute() {
  return <DemoPage />
}
