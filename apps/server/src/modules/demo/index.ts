import { Elysia, t, status } from 'elysia'

import { DemoRepository } from '../../db/demo-repository'
import { env } from '../../env'
import { DemoModel } from './model'
import { DemoService } from './service'

export const demo = new Elysia({ name: 'demo.controller' })
  .post(
    '/demo',
    ({ body, request }) => {
      if (!env.llm.configured) {
        return status(503, {
          error: 'LLM_NOT_CONFIGURED',
          message: 'LLM_API_KEY 未配置，请先填写 apps/server/.env。',
        })
      }

      return DemoService.stream(body.goal, request.signal)
    },
    {
      body: DemoModel.createBody,
      detail: {
        tags: ['Demo'],
        summary: '流式拆解备考目标',
        description:
          '接收一个备考目标，以 Server-Sent Events 流式返回 AI 生成的任务清单。' +
          '事件类型：meta / delta / todos / done / error。',
      },
    },
  )
  .get(
    '/demo/runs',
    async () => {
      try {
        return await DemoRepository.recentRuns(8)
      } catch (error) {
        console.warn('[demo] history unavailable:', error)
        return []
      }
    },
    {
      response: {
        200: t.Array(DemoModel.runSummary),
      },
      detail: {
        tags: ['Demo'],
        summary: '最近 8 次拆解记录',
      },
    },
  )
  .get(
    '/demo/runs/:id',
    async ({ params }) => {
      let run
      try {
        run = await DemoRepository.findRun(params.id)
      } catch {
        return status(503, {
          error: 'DATABASE_UNAVAILABLE',
          message: '数据库暂时不可用，历史记录无法读取。',
        })
      }

      if (!run) {
        return status(404, {
          error: 'RUN_NOT_FOUND',
          message: '没有找到这条拆解记录。',
        })
      }

      return run
    },
    {
      params: DemoModel.runIdParams,
      response: {
        200: DemoModel.runDetail,
        404: DemoModel.apiError,
        503: DemoModel.apiError,
      },
      detail: {
        tags: ['Demo'],
        summary: '读取一次拆解记录（含任务清单）',
      },
    },
  )
