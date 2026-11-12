import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'

import { env } from '../env'
import * as schema from './schema'

/**
 * Bun's native PostgreSQL client — no `pg`/`postgres.js` dependency.
 * Connections are opened lazily, so the API still boots when Postgres is down.
 */
export const sql = new SQL(env.databaseUrl, {
  max: 4,
  idleTimeout: 20,
  connectionTimeout: 5,
})

export const db = drizzle(sql, { schema })
