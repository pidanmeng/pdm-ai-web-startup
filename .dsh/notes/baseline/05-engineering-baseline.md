# 05 · 工程约束、Baseline 与开发流水线

> 这份文档回答两个问题：**怎么让 AI（和人）持续写出符合本项目质量的代码**，以及**怎么证明它一直符合**。
> 核心观点：提示词是"默认值"，不是"保证"。真正兜底的是**可执行的检查 + 小步提交 + 可回滚**。凡是不能写成 lint / 测试 / CI 门禁的规则，最终都会腐烂。
>
> **阅读提示**：§1–§14 是通用方法论（部分仍为草案）；**§15 是本仓库当前实际执行的工作约定**（2026-11-13 起）。两者冲突时以 §15 为准。

---

## 1. 为什么大多数"项目提示词"会失效

| 失效原因 | 现象 | 对策 |
|---|---|---|
| 规则不可判定 | 写了"代码要优雅""注意安全"，模型无法执行 | 只写可判定的规则（"金额用整数分""所有查询必须带 tenantId"） |
| 规则膨胀 | AGENTS.md 写到 800 行，关键约束被淹没 | 根文件 ≤ 150 行，细节下沉到子目录与 docs，按需加载 |
| 上下文漂移 | 模型没读到 schema 就编字段 | 任务模板强制"先读哪些文件"，并在 prompt 里给路径 |
| 无验收 | 模型说"已完成"，其实没跑测试 | 要求贴命令与输出；CI 兜底 |
| 多处重复 | Cursor/Claude/Copilot 各一份规则，互相矛盾 | 单一事实源（AGENTS.md），其他文件只引用 |
| 只约束生成不约束评审 | 烂代码照样合入 | 评审清单 + CODEOWNERS + 自动化门禁 |

一句话：**提示词负责"让模型第一次就做对"，流水线负责"做错了进不来"。**

---

## 2. 五层约束体系

```
L0 项目宪法      docs/engineering/constitution.md     10–15 条不可协商的不变式
L1 根提示词      AGENTS.md                             技术栈、目录、命令、DoD、禁区（≤150 行）
L2 目录提示词    apps/server/AGENTS.md 等               分层约定、模块模板、错误处理（每份 ≤80 行）
L3 任务模板      .dsh/prompts/*.md                      功能/修 bug/评审/迁移的标准作业流
L4 编辑器规则    .cursor/rules/*.mdc、copilot-instructions.md   按 glob 命中，内容引用 L0/L1
L5 自动化门禁    eslint / tsc / test / CI              把规则变成"过不去就是过不去"
```

### 2.1 文件布局

```
/
├── AGENTS.md                         # 唯一事实源，所有工具都读它
├── CLAUDE.md -> AGENTS.md             # 软链，避免两份
├── .github/copilot-instructions.md   # 一段话 + 指向 AGENTS.md
├── .dsh/skills/
│   ├── feature.md
│   ├── bugfix.md
│   ├── review.md
│   └── migration.md
├── apps/server/AGENTS.md
├── apps/web/AGENTS.md
└── packages/shared/AGENTS.md
```

规则：**任何规则只能有一份完整表述**，其他位置用链接引用。CI 检查链接可达（防止重构后变成死链）。

### 2.2 每层写什么 / 不写什么

| 层 | 写 | 不写 |
|---|---|---|
| L0 宪法 | 数据隔离、金额/时间/ID 约定、AI 输出必须结构化、写操作必须审计、迁移只前滚 | 具体函数怎么写、组件用什么库 |
| L1 根 | 技术栈与版本、目录地图、常用命令、DoD、5–8 条硬禁区 | 业务规则、长示例 |
| L2 目录 | 模块四件套（controller/service/model/repository）、错误码用法、依赖方向 | 项目级约定（已在 L1） |
| L3 任务 | 输入、必读文件、步骤、验收命令、输出格式 | 架构决策 |
| L4 编辑器 | 按文件类型的最小提醒 | 与 L1 重复的大段内容 |

