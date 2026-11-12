'use client'

import type { DemoRunDetail, DemoRunSummary, DemoStreamMeta, TodoItem } from '@xs/shared'
import { create } from 'zustand'

import { api } from '@/lib/api'

export type DemoStatus = 'idle' | 'streaming' | 'done' | 'error' | 'stopped'
export type DemoSource = 'live' | 'archive' | null

interface DemoState {
  goal: string
  status: DemoStatus
  source: DemoSource
  rawText: string
  todos: TodoItem[]
  checked: Record<string, boolean>
  meta: DemoStreamMeta | null
  error: string | null
  startedAt: number | null
  latencyMs: number | null
  persisted: boolean | null
  activeRunId: string | null

  history: DemoRunSummary[]
  historyLoading: boolean
  historyError: string | null

  setGoal: (goal: string) => void
  begin: (goal: string) => void
  appendDelta: (text: string) => void
  setTodos: (todos: TodoItem[]) => void
  setMeta: (meta: DemoStreamMeta) => void
  finish: (input: {
    runId: string
    todos: TodoItem[]
    latencyMs: number
    persisted: boolean
  }) => void
  fail: (message: string) => void
  markStopped: () => void
  hydrateRun: (run: DemoRunDetail) => void
  reset: () => void
  toggleTodo: (id: string) => void

  loadHistory: () => Promise<void>
  loadRun: (id: string) => Promise<boolean>
}

export const useDemoStore = create<DemoState>((set, get) => ({
  goal: '',
  status: 'idle',
  source: null,
  rawText: '',
  todos: [],
  checked: {},
  meta: null,
  error: null,
  startedAt: null,
  latencyMs: null,
  persisted: null,
  activeRunId: null,

  history: [],
  historyLoading: false,
  historyError: null,

  setGoal: (goal) => set({ goal }),

  begin: (goal) =>
    set({
      goal,
      status: 'streaming',
      source: 'live',
      rawText: '',
      todos: [],
      checked: {},
      meta: null,
      error: null,
      startedAt: Date.now(),
      latencyMs: null,
      persisted: null,
      activeRunId: null,
    }),

  appendDelta: (text) => set((state) => ({ rawText: state.rawText + text })),

  setTodos: (todos) =>
    set((state) => ({
      todos,
      checked: Object.fromEntries(todos.map((todo) => [todo.id, state.checked[todo.id] ?? false])),
    })),

  setMeta: (meta) => set({ meta, startedAt: Date.parse(meta.startedAt) || Date.now() }),

  finish: ({ runId, todos, latencyMs, persisted }) =>
    set((state) => ({
      status: 'done',
      rawText: state.rawText,
      todos,
      latencyMs,
      persisted,
      activeRunId: runId,
      checked: Object.fromEntries(todos.map((todo) => [todo.id, state.checked[todo.id] ?? false])),
    })),

  fail: (message) => set({ status: 'error', error: message }),

  markStopped: () => set((state) => (state.status === 'streaming' ? { status: 'stopped' } : state)),

  hydrateRun: (run) =>
    set({
      goal: run.goal,
      status: run.status === 'failed' ? 'error' : 'done',
      source: 'archive',
      rawText: run.rawOutput ?? '',
      todos: run.todos,
      checked: Object.fromEntries(run.todos.map((todo) => [todo.id, false])),
      meta: {
        runId: run.id,
        model: run.model,
        startedAt: run.createdAt,
      },
      error: run.status === 'failed' ? '这次生成没有完成，可以重新发起拆解。' : null,
      startedAt: Date.parse(run.createdAt) || null,
      latencyMs: run.latencyMs,
      persisted: true,
      activeRunId: run.id,
    }),

  reset: () =>
    set({
      goal: '',
      status: 'idle',
      source: null,
      rawText: '',
      todos: [],
      checked: {},
      meta: null,
      error: null,
      startedAt: null,
      latencyMs: null,
      persisted: null,
      activeRunId: null,
    }),

  toggleTodo: (id) =>
    set((state) => ({
      checked: { ...state.checked, [id]: !state.checked[id] },
    })),

  loadHistory: async () => {
    set({ historyLoading: true, historyError: null })
    try {
      const { data, error } = await api.api.demo.runs.get()
      if (error) throw new Error('读取归档失败')
      set({ history: data ?? [], historyLoading: false })
    } catch (error) {
      set({
        historyLoading: false,
        historyError: error instanceof Error ? error.message : '读取归档失败',
      })
    }
  },

  loadRun: async (id) => {
    set({ historyError: null })
    try {
      const { data, error } = await api.api.demo.runs({ id }).get()
      if (error || !data) throw new Error('读取记录失败')
      get().hydrateRun(data)
      return true
    } catch (error) {
      set({ historyError: error instanceof Error ? error.message : '读取记录失败' })
      return false
    }
  },
}))
