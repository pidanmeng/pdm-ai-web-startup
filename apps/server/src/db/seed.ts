/**
 * Optional demo seed: inserts one completed run so the archive UI has content
 * before the first real generation.
 *
 *   bun run db:seed
 */
import type { TodoItem } from '@xs/shared'

import { sql } from '.'
import { DemoRepository } from './demo-repository'

const runId = crypto.randomUUID()

const todos: TodoItem[] = [
  {
    id: 'todo_1',
    title: '用一套真题做基线诊断',
    detail: '按考试时长限时完成，标注失分模块与耗时分布',
    priority: 'high',
    position: 1,
  },
  {
    id: 'todo_2',
    title: '建立公文文种格式速查卡',
    detail: '整理 15 种法定公文，每题注明要素、语气与常见错误',
    priority: 'high',
    position: 2,
  },
  {
    id: 'todo_3',
    title: '每周三篇公文仿写',
    detail: '通知、请示、讲话稿轮换，对照范文逐句批改',
    priority: 'medium',
    position: 3,
  },
  {
    id: 'todo_4',
    title: '每两周一次全真模考',
    detail: '严格计时，考后完成失分归因表并复盘',
    priority: 'medium',
    position: 4,
  },
]

const rawOutput = [
  '## 目标解读',
  '示例归档：以市直机关遴选的主观题要求为基准，先用真题定位短板，再把公文写作拆成“格式—逻辑—表述”三层训练。',
  '',
  '## 任务拆解',
  ...todos.map(
    (todo) =>
      `- [ ] ${todo.title} | ${todo.detail} | ${todo.priority === 'high' ? '高' : todo.priority === 'low' ? '低' : '中'}`,
  ),
  '',
  '## 今日起步',
  '先完成一套限时真题，把失分点写进第一版诊断表。',
].join('\n')

try {
  await DemoRepository.createRun({
    id: runId,
    goal: '示例：60 天冲刺市直机关遴选，重点补齐公文写作',
    model: 'seed',
  })
  await DemoRepository.completeRun(runId, {
    rawOutput,
    todos,
    latencyMs: 0,
  })
  console.log(`Seeded demo run ${runId} with ${todos.length} tasks.`)
} finally {
  await sql.end()
}
