import type { TodoItem, TodoPriority } from './types'

const CHECKBOX_LINE = /^\s*[-*+]\s*\[[ xX]\]\s*(.+?)\s*$/
const BULLET_LINE = /^\s*(?:[-*+]|\d+[.、)])\s+(.+?)\s*$/
const PRIORITY_MAP: Record<string, TodoPriority> = {
  高: 'high',
  中: 'medium',
  低: 'low',
}

function cleanInline(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\d+[.、)]\s*/, '')
    .trim()
}

function splitPriority(value: string): { text: string; priority: TodoPriority | null } {
  let text = value
  let priority: TodoPriority | null = null

  // `标题（优先级：中）` or `标题（中）`
  const parenthesized = text.match(
    /\s*[（(]\s*(?:优先级\s*[:：]\s*)?(高|中|低)(?:\s*优先级)?\s*[）)]\s*$/u,
  )
  if (parenthesized?.[1]) {
    priority = PRIORITY_MAP[parenthesized[1]] ?? null
    text = text.slice(0, parenthesized.index).trim()
  }

  // `标题 | 说明 | 高` or `标题 | 说明 | 优先级：高`
  const segment = text.match(/(?:^|[|｜])\s*(?:优先级\s*[:：]\s*)?(高|中|低)(?:\s*优先级)?\s*$/u)
  if (!priority && segment?.[1]) {
    priority = PRIORITY_MAP[segment[1]] ?? null
    text = text
      .slice(0, segment.index)
      .replace(/[\s|｜,，;；:：-]+$/u, '')
      .trim()
  }

  return { text, priority }
}

/**
 * Parse a streamed Markdown checklist into structured TODOs.
 *
 * Primary shape (the prompt asks for exactly this):
 *   - [ ] 任务标题 | 可执行说明 | 高
 *
 * It is intentionally tolerant: missing detail, `优先级：高` labels, bold text,
 * full-width pipes, duplicated items and plain numbered bullets under a
 * `任务拆解` heading all work. That means partial streamed chunks can be parsed
 * continuously without special-casing a half-written line.
 */
export function parseTodos(markdown: string): TodoItem[] {
  const seen = new Set<string>()
  const todos: TodoItem[] = []

  function addTodo(body: string): void {
    const prioritySplit = splitPriority(body.trim())
    const segments = prioritySplit.text
      .split(/\s*[|｜]\s*/u)
      .map((segment) => cleanInline(segment))
      .filter(Boolean)

    if (segments.length === 0) return

    let title = segments[0] ?? ''
    let detail = segments.slice(1).join('；')

    // Fallback for `标题：说明` when the model ignores the pipe format.
    if (segments.length === 1 && title.length > 34 && /[:：]/u.test(title)) {
      const index = title.search(/[:：]/u)
      detail = title.slice(index + 1).trim()
      title = title.slice(0, index).trim()
    }

    if (title.length > 80) title = `${title.slice(0, 78)}…`
    if (!title || seen.has(title)) return
    seen.add(title)

    todos.push({
      id: `todo_${todos.length + 1}`,
      title,
      detail,
      priority: prioritySplit.priority ?? 'medium',
      position: todos.length + 1,
    })
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    const checkbox = line.match(CHECKBOX_LINE)
    if (checkbox?.[1]) addTodo(checkbox[1])
  }

  // Tolerant fallback: numbered/plain bullets inside the task section, used
  // only when the model ignored the requested checkbox syntax.
  if (todos.length === 0) {
    let inTaskSection = false
    for (const line of lines) {
      const heading = line.match(/^#{1,4}\s+(.+?)\s*$/)
      if (heading) {
        inTaskSection = /任务拆解|行动清单|执行清单|todo/i.test(heading[1] ?? '')
        continue
      }
      if (!inTaskSection) continue

      const bullet = line.match(BULLET_LINE)
      if (bullet?.[1]) addTodo(bullet[1])
    }
  }

  return todos
}

/** Pull a short section out of the streamed Markdown (used for the recap card). */
export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => {
    const match = line.match(/^#{1,4}\s+(.+?)\s*$/u)
    return match?.[1]?.includes(heading) ?? false
  })
  if (start === -1) return null

  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,4}\s+/.test(line)) break
    if (line.trim()) body.push(line.trim())
  }

  const text = body
    .join(' ')
    .replace(/[*_`>#]/g, '')
    .trim()
  return text || null
}
