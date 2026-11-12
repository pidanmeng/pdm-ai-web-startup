import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime'
import type { NextRequest } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const apiKey = process.env.LLM_API_KEY?.trim() ?? ''
const baseURL = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'
const model = process.env.LLM_MODEL ?? 'deepseek-flash'

export async function POST(request: NextRequest) {
  if (!apiKey) {
    return Response.json(
      { error: 'LLM_NOT_CONFIGURED', message: 'CopilotKit 缺少 LLM_API_KEY。' },
      { status: 503 },
    )
  }

  // CopilotKit 1.50's built-in BasicAgent reads the OpenAI SDK env vars when
  // it turns the service adapter into a model. Point them at DeepSeek so the
  // agent never falls back to api.openai.com.
  process.env.OPENAI_API_KEY = apiKey
  process.env.OPENAI_BASE_URL = baseURL

  const openai = new OpenAI({ apiKey, baseURL })
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: new CopilotRuntime(),
    serviceAdapter: new OpenAIAdapter({
      openai,
      model,
      keepSystemRole: true,
    }),
    endpoint: '/api/copilotkit',
  })

  return handleRequest(request)
}
