# XS 遴选 · AI SaaS 中台

面向公务员遴选教培的 AI SaaS 中台原型。第一个业务闭环：用户输入一个备考目标，AI 教研员通过 **SSE 逐字流式**拆解为 6–8 条可执行、可验收的任务，并自动归档到 PostgreSQL。

> 技术栈：Bun workspace · Next.js 15（App Router）· Elysia 1.4 · Drizzle ORM · PostgreSQL · OpenAPI · Eden Treaty · AI SDK 5 · Tailwind CSS 4 · shadcn/ui · Zustand · CopilotKit

## 预览

![首页](docs/preview-home.png)

![AI 工作台](docs/preview-workbench.png)

---

## 1. 快速开始

### 环境要求

- [Bun](https://bun.sh) `>= 1.2`
- Node.js `>= 20`（Next.js 使用）
- PostgreSQL `>= 15`，或 Docker

### 1）安装依赖

```bash
bun install
```

### 2）准备环境变量

```bash
bun run setup:env
```

会生成：

- `apps/server/.env`
- `apps/web/.env.local`

然后填写 `LLM_API_KEY`。默认使用 DeepSeek 的 OpenAI 兼容接口：

```dotenv
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-flash
```

> LLM 密钥仅存在于服务端。浏览器只访问 Next.js 的同源 `/api/demo`，由 Next.js 路由转发到 Elysia。

### 3）启动数据库

使用本机 PostgreSQL：

```bash
createdb xs_ai_platform
```

或使用 Docker：

```bash
bun run db:up
```

默认连接串（`apps/server/.env`）：

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xs_ai_platform
```

本机没有密码的 Postgres 可以改成：

```dotenv
DATABASE_URL=postgresql://<你的用户名>@localhost:5432/xs_ai_platform
```

### 4）执行迁移

```bash
bun run db:migrate
```

可选：插入一条示例归档，方便先看 UI。

```bash
bun run db:seed
```

### 5）启动开发环境

```bash
bun run dev
```

| 服务                 | 地址                                       |
| -------------------- | ------------------------------------------ |
| Web / Demo 页面      | http://localhost:3000/demo                 |
| 兼容别名             | http://localhost:3000/pages/demo → `/demo` |
| Next.js 同源流式入口 | `POST http://localhost:3000/api/demo`      |
| Elysia API           | http://localhost:3101                      |
| Health               | http://localhost:3101/api/health           |
| OpenAPI UI           | http://localhost:3101/openapi              |

> 本仓库后端默认端口为 **3101**（避免与本机已有的 3001 服务冲突）。可在 `apps/server/.env` 的 `PORT`、`apps/web/.env.local` 的 `NEXT_PUBLIC_API_URL` 中同步修改。

---

## 2. Demo 使用说明

1. 在首页输入备考目标，例如：
   > 三个月内通过省直机关遴选笔试，行测基础一般，公文写作是短板，每天能投入 2 小时。
2. 点击「开始拆解」或按 `⌘/Ctrl + Enter`。
3. 左侧面板通过 SSE 逐字展示 AI 输出；右侧清单会随着 `todos` 事件实时补全。
4. 勾选任务可本地推进进度；「复制清单」导出 Markdown。
5. 生成完成后自动写入 `demo_runs` / `demo_todos`，在「归档记录」中可以重新打开。
6. 右下角的 CopilotKit 助手可以结合当前目标与任务清单继续追问。

---

## 3. 目录结构

```
.
├── apps
│   ├── server                       # Elysia API（Bun）
│   │   ├── drizzle/                 # 生成的 SQL migrations
│   │   ├── src
│   │   │   ├── app.ts               # 组装 app / CORS / OpenAPI / 错误处理
│   │   │   ├── index.ts             # 监听入口，导出 App 类型给 Eden
│   │   │   ├── env.ts
│   │   │   ├── db
│   │   │   │   ├── index.ts         # Bun.sql + Drizzle
│   │   │   │   ├── schema.ts        # demo_runs / demo_todos
│   │   │   │   ├── demo-repository.ts
│   │   │   │   └── seed.ts
│   │   │   ├── lib/llm.ts           # OpenAI-compatible provider
│   │   │   └── modules
│   │   │       ├── demo
│   │   │       │   ├── index.ts     # Controller（Elysia instance）
│   │   │       │   ├── service.ts   # SSE 流 / 编排 / 错误处理
│   │   │       │   ├── model.ts     # Elysia t 模型 + 类型
│   │   │       │   └── prompt.ts
│   │   │       └── health
│   │   └── tests
│   └── web                          # Next.js 15 App Router
│       ├── src
│       │   ├── app
│       │   │   ├── api/demo         # 同源 SSE 转发（BFF）
│       │   │   ├── api/copilotkit   # CopilotKit runtime
│       │   │   ├── demo/page.tsx    # 目标页面 /demo
│       │   │   └── pages/demo       # 字面路径兼容，重定向到 /demo
│       │   ├── components
│       │   │   ├── demo             # Hero / 工作台 / 清单 / 归档 / Copilot
│       │   │   └── ui               # shadcn/ui 组件
│       │   ├── lib                  # API 客户端、SSE hook
│       │   └── store                # Zustand store
│       └── .env.local
├── packages/shared                  # 前后端共享类型 + TODO 解析器
├── scripts/setup-env.ts
├── docker-compose.yml
└── package.json                     # 所有根脚本
```

服务端遵循 Elysia 官方推荐的 **feature-based MVC**：

| 文件                      | 职责                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `modules/demo/index.ts`   | Controller：路由、参数校验、HTTP 状态码、SSE Response              |
| `modules/demo/service.ts` | Service：LLM 编排、流式转发、解析、归档；不接触 Elysia Context     |
| `modules/demo/model.ts`   | Model：单一声明来源（TypeBox / `t`），同时产出运行时校验与 TS 类型 |
| `modules/demo/prompt.ts`  | Prompt 资产                                                        |
| `db/demo-repository.ts`   | 持久化边界，独立于 HTTP 层                                         |

---

## 4. 接口

### `POST /api/demo`

请求：

```json
{ "goal": "三个月通过省直机关遴选笔试" }
```

响应：`Content-Type: text/event-stream`

事件序列：

| event   | data                                       |
| ------- | ------------------------------------------ |
| `meta`  | `{ runId, model, startedAt }`              |
| `delta` | `{ text }` — 逐字增量                      |
| `todos` | `{ todos: TodoItem[] }` — 解析出的最新清单 |
| `done`  | `{ runId, todos, latencyMs, persisted }`   |
| `error` | `{ message, runId? }`                      |

示例：

```bash
curl -N -X POST http://localhost:3101/api/demo \
  -H 'Content-Type: application/json' \
  -d '{"goal":"三个月通过省直机关遴选笔试"}'
```

### `GET /api/demo/runs`

最近 8 条归档记录。数据库不可用时优雅降级为 `[]`。

### `GET /api/demo/runs/:id`

单条记录与完整任务清单。

### `GET /api/health`

返回 API / PostgreSQL / LLM 配置状态。

OpenAPI 文档：<http://localhost:3101/openapi>（JSON 在 `/openapi/json`）。

---

## 5. 架构与数据流

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Next.js BFF<br/>/api/demo
    participant E as Elysia<br/>POST /api/demo
    participant S as DemoService
    participant L as DeepSeek (AI SDK)
    participant D as PostgreSQL

    B->>W: POST { goal }
    W->>E: proxy SSE request
    E->>E: validate with Elysia t model
    E->>S: stream(goal, request.signal)
    S-->>B: event: meta
    S->>L: streamText(...)
    loop textStream
        L-->>S: delta
        S-->>B: event: delta
        S-->>B: event: todos（清单条数变化时）
    end
    S->>D: insert demo_runs + demo_todos
    S-->>B: event: done
    B->>W: GET history (Eden Treaty → Elysia)
```

关键设计：

- **BFF 同源转发**：浏览器始终请求 `/api/demo`，不会暴露 Elysia 地址；转发不缓冲字节。
- **流式协议自描述**：SSE 事件同时携带结构和文本，前端既能展示推理过程，也能实时生成结构化清单。
- **解析器前后端共享**：`packages/shared` 中的 `parseTodos` 被服务端和前端共同使用，格式容错一致。
- **数据库 best-effort**：Postgres 掉线时生成仍然可用，`done.persisted` 为 `false`，UI 会提示「未归档」。
- **中止与清理**：客户端 `AbortController` → Next.js 转发 signal → Elysia `request.signal` → AI SDK `abortSignal`；中断的 run 记为 `failed`。
- **Eden 端到端类型**：`packages/server` 导出 `App` 类型，前端 `treaty<App>(API_URL)` 推断出 `/api/demo/runs` 的响应，无需手写 DTO。

---

## 6. 根目录脚本

| 脚本                              | 说明                                  |
| --------------------------------- | ------------------------------------- |
| `bun run dev`                     | 并行启动 web + server（concurrently） |
| `bun run dev:web`                 | 仅启动 Next.js（3000）                |
| `bun run dev:server`              | 仅启动 Elysia（3101，hot reload）     |
| `bun run build`                   | 依次构建 server + web                 |
| `bun run build:web`               | `next build`                          |
| `bun run build:server`            | `bun build` → `apps/server/dist`      |
| `bun run start`                   | 生产模式并行启动                      |
| `bun run start:web`               | `next start`                          |
| `bun run start:server`            | 运行构建产物                          |
| `bun run typecheck`               | 所有 workspace 的 `tsc --noEmit`      |
| `bun run test`                    | 服务端 Bun 测试                       |
| `bun run test:watch`              | 测试 watch 模式                       |
| `bun run lint`                    | Next.js ESLint                        |
| `bun run format` / `format:check` | Prettier                              |
| `bun run db:generate`             | 根据 schema 生成 SQL migration        |
| `bun run db:migrate`              | 执行 migration                        |
| `bun run db:push`                 | 开发期直接同步 schema                 |
| `bun run db:studio`               | Drizzle Studio                        |
| `bun run db:seed`                 | 插入示例归档                          |
| `bun run db:up` / `db:down`       | Docker Compose 启停 PostgreSQL        |
| `bun run setup`                   | 安装依赖 + 首次生成 env 文件          |
| `bun run openapi`                 | 在浏览器打开 OpenAPI UI               |
| `bun run clean`                   | 删除构建产物与 node_modules           |

---

## 7. 环境变量

### `apps/server/.env`

| 变量           | 默认值                        | 说明               |
| -------------- | ----------------------------- | ------------------ |
| `PORT`         | `3101`                        | Elysia 端口        |
| `HOST`         | `0.0.0.0`                     | 监听地址           |
| `CORS_ORIGIN`  | `http://localhost:3000,...`   | 逗号分隔的允许来源 |
| `DATABASE_URL` | 本地 Postgres                 | Drizzle / Bun.sql  |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI 兼容网关    |
| `LLM_API_KEY`  | —                             | 必填，仅服务端     |
| `LLM_MODEL`    | `deepseek-flash`              | 模型 id            |

### `apps/web/.env.local`

| 变量                                         | 说明                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`                        | Eden / 文档链接使用的 API 源（默认 `http://localhost:3101`） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 仅供 `/api/copilotkit` runtime 使用                          |
| `API_INTERNAL_URL`（可选）                   | Next.js BFF 转发目标，默认复用 `NEXT_PUBLIC_API_URL`         |

---

## 8. 数据库

```sql
demo_runs
  id uuid pk
  goal text
  model varchar(80)
  status demo_run_status  -- streaming | completed | failed
  raw_output text
  todo_count int
  latency_ms int
  error text
  created_at timestamptz
  completed_at timestamptz

demo_todos
  id uuid pk
  run_id uuid fk → demo_runs.id (cascade)
  title text
  detail text
  priority varchar(16)   -- high | medium | low
  position int
  created_at timestamptz
```

修改 `apps/server/src/db/schema.ts` 后：

```bash
bun run db:generate
bun run db:migrate
```

---

## 9. 测试与验证

```bash
bun run test
bun run typecheck
bun run build
```

手动验证流式接口：

```bash
curl -N -X POST http://localhost:3101/api/demo \
  -H 'Content-Type: application/json' \
  -d '{"goal":"30 天补齐公文写作短板"}'
```

应看到 `meta → delta… → todos… → done`，且：

```bash
psql -d xs_ai_platform -c "select goal, status, todo_count from demo_runs order by created_at desc limit 3;"
```

---

## 10. 已知边界与下一步

- 当前是单租户 Demo：未接入登录、组织/学员、RBAC 与配额。
- CopilotKit 以最小 runtime 接入，未做租户级会话持久化。
- SSE 事件已有 `todos` 结构，后续可替换为 AI SDK 的结构化输出 / 工具调用。
- 归档记录支持回看，尚未支持删除、导出 PDF、任务执行状态回写。
- 部署（过渡方案）：MVP 先用 **Vercel（web + api）+ 阿里云 RDS PostgreSQL 16 + OSS**，靠 Vercel CI/CD 快速上线；正式环境再迁境内（见 `.dsh/notes/baseline/04-platforms-and-deploy.md`）。终态仍是 Next.js 与 Elysia 分容器、共享日志 trace id、Postgres 连接池 + RLS、LLM 限流与成本观测。
