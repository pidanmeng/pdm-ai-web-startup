import { asc, desc, eq } from 'drizzle-orm'

import type { DemoRunDetail, DemoRunSummary, TodoItem } from '@xs/shared'

import { db } from '.'
import { demoRuns, demoTodos, type DemoRunRow } from './schema'

function toSummary(row: DemoRunRow): DemoRunSummary {
  return {
    id: row.id,
    goal: row.goal,
    model: row.model,
    status: row.status,
    todoCount: row.todoCount,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

/**
 * Persistence boundary for demo runs. All methods throw on database errors;
 * callers decide whether persistence is best-effort (the demo still streams
 * when Postgres is unavailable).
 */
export abstract class DemoRepository {
  static async createRun(input: {
    id: string
    goal: string
    model: string
  }): Promise<DemoRunSummary> {
    const [row] = await db
      .insert(demoRuns)
      .values({
        id: input.id,
        goal: input.goal,
        model: input.model,
        status: 'streaming',
      })
      .returning()

    if (!row) throw new Error('Failed to create demo run')
    return toSummary(row)
  }

  static async completeRun(
    runId: string,
    input: { rawOutput: string; todos: TodoItem[]; latencyMs: number },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(demoRuns)
        .set({
          status: 'completed',
          rawOutput: input.rawOutput,
          todoCount: input.todos.length,
          latencyMs: input.latencyMs,
          completedAt: new Date(),
          error: null,
        })
        .where(eq(demoRuns.id, runId))

      await tx.delete(demoTodos).where(eq(demoTodos.runId, runId))

      if (input.todos.length > 0) {
        await tx.insert(demoTodos).values(
          input.todos.map((todo) => ({
            runId,
            title: todo.title,
            detail: todo.detail,
            priority: todo.priority,
            position: todo.position,
          })),
        )
      }
    })
  }

  static async failRun(runId: string, message: string): Promise<void> {
    await db
      .update(demoRuns)
      .set({ status: 'failed', error: message.slice(0, 500), completedAt: new Date() })
      .where(eq(demoRuns.id, runId))
  }

  static async recentRuns(limit = 8): Promise<DemoRunSummary[]> {
    const rows = await db
      .select()
      .from(demoRuns)
      .orderBy(desc(demoRuns.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50))

    return rows.map(toSummary)
  }

  static async findRun(runId: string): Promise<DemoRunDetail | null> {
    const [run] = await db.select().from(demoRuns).where(eq(demoRuns.id, runId)).limit(1)
    if (!run) return null

    const todos = await db
      .select()
      .from(demoTodos)
      .where(eq(demoTodos.runId, runId))
      .orderBy(asc(demoTodos.position))

    return {
      ...toSummary(run),
      rawOutput: run.rawOutput,
      todos: todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        detail: todo.detail,
        priority: todo.priority === 'high' || todo.priority === 'low' ? todo.priority : 'medium',
        position: todo.position,
      })),
    }
  }
}
