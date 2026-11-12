function readNumber(name: string, fallback: number): number {
  const raw = Bun.env[name]
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number`)
  return value
}

const apiKey = Bun.env.LLM_API_KEY?.trim() ?? ''

export const env = {
  nodeEnv: Bun.env.NODE_ENV ?? 'development',
  port: readNumber('PORT', 3101),
  host: Bun.env.HOST ?? '0.0.0.0',
  corsOrigins: (Bun.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl:
    Bun.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/xs_ai_platform',
  llm: {
    baseUrl: Bun.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey,
    model: Bun.env.LLM_MODEL ?? 'deepseek-flash',
    configured: apiKey.length > 0,
  },
} as const

export function assertLlmConfigured(): void {
  if (!env.llm.configured) {
    throw new Error('LLM_API_KEY is not configured. Copy apps/server/.env.example to .env first.')
  }
}
