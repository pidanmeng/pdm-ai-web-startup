import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_ORIGIN = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3101'
).replace(/\/+$/, '')

/**
 * Same-origin streaming bridge. The real implementation lives in Elysia
 * (`POST :3101/api/demo`); this route keeps the browser on `/api/demo` and
 * passes the SSE bytes through without buffering.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()

  let upstream: Response
  try {
    upstream = await fetch(`${API_ORIGIN}/api/demo`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        Accept: 'text/event-stream',
      },
      body,
      signal: request.signal,
      cache: 'no-store',
    })
  } catch {
    return Response.json(
      {
        error: 'API_UNAVAILABLE',
        message: 'AI 服务暂时不可达，请确认 Elysia 服务已在 3101 端口启动。',
      },
      { status: 502 },
    )
  }

  if (!upstream.ok || !upstream.body) {
    const payload = await upstream.text().catch(() => '')
    return new Response(payload || JSON.stringify({ error: 'UPSTREAM_ERROR' }), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
