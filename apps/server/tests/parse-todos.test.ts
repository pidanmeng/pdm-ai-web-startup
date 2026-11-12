import { describe, expect, it } from 'bun:test'
import { extractSection, parseTodos } from '@xs/shared'

describe('parseTodos', () => {
  it('parses the prompt checklist format', () => {
    const todos = parseTodos(`
## 任务拆解
- [ ] 真题基线诊断 | 限时完成一套真题并归因 | 高
- [ ] 公文格式速查卡 | 整理 15 种法定公文 | 中
- [ ] 每日手速练习 | 每天 10 分钟 | 低
`)

    expect(todos).toHaveLength(3)
    expect(todos[0]).toMatchObject({
      title: '真题基线诊断',
      detail: '限时完成一套真题并归因',
      priority: 'high',
      position: 1,
    })
    expect(todos[2]?.priority).toBe('low')
  })

  it('is tolerant of bold text, full-width pipes and priority labels', () => {
    const todos = parseTodos(`
- [ ] **建立错题本** ｜ 按模块分类整理 ｜ 优先级：高
- [ ] 每周模考（优先级：中）
`)

    expect(todos).toHaveLength(2)
    expect(todos[0]?.title).toBe('建立错题本')
    expect(todos[0]?.detail).toBe('按模块分类整理')
    expect(todos[0]?.priority).toBe('high')
    expect(todos[1]?.title).toBe('每周模考')
    expect(todos[1]?.priority).toBe('medium')
  })

  it('parses partial streamed output and ignores duplicates', () => {
    const partial = '- [ ] 第一项 | 说明 | 高\n- [ ] 第一项 | 重复 | 高'
    const todos = parseTodos(partial)
    expect(todos).toHaveLength(1)
    expect(todos[0]?.id).toBe('todo_1')
  })

  it('falls back to numbered bullets inside the task section', () => {
    const todos = parseTodos(`
## 目标解读
先定节奏。

## 任务拆解
1. 真题诊断 | 限时完成一套真题 | 高
2. 公文模板 | 整理五种高频文种 | 中

## 今日起步
先做一套题。
`)
    expect(todos).toHaveLength(2)
    expect(todos[0]?.title).toBe('真题诊断')
    expect(todos[1]?.priority).toBe('medium')
  })

  it('does not treat ordinary bullets as tasks', () => {
    const todos = parseTodos(`
## 今日起步
- 读一份报告
- 写一页提纲
`)
    expect(todos).toHaveLength(0)
  })
})

describe('extractSection', () => {
  it('pulls a named markdown section', () => {
    const text = extractSection(
      `## 目标解读\n省直遴选以案例分析和公文写作为主。\n\n## 任务拆解\n- [ ] x`,
      '目标解读',
    )
    expect(text).toBe('省直遴选以案例分析和公文写作为主。')
  })

  it('returns null for a missing section', () => {
    expect(extractSection('## 目标解读\n内容', '今日起步')).toBeNull()
  })
})
