export type TodoPriority = 'high' | 'medium' | 'low'

export type DemoRunStatus = 'streaming' | 'completed' | 'failed'

export interface TodoItem {
  /** Stable, deterministic id within one generation (todo_1, todo_2 ...). */
  id: string
  title: string
  detail: string
  priority: TodoPriority
  position: number
}

export interface DemoRunSummary {
  id: string
  goal: string
  model: string
  status: DemoRunStatus
  todoCount: number
  latencyMs: number | null
  createdAt: string
  completedAt: string | null
}

export interface DemoRunDetail extends DemoRunSummary {
  rawOutput: string | null
  todos: TodoItem[]
}

export interface DemoStreamMeta {
  runId: string
  model: string
  startedAt: string
}

/** Server-Sent Events emitted by POST /api/demo. */
export type DemoStreamEvent =
  | { type: 'meta'; data: DemoStreamMeta }
  | { type: 'delta'; data: { text: string } }
  | { type: 'todos'; data: { todos: TodoItem[] } }
  | {
      type: 'done'
      data: {
        runId: string
        todos: TodoItem[]
        latencyMs: number
        persisted: boolean
      }
    }
  | { type: 'error'; data: { message: string; runId?: string } }

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
}

export const PRIORITY_ORDER: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}