---

## 3. L0 项目宪法（草案）

`docs/engineering/constitution.md` 的 12 条，每条都配有检查方式：

| # | 不变式 | 检查方式 |
|---|---|---|
| C1 | 所有业务表、查询、缓存键必须带 `tenant_id`，跨租户访问必须拒绝 | RLS + repository 单测 + 越权集成测试 |
| C2 | 请求上下文中的租户只能来自会话，不能来自 body/query/header | 代码评审 + 自定义 lint（禁止 `ctx.body.tenantId`） |
| C3 | 所有 AI 输出必须经过 Schema 校验后才能落库；校验失败重试 ≤ 2 次后报错 | 运行时校验 + 失败用例测试 |
| C4 | 判分结果与交付文本分离存储；文本重生成不得修改分数 | 表结构 + 集成测试 |
| C5 | 写操作必须写审计日志（谁、何时、对什么、改前改后） | 审计中间件 + 测试断言 |
| C6 | 金额用整数分，分数用 `numeric(5,1)`，时间存 UTC | DB 类型 + lint（禁止 float 金额） |
| C7 | 数据库迁移只前滚、可重复执行；禁止修改已合入的迁移文件 | CI 检查迁移文件哈希 |
| C8 | 密钥、手机号、答卷原文不得出现在日志、错误上报、前端 bundle | secretlint + 日志脱敏测试 + bundle 扫描 |
| C9 | 长任务必须异步（202 + 任务 id），禁止在 HTTP 请求内跑完 | 接口评审 + 超时测试 |
| C10 | 所有外部调用（小鹅通/微信/模型/OCR）必须可重试、可熔断、有超时 | 网关封装 + 故障注入测试 |
| C11 | 接口以 OpenAPI 为契约，前端类型由 Eden 生成，禁止手写 DTO | OpenAPI 快照 + 类型检查 |
| C12 | 页面可见性与功能权限独立校验；后端不信任前端 | 权限矩阵快照测试 |

> 宪法变更需要 ADR（`docs/engineering/decisions/`）+ 两人评审。

---

## 4. L1 根 AGENTS.md（可直接落地的草稿）

