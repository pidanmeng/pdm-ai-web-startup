import { t, type UnwrapSchema } from 'elysia'

const priority = t.Union([t.Literal('high'), t.Literal('medium'), t.Literal('low')])

const todo = t.Object({
  id: t.String(),
  title: t.String(),
  detail: t.String(),
  priority,
  position: t.Number(),
})

const runSummary = t.Object({
  id: t.String({ format: 'uuid' }),
  goal: t.String(),
  model: t.String(),
  status: t.Union([t.Literal('streaming'), t.Literal('completed'), t.Literal('failed')]),
  todoCount: t.Number(),
  latencyMs: t.Union([t.Number(), t.Null()]),
  createdAt: t.String(),
  completedAt: t.Union([t.String(), t.Null()]),
})

const apiError = t.Object({
  error: t.String(),
  message: t.String(),
})

const streamEvent = t.Object({
  type: t.String(),
  data: t.Unknown(),
})

export const DemoModel = {
  createBody: t.Object(
    {
      goal: t.String({
        minLength: 2,
        maxLength: 200,
        description: '备考目标，例如「三个月通过省直机关遴选」',
      }),
    },
    { additionalProperties: false },
  ),
  runIdParams: t.Object({
    id: t.String({ format: 'uuid', description: 'Demo run id' }),
  }),
  todo,
  runSummary,
  runDetail: t.Composite([
    runSummary,
    t.Object({ rawOutput: t.Union([t.String(), t.Null()]), todos: t.Array(todo) }),
  ]),
  apiError,
  streamEvent,
} as const

export type DemoModel = {
  [key in keyof typeof DemoModel]: UnwrapSchema<(typeof DemoModel)[key]>
}
