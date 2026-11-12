import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

import { env } from '../env'

/**
 * DeepSeek exposes an OpenAI-compatible chat-completions API. The compatible
 * provider (instead of `@ai-sdk/openai`) guarantees chat completions are used
 * rather than the OpenAI Responses API.
 */
const provider = createOpenAICompatible({
  name: 'deepseek',
  baseURL: env.llm.baseUrl.replace(/\/+$/, ''),
  apiKey: env.llm.apiKey || 'missing-api-key',
  includeUsage: true,
})

export const demoModel = provider.chatModel(env.llm.model)