```markdown
# AGENTS.md

本项目是公务员遴选教培的 AI SaaS 中台（多租户）。开始任何任务前，先读
`docs/engineering/constitution.md` 与 `docs/requirements/README.md`。

## 技术栈（不要擅自替换）
- Web: Next.js 15 App Router + React 19 + Tailwind 4 + shadcn/ui + Zustand + CopilotKit + AI SDK 5
- API: Elysia 1.x (Bun) + TypeBox `t` + Drizzle ORM + PostgreSQL 16 + pgvector + pg-boss
- 共享: `packages/shared`（Zod/TypeBox 模型、纯函数、页面注册表）
- 包管理: bun（`bun install`），禁止混用 npm/yarn 产生第二份 lockfile

## 目录
apps/web/src/app        路由（RSC 优先）
apps/web/src/components 业务组件（ui/ 为 shadcn 生成物，不要改）
apps/server/src/modules 每个领域一个目录：index.ts(controller) / service.ts / model.ts / prompt.ts
apps/server/src/db      schema.ts、repository、seed
packages/shared/src     跨端类型与纯函数
docs/                   需求、ADR、runbook

## 命令（提交前必须全绿）
bun run typecheck && bun run test && bun run lint
bun run db:generate   # 改 schema 后
bun run openapi:check # 改接口后

## 硬规则
1. 查询必须经 repository，且显式传 tenantId；禁止在 controller 里拼 SQL。
2. 外部输入（body/query/params）一律用 TypeBox 校验；禁止 `any`、`as unknown as`。
3. AI 调用统一走 `lib/llm.ts` 网关；禁止在 web 侧持有模型 Key。
4. AI 输出必须用 Schema 校验；失败重试 2 次后抛 `AI_OUTPUT_INVALID`。
5. 金额整数分；时间 UTC；ID 用 uuid v7。
6. 写操作加审计，长任务用队列（202 + jobId）。
7. 密钥只从环境/KMS 读；禁止硬编码、禁止打印。
8. 不新增依赖，除非在 PR 说明理由与替代方案。
9. 不改 `apps/web/src/components/ui/**`、不改已合入的迁移文件。
10. 一个 PR 只做一件事，变更 ≤ 400 行（生成物除外）。

## 完成定义（DoD）
- [ ] 类型、lint、单测通过；新增逻辑有测试
- [ ] 接口变更已更新 OpenAPI 快照；DB 变更已生成迁移
- [ ] 错误路径有处理（不是 catch 后吞掉）
- [ ] 日志无 PII、无密钥；关键路径有 traceId
- [ ] 权限点、审计、租户隔离已考虑
- [ ] PR 描述含：改了什么 / 为什么 / 怎么验证 / 怎么回滚

## 遇到不确定
先读代码与文档；仍不确定就列出 2–3 个方案与风险，停下来问，不要猜字段、猜接口。
```

**写作要求**：每条规则都要能被"看一眼代码"判定；用"必须/禁止"而不是"尽量/建议"；给路径而不是给形容词。

---

## 5. L2 目录级提示词（要点）

**`apps/server/AGENTS.md`**

- 模块四件套职责：controller 只做校验/状态码/组装；service 不碰 Elysia Context；model 是唯一 Schema 来源；repository 是唯一 SQL 出口。
- 依赖方向：`controller → service → repository`，禁止反向；跨模块调用走 service，不直接查对方的表。
- 错误：抛领域错误（`NotFoundError`/`ConflictError`），由全局 handler 映射错误码；禁止 `catch {}`。
- 事务：跨表写用 `db.transaction`；外部调用（LLM）不要放在事务里。
- 幂等：写接口读 `Idempotency-Key`；重复请求返回首次响应。

**`apps/web/AGENTS.md`**

- 默认 Server Component；需要状态/事件才 `'use client'`，且放在叶子节点。
- 服务端取数用 server client；客户端走同源 `/api` BFF；不要在组件里直连 Elysia。
- Zustand 只存 UI 临时态；服务端数据不进 store。
- 表格/表单/弹层用统一封装（DataTable/FormDialog），不重复造。
- 所有可见文案中文；日期按 `Asia/Shanghai` 展示；空态/错态/加载态必须实现。

**`packages/shared/AGENTS.md`**

- 只放纯函数与类型，禁止引入 Node/DOM 依赖。
- 任何被前后端共用的解析逻辑必须有单测（容错用例优先）。

---

## 6. 把规则变成检查：映射表

| 规则 | 强制手段 | 失败表现 |
|---|---|---|
| 分层依赖（controller 不能直接 SQL） | `eslint-plugin-boundaries` 或 dependency-cruiser | CI 红 |
| 禁止 `any` / 非空断言滥用 | `tsc --noEmit` + `@typescript-eslint/no-explicit-any` | CI 红 |
| 查询必须带 tenantId | repository 只暴露 `withTenant(ctx)`；集成测试覆盖越权 | 测试红 |
| 禁止前端引模型 SDK | `no-restricted-imports`（`apps/web` 禁 `openai`/`@ai-sdk/*` 服务端包） | CI 红 |
| 禁止密钥入库/入日志 | secretlint + 日志脱敏单测 + 启动时扫描 | CI 红 / 启动失败 |
| AI 输出结构化 | 运行时 Schema 校验 + 失败 fixture 测试 | 测试红 |
| 审计必写 | 审计中间件 + 集成测试断言 `audit_logs` 行数 | 测试红 |
| 迁移安全 | 自写脚本：检测 `DROP TABLE/COLUMN`、`ALTER TYPE`、无 `CONCURRENTLY` 的大索引；迁移文件哈希不可变 | CI 红 |
| OpenAPI 契约 | 生成 `openapi.json` 与快照 diff；破坏性变更需 `breaking` 标签 | CI 红 |
| 权限矩阵 | 导出"角色 × 接口"快照，变更必须显式更新 | 测试红 |
| 覆盖率 | `bun test --coverage`，server ≥ 70%，service ≥ 85% | CI 红 |
| 依赖体积 | `size-limit`（web 首屏 JS ≤ 250KB gzip） | CI 红（警告起步） |
| PR 规模 | CI 统计 diff 行数，> 400 行提示拆分 | 警告 + 评审拒绝 |

> 原则：**一条规则如果没有检查，就不要写进 AGENTS.md**——它只会稀释真正重要的约束。反过来，检查报错的信息要写"怎么改"，而不是只报"不允许"。

---

## 7. L3 任务模板（示例：功能开发）

`.dsh/prompts/feature.md`

```markdown
# 功能开发

## 输入
- 需求链接 / 页面或接口名
- 涉及的角色与权限

## 开始前（必须）
0. 先在 `.dsh/notes/features/` 写需求文档 + 开发计划（模板见该目录 README），确认后才动代码
1. 读 `.dsh/notes/baseline/` 下相关章节与既有功能文档
2. 找到对应模块，读现有 controller/service/repository 与 schema
3. 用 3 行复述：要改哪些文件、数据怎么流、失败怎么处理
4. 列出不确定点，先问，不要猜

## 步骤
1. 先写/改 model（Schema）与迁移
2. 写 repository（含 tenant 过滤）与单测
3. 写 service（编排、错误、幂等）与单测
4. 写 controller（权限声明、状态码）与契约测试
5. 写前端（RSC 优先；空/错/加载态）
6. 跑：typecheck / test / lint / openapi:check
7. 更新功能文档（`.dsh/notes/features/`）
8. 提交前 CR，报告写 `.dsh/notes/codereviews/`，结论为"通过"才提交

## 输出
- 改动清单（文件 + 一句话）
- 验证命令与真实输出
- 风险与回滚方式
- 未完成项（如有）与原因

## 禁止
- 顺手重构无关代码
- 新增依赖不说明
- 用 mock 绕过被测逻辑
- 声称"已测试"但没有命令输出
```

对应地，`bugfix.md` 要求"先写复现测试，再修"；`review.md` 要求按第 10 节清单逐条给结论；`migration.md` 要求"前滚方案 + 回滚方案 + 数据影响面"。

---

## 8. Baseline：先量化，再谈提升

### 8.1 建立顺序

1. **冻结现状**：给当前 Demo 打 tag `v0-baseline`，记录构建时间、包体积、测试数、覆盖率。
2. **选 3 条最痛的规则**先自动化（建议：tenant 隔离、AI 输出校验、密钥/PII 扫描）。
3. **建 AI 评测集**（见 8.3），这是本项目最特殊的基线。
4. **上 CI 门禁**，让"退步"无法合入。
5. **每月复盘**：哪些规则被绕过、哪些检查误报、哪些指标没达标。

### 8.2 五类基线指标

| 类别 | 指标 | 目标（MVP） | 采集方式 |
|---|---|---|---|
| 代码 | TS 严格模式、`any` 数、循环复杂度 | strict；`any`=0；函数 ≤ 50 行 | tsc + eslint |
| 测试 | 行覆盖率（server/service/web） | 70% / 85% / 60% | coverage 报告 |
| 测试 | 关键路径集成测试（**本项目不写 e2e**） | 关键 API 契约 + 状态机用例全绿 | `bun run test` |
| 性能 | 列表 P95 / 详情 P95 / SSE 首字节 | 300ms / 500ms / 1s | 压测 + APM |
| 性能 | 100 份批改耗时（并发 8） | ≤ 15 分钟 | 基准脚本 |
| 安全 | 越权用例、租户隔离用例 | 100% 通过 | 集成测试 |
| 安全 | 高危依赖漏洞 | 0 | audit |
| AI | 总分 MAE（vs 人工共识） | ≤ 3 分（百分制） | 评测流水线 |
| AI | 采分点命中 F1 | ≥ 0.90 | 评测流水线 |
| AI | ±2 分一致率 | ≥ 85% | 评测流水线 |
| AI | 同卷重复批改标准差 | ≤ 1.5 分 | 评测流水线 |
| AI | 交付文本事实一致性 | 100% | 规则校验 |
| AI | 人工一次通过率 | ≥ 85% | 生产统计 |
| AI | 单份成本 / P95 延迟 | ≤ 0.3 元 / ≤ 60s | usage 日志 |
| 业务 | 场次按时交付率 | ≥ 95% | 生产统计 |

### 8.3 AI 质量基线怎么做（重点）

**第一步：建评测集（Golden Set）**

- 取 3–5 场真实考试、共 80–120 份答卷，覆盖：高分/中等/低分、字迹差、跑题、空白、超长。
- 3 位教研独立打分，分歧 > 3 分的题拉齐口径，形成"共识分 + 共识采分点"。
- 脱敏后存 `fixtures/eval/`（原文、评分要点、共识结果、模型输出快照），纳入版本管理。
- 评测集**只增不减**；每次线上发现错判，抽取成新样本（回归样本）。

**第二步：定义可自动化的指标**

| 指标 | 计算 | 说明 |
|---|---|---|
| 总分 MAE | `mean(abs(ai - human))` | 最直观 |
| 采分点 F1 | 以 `(question, rubric_item, hit)` 为集合 | 比总分更能定位问题 |
| 一致率 | `\|ai-human\| ≤ 2` 的占比 | 业务可感知 |
| 稳定性 | 同卷跑 3 次的标准差 | 低温度 + 固定种子后应很小 |
| 事实一致性 | 脚本抽取交付文本中的分数/题号，与 `grades` 比对 | 必须 100% |
| 格式合规 | 标题层级、字数区间、禁用词 | 规则可判 |
| 成本/延迟 | usage 日志聚合 | 防止"效果好了但用不起" |

**第三步：评测流水线**

- 夜间跑全量评测（固定 prompt 版本 + 模型），产出 HTML 报告：总体指标、分题型、badcase Top 20。
- PR 修改 prompt / 模型 / 解析逻辑时，触发"小评测"（20 份），指标下降超阈值则阻断合并。
- Prompt 发布走灰度：10% 场次用新版本，对比 3 天指标，再全量。
- 评测结果写入 `prompt_versions.eval_score`，发布页可见。

**第四步：线上闭环**

- 审核员的每次"驳回 + comment"是免费标注：按 `category` 统计错判类型，周会看 Top 3。
- 每周抽样 20 份已通过结果人工复核，计算"漏检率"。
- 错判样本回流评测集，形成"越用越准"的闭环。

> 注意：**不要用"AI 评审 AI"当唯一标准**。人工共识是锚，模型只是被测对象。

---

## 9. 开发流水线（从提交到上线）

```
本地                 PR                        合并                    生产
────                 ──                        ────                    ────
pre-commit           lint / typecheck          GitHub 门禁 + 迁移      Vercel 灰度 5%→25%→100%
format+secretlint    unit + integration        AI 小评测               观察 30min
                     build                     Preview 冒烟            指标异常 → Instant Rollback
                     openapi diff
                     Vercel Preview 部署
                     security scan
                     人工评审（CODEOWNERS）
```

### 9.1 门禁清单（必须全绿才能合并）

1. `format:check`
2. `lint`（含 boundaries、no-explicit-any）
3. `typecheck`
4. `test` + 覆盖率阈值
5. 集成测试（PG + 迁移 + 关键 API 契约）
6. `openapi:check`（无未声明的破坏性变更）
7. `migration:check`（无破坏性 SQL、哈希未变）
8. `secretlint` / `audit`
9. preview 部署 + 冒烟（健康检查、登录、关键只读接口；不跑 e2e）
10. 人工评审：至少 1 名 owner；涉及权限/支付/AI Prompt 需 2 人

> 部署入口统一走 Vercel（详见 04 篇 §3）：PR → Preview 部署，`main` → Production；数据库迁移由 GitHub Actions 单独执行（需人工 approve），**不放在 Vercel build 里**。

### 9.2 分支与提交

- 主干开发 + 短生命周期分支（< 2 天）；禁止长期 feature 分支。
- 提交信息：`type(scope): 描述`（feat/fix/refactor/test/docs/chore）。
- 一个 PR 一件事；重构与功能分开；迁移与代码同 PR 但独立 commit。
- 合并用 squash，保留 PR 号，便于回溯。

### 9.3 发布策略

- 每周固定发布窗口 + 紧急 hotfix 通道。
- 生产变更必须可回滚：Vercel Instant Rollback、迁移向前兼容、开关（feature flag）。
- 高风险功能（新模型、新 Prompt、批量重批）默认关闭，按租户/场次灰度。
- 发布后 30 分钟观察：5xx、LLM 失败率、队列积压、成本突增；异常自动回滚。

---

## 10. 评审清单（人 + AI 共用）

**正确性**

- [ ] 状态机流转是否覆盖非法路径（未确认要点能批改吗？重复分配会怎样？）
- [ ] 幂等：重复提交/重复回调/重试会不会产生两份数据或两次扣费？
- [ ] 并发：两人同时审同一卷、同时触发重生成，会怎样？
- [ ] 失败：模型超时、输出不合规、上游 500，用户看到什么？能重试吗？

**数据与安全**

- [ ] 每个查询都带 tenant 吗？有没有从 body 取 tenant？
- [ ] 权限点声明了吗？数据范围（assigned/self）在 repository 里生效吗？
- [ ] 日志/错误上报有没有 PII、密钥、答卷原文？
- [ ] 上传有没有类型/大小/数量限制？下载链接是否短时签名？

**AI 特有**

- [ ] 输出是否结构化校验？失败是否可重试、可降级？
- [ ] 面向用户的 AI 交互是否流式（`streamText` / SSE）？有没有"等完整结果再渲染"？
- [ ] 结构化输出是否用 CopilotKit Generative UI 渲染，且组件只消费过 Schema 的数据？
- [ ] Prompt 改动是否跑了评测？badcase 有没有回归样本？
- [ ] 成本：token 上限、重试次数、缓存策略是否明确？
- [ ] 交付文本里的分数/题号是否来自结构化数据，而非模型编造？

**工程**

- [ ] 有没有复制粘贴出第二套实现？
- [ ] 有没有 `catch {}`、`any`、`@ts-ignore`？
- [ ] 测试是真的在测逻辑，还是 mock 掉了被测对象？
- [ ] 文档/OpenAPI/迁移是否同步？回滚方式写了吗？

---

## 11. AI 生成代码的常见反模式（写进评审清单）

| 反模式 | 表现 | 处理 |
|---|---|---|
| 幻觉字段/接口 | 用了 schema 里不存在的列、编了不存在的 API | 强制"先读 schema"，CI 类型检查兜底 |
| 绕过封装 | controller 里直接写 SQL、前端直连模型 | boundaries lint + 评审 |
| 假测试 | `expect(true).toBe(true)`、把被测函数 mock 掉 | 覆盖率 + 变异测试（可选）+ 评审 |
| 过度抽象 | 一个用例造一套框架/插件系统 | 明确"三个重复再抽象" |
| 静默失败 | `catch (e) {}`、失败返回空数组 | 错误处理规范 + 测试失败路径 |
| 顺手重构 | 功能 PR 里改格式、改目录 | PR 规模门禁 + 评审拒绝 |
| 依赖膨胀 | 为一个小功能引入大库 | 依赖需说明 + size-limit |
| 假完成 | 说"已测试"但没跑命令 | 要求贴输出；CI 兜底 |

---

## 12. Prompt 资产本身的治理（Prompt as Code）

Prompt 是本产品的核心资产，不能散落在代码字符串里：

1. **双存储**：仓库内 `prompts/*.md` 为源（可 review、可 diff），构建时同步到 `prompt_versions` 表；线上以 DB 版本为准，支持热更新与回滚。
2. **版本化**：每次修改 = 新版本；发布需评测通过 + 人工确认；旧版本归档可回滚。
3. **变量契约**：模板变量在 `output_schema` 与代码中双向校验，缺变量启动即报错。
4. **输出 Schema**：判分/解析类 Prompt 必须绑定 JSON Schema，运行时校验。
5. **评测绑定**：每个 Prompt 版本记录 `eval_score` 与评测报告链接；低于基线禁止发布。
6. **变更审计**：谁、何时、改了什么、影响了哪些场次，全部可查。

---

## 13. 落地节奏（4 周）

| 周 | 事项 | 产出 |
|---|---|---|
| W1 | 写宪法 + 根 AGENTS.md + 目录提示词；冻结 v0 基线 | 规则文件、基线报告 |
| W2 | 把 3 条硬规则变成检查（tenant、AI 输出、密钥/PII）；搭 CI 骨架 | lint/test/CI 全绿 |
| W3 | 建 Golden Set（80 份）+ 评测脚本 + 指标看板 | 首份评测报告 |
| W4 | 上 PR 门禁 + 预览环境 + 评审清单；跑一次真实场次灰度 | 流水线跑通 |

之后每月：复盘指标、清理失效规则、补充 badcase、更新基线阈值。

---

## 14. 怎么判断约束有效

不要看"AGENTS.md 写得多好"，看这四个数：

1. **返工率**：合并后 7 天内被修复的缺陷数 / 合并 PR 数（目标 < 10%）。
2. **越权/隔离缺陷**：应为 0；出现一次就补一条自动化测试。
3. **AI 指标漂移**：评测集 MAE 是否随迭代上升；上升即回滚 Prompt/模型。
4. **评审返工点**：统计评审里重复出现的问题，前 3 类必须转成检查。

当"同一类问题第二次出现"时，正确的动作不是再写一条提示词，而是**加一条检查**。

---

## 15. 本项目工作约定（2026-11-13 起执行）

> 前文是通用方法论，本节是本仓库**实际执行**的约定。两者冲突时以本节为准（已同步修正 §7、§8.2、§9.1）。

### 15.1 笔记与文档位置

- 所有笔记、需求、开发计划、CR 报告统一放在 **`.dsh/notes/`**；不再新建 `docs/requirements`、`docs/engineering` 等目录。
- 目录与命名：

| 目录 | 放什么 | 命名 |
|---|---|---|
| `.dsh/notes/baseline/` | 现状基线：页面、接口、数据模型、部署、工程约束 | `01-pages.md` … `05-engineering-baseline.md` |
| `.dsh/notes/features/` | 新功能的需求文档 + 开发计划（一功能一文件） | `YYYYMMDD-<slug>.md` |
| `.dsh/notes/codereviews/` | 提交前的 CR 报告 | `YYYYMMDD-<slug>.md`，与功能文件同名 |
| `.dsh/notes/adr/`（按需） | 影响架构的决策记录 | `NNNN-<slug>.md` |

- 文档内互相引用用相对路径；涉及代码时给真实路径，不给"某文件"这类占位。
- `.dsh/` 目前在 `.gitignore` 中（本地资产）；需要随代码评审的结论，在提交信息或 PR 描述里贴 CR 报告结论摘要。

### 15.2 测试范围：不覆盖 e2e

- 自动化测试只做**单元 + 集成**（`bun run test`），**不写、不跑 e2e**，不引入 Playwright / Cypress。
- 关键路径用"API 契约测试 + 状态机集成测试"覆盖，不依赖浏览器；前端交互逻辑抽成纯函数或 hook 做单测。
- 手工验收步骤写进功能文档的"验收标准"，由人执行并在 CR 报告里记录结果。

### 15.3 新功能流程（强制顺序）

1. **需求文档**：背景、目标/非目标、用户故事、流程与状态、范围边界、验收标准。
2. **开发计划**：改动文件清单、数据/接口变更、任务拆解与顺序、验证命令、风险与回滚。
3. 两份内容写进 `.dsh/notes/features/YYYYMMDD-<slug>.md`（模板见该目录 README），**确认后才动代码**。
4. 实现顺序沿用 §7：model/迁移 → repository → service → controller → 前端。
5. 自测：`bun run typecheck && bun run test && bun run lint`；改 schema 加 `bun run db:generate`，改接口加 `bun run openapi:check`。
6. **CR**：按 §10 清单逐条评审，报告写 `.dsh/notes/codereviews/YYYYMMDD-<slug>.md`；结论只能是"通过 / 有条件通过（列整改项）/ 驳回"。
7. 只有 CR 结论为"通过"（或有条件通过且整改项已闭环）才允许提交；提交信息 `type(scope): 描述`。

### 15.4 前端与 AI 的交互：默认流式 + Generative UI

**流式（默认）**

- 所有面向用户的 AI 交互——对话、解析、批改进度、文本生成——**必须流式**，不允许"转圈等完整 JSON 再渲染"。
- 服务端：AI SDK 5 `streamText()` + `toUIMessageStreamResponse()`；已有 SSE 透传写法见 `apps/server/src/modules/demo/service.ts` 与 `apps/web/src/app/api/demo/route.ts`（逐字推送、不缓冲）。
- 前端：优先 `useChat`；自定义流参考 `apps/web/src/lib/use-demo-stream.ts`（`ReadableStream` 逐块解析，含中止）。
- 长任务：202 + jobId 建任务，SSE 推进度；事件带 `id`，支持 `Last-Event-ID` 断线续传。
- 指标：SSE 首字节 ≤ 1s（§8.2）；失败要能重试并给出可读错误，不能静默重连。

**结构化内容（Generative UI）**

- AI 产出结构化结果（任务清单、评分要点、判分表、审核建议、语料命中）时，优先用 **CopilotKit Generative UI** 渲染，不自己拼 JSON 成长文本。
- 写法：`useCopilotAction({ name, parameters, render })` 用业务组件渲染；需要人工确认/编辑时用 `renderAndWaitForResponse`（Human-in-the-loop）。
- 组件只消费**已通过 Schema 校验**的数据；参数 Schema 与后端 Schema 同源（`packages/shared`），改一处两端同步。
- 运行时统一走 `apps/web/src/app/api/copilotkit/route.ts`；模型 Key 只在服务端（`apps/server/.env`），浏览器不持有。
- 批量、非交互的结果（如整场批改落库）可以返回结构化 JSON，但进入对话/工作台展示时必须转成 Generative UI 组件。

**禁止**

- 前端组件直连模型或持有 Key；在前端拼 prompt。
- 把整段 AI 输出 `JSON.parse` 后塞进一个 `<pre>`/长文本卡片。
- 为省事把流式改成一次性返回（性能或交互需要时，在功能文档里写明理由）。

### 15.5 约定 → 检查映射

| 约定 | 检查方式 |
|---|---|
| 不写 e2e | `package.json` 无 playwright/cypress；CI 不跑浏览器；测试目录无 e2e 用例 |
| 功能先有文档 | 提交前确认 `.dsh/notes/features/` 有对应文件，且含"验收标准 + 开发计划" |
| 提交前有 CR | `.dsh/notes/codereviews/` 有同名报告，结论为通过且阻塞项已关闭 |
| 流式 | CR 检查项：新增 AI 路由是否 `streamText`/SSE；是否存在一次性全量返回 |
| Generative UI | CR 检查项：结构化输出是否有 CopilotKit action + render 组件，参数是否过 Schema |

> 这五条里，"不写 e2e"和"文档/CR 先行"是流程约束，靠提交前自检与 CR 报告兜底；"流式"和"Generative UI"是代码约束，写进 §10 评审清单逐条勾选。
