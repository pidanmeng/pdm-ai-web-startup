import { afterAll, describe, expect, it } from 'bun:test'

import { sql } from '../src/db'
import { app } from '../src/app'

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init)
}

afterAll(async () => {
  await sql.end().catch(() => undefined)
})

describe('Elysia app', () => {
  it('serves the API index', async () => {
    const response = await app.handle(request('/'))
    expect(response.status).toBe(200)

    const body = (await response.json()) as { demo: string }
    expect(body.demo).toBe('POST /api/demo')
  })

  it('returns a friendly 422 for an empty goal', async () => {
    const response = await app.handle(
      request('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: '' }),
      }),
    )

    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.message).toContain('2–200')
  })

  it('returns 404 for unknown routes', async () => {
    const response = await app.handle(request('/api/does-not-exist'))
    expect(response.status).toBe(404)
  })

  it('publishes the demo endpoints in OpenAPI', async () => {
    const response = await app.handle(request('/openapi/json'))
    expect(response.status).toBe(200)

    const body = (await response.json()) as { paths: Record<string, unknown> }
    expect(body.paths['/api/demo']).toBeDefined()
    expect(body.paths['/api/demo/runs/{id}']).toBeDefined()
  })

  it('lists archives without throwing when the database is available', async () => {
    const response = await app.handle(request('/api/demo/runs'))
    expect(response.status).toBe(200)

    const body = (await response.json()) as unknown
    expect(Array.isArray(body)).toBe(true)
  })
})
