import { treaty } from '@elysiajs/eden'
import type { App } from '@xs/server/app'

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101').replace(
  /\/+$/,
  '',
)

export const api = treaty<App>(API_URL)

export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}
