'use client'

import { CopilotKit, useCopilotReadable } from '@copilotkit/react-core'
import { CopilotPopup } from '@copilotkit/react-ui'
import type { TodoItem } from '@xs/shared'

function CopilotContext({ goal, todos }: { goal: string; todos: TodoItem[] }) {
  useCopilotReadable(
    {
      description: '用户当前在 XS 遴选 AI 中台输入的备考目标',
      value: goal || '（尚未输入目标）',
    },
    [goal],
  )

  useCopilotReadable(
    {
      description: '当前 AI 拆解出的任务清单（含优先级和完成状态）',
      value: todos,
    },
    [todos],
  )

  return null
}

/**
 * Loaded dynamically (client-only) so the CopilotKit runtime bundle does not
 * block the demo's first paint.
 */
export function CopilotDock({ goal, todos }: { goal: string; todos: TodoItem[] }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false} enableInspector={false}>
      <CopilotContext goal={goal} todos={todos} />
      <CopilotPopup
        defaultOpen={false}
        clickOutsideToClose
        instructions="你是 XS 遴选 AI 中台的教研助手。请用中文回答，语气务实、具体，避免空泛鼓励。优先结合页面中用户当前的备考目标和任务清单给出建议；如果用户提出新的备考目标，先帮他判断层级、时间窗口和短板，再给出可执行步骤。"
        labels={{
          title: 'XS 教研助手',
          initial:
            '我是你的遴选教研助手。可以问我备考节奏、岗位选择、公文写作或面试准备；我也会参考你当前的目标和清单。',
          placeholder: '问问备考节奏、岗位选择或某个任务怎么落地…',
        }}
      />
    </CopilotKit>
  )
}
