import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'

import { env } from './env'
import { demo } from './modules/demo'
import { health } from './modules/health'

const api = new Elysia({ prefix: '/api', name: 'api' }).use(health).use(demo)

export const app = new Elysia({ name: 'xs-api' })
  .use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  .use(
    openapi({
      path: '/openapi',
      documentation: {
        info: {
          title: 'XS 遴选 AI 中台 API',
          version: '0.1.0',
          description:
            '公务员遴选教培 AI SaaS 中台。当前提供流式学习目标拆解、任务清单归档与健康检查。',
        },
        tags: [
          { name: 'System', description: '服务状态' },
          { name: 'Demo', description: '流式任务拆解 Demo' },
        ],
      },
    }),
  )
  .onError(({ code, error, set }) => {
    const message = error instanceof Error ? error.message : '请求处理失败'

    if (code === 'VALIDATION') {
      set.status = 422
      return {
        error: 'VALIDATION_ERROR',
        message: /length|Expected string/i.test(message)
          ? '备考目标需为 2–200 个字符。'
          : '请求参数不合法，请检查后重试。',
      }
    }

    if (code === 'NOT_FOUND') {
      set.status = 404
      return {
        error: 'NOT_FOUND',
        message: '接口不存在',
      }
    }

    if (code === 'PARSE') {
      set.status = 400
      return {
        error: 'PARSE_ERROR',
        message: '请求体格式不正确',
      }
    }

    console.error('[api] unhandled error:', error)
    set.status = 500
    return {
      error: 'INTERNAL_ERROR',
      message: env.nodeEnv === 'production' ? '服务器内部错误' : message,
    }
  })
  .get(
    '/',
    () => ({
      name: 'XS 遴选 AI 中台 API',
      docs: '/openapi',
      health: '/api/health',
      demo: 'POST /api/demo',
    }),
    { detail: { tags: ['System'], summary: 'API 索引' } },
  )
  .use(api)

export type App = typeof app
