import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const demoRunStatus = pgEnum('demo_run_status', ['streaming', 'completed', 'failed'])

export const demoRuns = pgTable(
  'demo_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goal: text('goal').notNull(),
    model: varchar('model', { length: 80 }).notNull(),
    status: demoRunStatus('status').notNull().default('streaming'),
    rawOutput: text('raw_output'),
    todoCount: integer('todo_count').notNull().default(0),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('demo_runs_created_at_idx').on(table.createdAt)],
)

export const demoTodos = pgTable(
  'demo_todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => demoRuns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    detail: text('detail').notNull().default(''),
    priority: varchar('priority', { length: 16 }).notNull().default('medium'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('demo_todos_run_id_idx').on(table.runId)],
)

export const demoRunsRelations = relations(demoRuns, ({ many }) => ({
  todos: many(demoTodos),
}))

export const demoTodosRelations = relations(demoTodos, ({ one }) => ({
  run: one(demoRuns, {
    fields: [demoTodos.runId],
    references: [demoRuns.id],
  }),
}))

export type DemoRunRow = typeof demoRuns.$inferSelect
export type DemoTodoRow = typeof demoTodos.$inferSelect
