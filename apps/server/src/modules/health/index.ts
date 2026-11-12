import { Elysia, t } from 'elysia'

import { sql } from '../../db'
import { env } from '../../env'

const bootedAt = Date.now()

async function checkDatabase(): Promise<'up' | 'down'> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      sql`select 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('database health check timed out')), 1500)
      }),
    ])
    return 'up'
  } catch {
    return 'down'
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const health = new Elysia({ name: 'health.controller' }).get(
  '/health',
  async () => ({
    status: 'ok' as const,
    database: await checkDatabase(),
    llm: env.llm.configured ? ('configured' as const) : ('missing-key' as const),
    model: env.llm.model,
    uptimeMs: Date.now() - bootedAt,
    timestamp: new Date().toISOString(),
  }),
  {
    response: {
      200: t.Object({
        status: t.Literal('ok'),
        database: t.Union([t.Literal('up'), t.Literal('down')]),
        llm: t.Union([t.Literal('configured'), t.Literal('missing-key')]),
        model: t.String(),
        uptimeMs: t.Number(),
        timestamp: t.String(),
      }),
    },
    detail: {
      tags: ['System'],
      summary: '服务健康检查',
    },
  },
)
