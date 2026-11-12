import '@copilotkit/react-ui/styles.css'

import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'XS 遴选 · AI 任务拆解中台',
  description:
    '面向公务员遴选教培的 AI SaaS 中台。输入一个备考目标，AI 逐字流式拆解为可执行、可验收的任务清单，并自动归档。',
  keywords: ['公务员遴选', 'AI 教培', 'SaaS', '任务拆解', 'Elysia', 'Next.js'],
}

export const viewport: Viewport = {
  themeColor: '#f5f1e8',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
