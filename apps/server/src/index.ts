import { app } from './app'
import { env } from './env'

app.listen({ port: env.port, hostname: env.host }, () => {
  console.log(`\n  XS 遴选 AI 中台 · API`)
  console.log(`  ➜  http://localhost:${env.port}/api/health`)
  console.log(`  ➜  http://localhost:${env.port}/openapi`)
  console.log(`  ➜  model: ${env.llm.model}${env.llm.configured ? '' : ' (missing LLM_API_KEY)'}\n`)
})

export type { App } from './app'
