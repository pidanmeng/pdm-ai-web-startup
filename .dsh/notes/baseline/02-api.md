# 02 · 接口设计

> 技术：Elysia（Bun）+ TypeBox `t` 模型 + Drizzle；OpenAPI 3.1 由路由自动生成（`/openapi`、`/openapi/json`）；前端用 Eden Treaty 直接拿类型，不手写 DTO。
> 本文档只定义"有哪些接口、长什么样、谁可以调"，具体实现按 `05-engineering-baseline.md` 的模块模板落地。

---

## 1. 基础约定

| 项 | 约定 |
|---|---|
| Base URL | `/api/v1`（`/openapi`、`/health`、`/webhooks/*` 不带版本前缀） |
| 认证 | httpOnly Cookie `xs_session`（SameSite=Lax，Secure）；学员 H5 用签名 URL，不走 Cookie |
| CSRF | 写操作校验 `Origin` + 双提交 Token（`xs_csrf` Cookie + `X-CSRF-Token` 头） |
| 租户 | 从会话取 `tenant_id`，**永不**从请求体/Query 取；跨租户访问返回 403 |
| 请求 ID | 响应头 `X-Trace-Id`，贯穿 Next → Elysia → Worker → LLM 调用 |
| 分页 | `?cursor=<opaque>&limit=20`（默认 20，最大 100）；响应 `{ items, nextCursor }` |
| 排序 | `?sort=exam_at:desc`，白名单字段，禁止拼接 SQL |
| 时间 | 请求/响应一律 ISO 8601 UTC（`2026-11-12T08:30:00.000Z`）；前端按 Asia/Shanghai 展示 |
| ID | UUID v7（时间有序），字符串传输 |
| 金额 | 整数分（`costCents`），前端格式化；**禁止浮点** |
| 分数 | 字符串小数（`"12.5"`）或 number，服务端用 `numeric(5,1)` 校验 |
| 幂等 | 写操作支持 `Idempotency-Key` 头（批改、导出、同步、重生成必带）；24h 内重复返回首次结果 |
| 限流 | 按租户 + 用户 + 接口类别（登录 10/min，AI 任务 30/min，普通 300/min），超限 429 + `Retry-After` |
| 错误体 | 见第 5 节，统一 `{ error: { code, message, details?, traceId } }` |
| 成功体 | 直接返回资源对象或 `{ items, nextCursor }`，不再包 `{ code: 0, data }`（便于 Eden 推断） |
| 长任务 | 一律 `202 Accepted` + 任务 id，进度用 SSE 或轮询；不在 HTTP 请求内跑完 |

### 1.1 鉴权与权限声明

每个路由显式声明权限点，由插件统一拦截：

```ts
// 示意，不是最终代码
export const exams = new Elysia({ prefix: '/exams' })
  .use(authGuard)
  .get('/', listExams, { permission: 'exam:read' })
  .post('/sync', syncExams, { permission: 'exam:sync' })
```

- 权限点同时写入 OpenAPI 的 `x-permission`，前端据此渲染按钮；
- 启动时校验"路由声明的权限点 ∈ 权限目录"，防止拼写错误；
- 生成"角色 × 接口"的授权快照测试，权限变更必须更新快照（见 05 篇）。

### 1.2 数据范围（scope）

| scope | 含义 | 应用位置 |
|---|---|---|
| `tenant` | 本租户全部 | 教研、管理员 |
| `assigned` | 分配给我（审核任务）的答卷/交付物 | 审核员 |
| `self` | 仅本人 | 学员 |
| `readonly` | 可见但不可写 | 运营、只读角色 |

实现放在 repository 层：`withScope(qb, ctx)`；**不允许**在 controller 里手写 `where tenantId = ...` 之外的拼接。

---

## 2. 接口清单

图例：`P` = 权限点；`202` 表示异步任务。

### 2.1 认证 `auth`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/auth/wechat/authorize-url` | 公开 | 返回微信授权 URL（带 state、redirect），PC 扫码 / H5 公众号两种 |
| GET | `/auth/wechat/callback` | 公开 | code 换 openid/unionid，建会话，302 回前端 |
| POST | `/auth/login` | 公开 | 内部账号密码登录（审核员/管理员兜底），失败计数 + 锁定 |
| POST | `/auth/logout` | 登录 | 撤销会话 |
| GET | `/auth/me` | 登录 | 用户、租户、角色、权限点、可见页面、功能开关 |
| POST | `/auth/bind-phone` | 登录 | 绑定/更换手机号（短信验证码） |
| POST | `/auth/onboarding/join` | 登录 | 邀请码加入机构 |
| POST | `/auth/session/refresh` | 登录 | 续期（滑动过期） |

### 2.2 用户与权限 `admin`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/users` | `admin:user` | 列表（关键词、角色、状态） |
| POST | `/users/invite` | `admin:user` | 邀请（手机号/邮箱），返回邀请链接 |
| PATCH | `/users/:id` | `admin:user` | 改资料、状态、用户组 |
| POST | `/users/:id/reset-password` | `admin:user` | 重置内部账号密码 |
| GET | `/roles` | `admin:role` | 角色列表（含成员数） |
| POST | `/roles` | `admin:role` | 新建角色 |
| PATCH | `/roles/:id` | `admin:role` | 改名、改权限点 |
| DELETE | `/roles/:id` | `admin:role` | 删除（有成员时 409） |
| GET | `/permissions` | `admin:role` | 权限点目录（分组） |
| GET | `/pages` | 登录 | 页面注册表（key/名称/分组/路由） |
| GET | `/page-visibility` | `admin:page` | 页面 × 角色矩阵 |
| PUT | `/page-visibility` | `admin:page` | 批量保存矩阵（事务、变更预览在客户端算） |

### 2.3 集成 `integrations`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/integrations` | `admin:integration` | 列表（密钥脱敏，只回 `hasSecret`） |
| PUT | `/integrations/:provider` | `admin:integration` | 保存配置（`xiaoe`/`wechat`/`storage`），密钥加密存储 |
| POST | `/integrations/:provider/test` | `admin:integration` | 连通性测试（获取 token / 列一场考试） |
| POST | `/integrations/xiaoe/sync` | `exam:sync` | 触发考试同步，`202` 返回 `syncRunId` |
| GET | `/sync-runs` | `exam:read` | 同步记录（类型/状态/统计/错误） |
| GET | `/sync-runs/:id` | `exam:read` | 单次同步详情（新增/更新/跳过条数、样例错误） |

### 2.4 考试 `exams`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/exams` | `exam:read` | 列表：`keyword`、`status[]`、`from`、`to`、`sort`、`cursor`；返回计数聚合 |
| POST | `/exams` | `exam:write` | 手动建场次（无小鹅通来源时） |
| GET | `/exams/:id` | `exam:read` | 详情（含状态、进度、统计、下一步动作） |
| PATCH | `/exams/:id` | `exam:write` | 改标题/时间/负责人/备注 |
| DELETE | `/exams/:id` | `exam:write` | 软删除（有批改记录时需 `force` + 审计） |
| GET | `/exams/:id/paper` | `exam:read` | 试卷结构（题号、题型、分值、题干） |
| PUT | `/exams/:id/paper` | `exam:write` | 保存人工修订的题目结构 |
| POST | `/exams/:id/paper/parse` | `exam:write` | 重新从小鹅通拉取并解析考卷，`202` |
| GET | `/exams/:id/rubric` | `exam:read` | 当前评分要点（Markdown + 结构化 + 状态 + 版本） |
| POST | `/exams/:id/rubric/upload` | `exam:write` | 登记已上传文件（配合 `/files/presign`），`202` 触发解析 |
| POST | `/exams/:id/rubric/parse` | `exam:write` | 指定文件/文本重新解析，`202` |
| PUT | `/exams/:id/rubric` | `exam:write` | 保存人工校对后的结构化要点 |
| POST | `/exams/:id/rubric/confirm` | `exam:write` | 确认要点 → 场次 `ready`（写审计、版本快照） |
| GET | `/exams/:id/rubric/versions` | `exam:read` | 要点版本列表与 diff |
| GET | `/exams/:id/stats` | `exam:read` | 答卷数、已批改、均分、通过率、成本 |
| GET | `/exams/:id/answer-sheets` | `exam:read` | 该场答卷分页（状态、学员、分数） |
| GET | `/exams/:id/assignments` | `review:assign` | 审核分配概览 |
| POST | `/exams/:id/assignments` | `review:assign` | 分配/重新分配（策略：`round_robin`/`by_load`/显式名单） |

### 2.5 答卷与判分 `answer-sheets` / `grades`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/answer-sheets/:id` | `sheet:read` | 答卷详情（原文、图片、学员、状态） |
| GET | `/answer-sheets/:id/grades` | `sheet:read` | 当前判分（逐题 + 采分点 + 版本） |
| PATCH | `/grades/:id` | `grade:write` | 人工改分（必须 `reason`，生成版本） |
| GET | `/grades/:id/versions` | `sheet:read` | 判分版本历史 |
| POST | `/answer-sheets/:id/regrade` | `grading:run` | 单卷重批（可指定题），`202` |
| GET | `/answer-sheets/:id/artifacts` | `sheet:read` | 该卷交付物列表（含状态与版本） |

### 2.6 批改任务 `grading`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| POST | `/grading/jobs` | `grading:run` | 创建批改任务（范围、模型、Prompt、并发），`201` 返回预估费用/耗时 |
| GET | `/grading/jobs` | `exam:read` | 任务列表（场次、状态、进度、成本） |
| GET | `/grading/jobs/:id` | `exam:read` | 任务详情（统计、失败原因分布） |
| GET | `/grading/jobs/:id/items` | `exam:read` | 逐份状态分页（成功/失败/耗时/token） |
| POST | `/grading/jobs/:id/cancel` | `grading:run` | 取消（进行中的当前份跑完即停） |
| POST | `/grading/jobs/:id/retry` | `grading:run` | 只重跑失败项 |
| GET | `/grading/jobs/:id/stream` | `exam:read` | SSE 进度流（`progress`/`item`/`done`/`error`） |
| POST | `/grading/estimate` | `grading:run` | 只估算不创建（份数、token、费用、耗时） |

### 2.7 交付物 `artifacts`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| POST | `/answer-sheets/:id/artifacts/generate` | `artifact:write` | 生成交付物（类型数组），`202` |
| GET | `/artifacts/:id` | `sheet:read` | 交付物（block 列表 + 版本 + 状态） |
| PATCH | `/artifacts/:id/blocks/:blockId` | `artifact:write` | 人工编辑单个 block（记版本） |
| POST | `/artifacts/:id/regenerate` | `artifact:write` | 按 comment 重生成（`full`/`incremental`），`202` |
| POST | `/artifacts/:id/approve` | `artifact:approve` | 通过（需无 open comment） |
| GET | `/artifacts/:id/versions` | `sheet:read` | 版本列表 |
| GET | `/artifacts/:id/diff` | `sheet:read` | `?from=&to=` 版本 diff（block 级） |

### 2.8 审核 `reviews`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/reviews/my` | `review:read` | 我的审核任务（按场次分组、状态、剩余量） |
| GET | `/assignments/:id/tasks` | `review:read` | 分配下的任务列表 |
| POST | `/review-tasks/:id/claim` | `review:read` | 领取（幂等，防两人同时审） |
| POST | `/review-tasks/:id/release` | `review:read` | 释放 |
| POST | `/review-tasks/:id/approve` | `review:approve` | 通过（校验无 open comment） |
| POST | `/review-tasks/:id/reject` | `review:approve` | 驳回（必须带 comment） |
| GET | `/review-comments` | `review:read` | 按目标查 comment（含已解决） |
| POST | `/review-comments` | `review:comment` | 新建（单条或批量），带锚点 |
| PATCH | `/review-comments/:id` | `review:comment` | 编辑内容/严重级别 |
| DELETE | `/review-comments/:id` | `review:comment` | 删除（仅本人、未解决） |
| POST | `/review-comments/resolve-batch` | `review:comment` | 批量标记已解决 |
| POST | `/regenerations` | `review:comment` | 按多条 comment 触发重生成（判分或交付物），`202` |
| GET | `/regenerations/:id` | `review:read` | 重生成状态与 diff |

### 2.9 交付 `deliverables`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/deliverables` | `deliverable:read` | 列表（场次、学员、状态） |
| GET | `/deliverables/:id` | `deliverable:read` | 详情（学生视角内容） |
| POST | `/deliverables/:id/export` | `deliverable:export` | 导出 DOCX/PDF，`202` 返回 `exportTaskId` |
| GET | `/export-tasks/:id` | `deliverable:read` | 导出任务状态 |
| GET | `/export-tasks/:id/download` | `deliverable:read` | 下载（签名 URL，限时） |
| POST | `/deliverables/:id/deliver` | `deliverable:export` | 标记已交付 / 推送小鹅通（可配置） |
| POST | `/deliverables/:id/share-link` | `deliverable:export` | 生成学员 H5 签名链接（可设有效期、可撤销） |

### 2.10 语料库 `corpora`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/corpora` | `corpus:read` | 列表（类型、条目数、向量化状态） |
| POST | `/corpora` | `corpus:write` | 新建语料库 |
| PATCH | `/corpora/:id` | `corpus:write` | 改名/描述/启停 |
| DELETE | `/corpora/:id` | `corpus:write` | 删除（有引用时软删） |
| GET | `/corpora/:id/entries` | `corpus:read` | 条目分页（关键词、标签、启用状态） |
| POST | `/corpora/:id/entries` | `corpus:write` | 新建条目（自动排队向量化） |
| PATCH | `/corpus-entries/:id` | `corpus:write` | 编辑（内容变更触发重新向量化） |
| DELETE | `/corpus-entries/:id` | `corpus:write` | 删除/停用 |
| POST | `/corpora/:id/entries/import` | `corpus:write` | CSV/XLSX 批量导入（`202`，返回错误行报告） |
| GET | `/corpora/:id/entries/export` | `corpus:read` | 导出 CSV |
| POST | `/corpora/:id/reindex` | `corpus:write` | 重建向量索引，`202` |
| POST | `/corpora/:id/search` | `corpus:read` | 检索测试：`{ query, topK }` → 命中条目与相似度 |

### 2.11 Prompt 与模型 `prompts` / `models`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| GET | `/prompts` | `prompt:read` | 模板列表（用途、当前发布版本） |
| POST | `/prompts` | `prompt:write` | 新建模板 |
| GET | `/prompts/:id/versions` | `prompt:read` | 版本列表 |
| POST | `/prompts/:id/versions` | `prompt:write` | 新建草稿版本（system/user/输出 Schema/参数） |
| POST | `/prompts/:id/publish` | `prompt:write` | 发布某版本（旧版本归档） |
| POST | `/prompts/:id/rollback` | `prompt:write` | 回滚到指定版本 |
| POST | `/prompts/:id/test` | `prompt:write` | 试运行（样例输入 → 渲染后 Prompt + 输出 + token/费用） |
| GET | `/models` | `model:read` | 模型列表（能力、单价、默认路由） |
| POST | `/models` | `model:write` | 新建供应商/模型（密钥加密） |
| PATCH | `/models/:id` | `model:write` | 改配置/启停 |
| POST | `/models/:id/test` | `model:write` | 连通性与结构化输出测试 |
| GET | `/usage/summary` | `admin:usage` | 用量汇总（按日/模型/用途/场次） |

### 2.12 文件与系统 `files` / `system`

| 方法 | 路径 | P | 说明 |
|---|---|---|---|
| POST | `/files/presign` | 登录 | 获取直传签名（限制 mime/大小/租户前缀） |
| POST | `/files/complete` | 登录 | 确认上传，落库（sha256 去重） |
| GET | `/files/:id/url` | 登录 | 取临时访问 URL（私有桶） |
| DELETE | `/files/:id` | 登录 | 删除（有引用时 409） |
| GET | `/health` | 公开 | 依赖健康（DB/队列/存储/LLM/OCR 配置） |
| GET | `/metrics` | 内网 | Prometheus 指标（不对外） |
| POST | `/webhooks/xiaoe` | 验签 | 小鹅通事件（交卷/考试变更），幂等处理 |

---

## 3. 关键接口契约

### 3.1 `POST /api/v1/exams/sync`

```json
{
  "from": "2026-09-01T00:00:00.000Z",
  "to": "2026-11-12T23:59:59.000Z",
  "keyword": "省直遴选",
  "mode": "upsert"
}
```

`202 Accepted`：

```json
{ "syncRunId": "019a...", "estimated": 42 }
```

- 幂等键：`exam-sync:{tenant}:{from}:{to}`，10 分钟内重复请求返回同一 `syncRunId`。
- 同步逻辑：分页拉取 → 按 `xiaoe_exam_id` upsert → 记录 `created/updated/skipped` → 失败项进死信并可单条重试。
- 不覆盖人工修改过的字段（`title_override`、`owner_id`），只更新平台侧字段。

### 3.2 `POST /api/v1/exams/:id/rubric/parse`

```json
{
  "fileIds": ["019a..."],
  "text": null,
  "modelId": "019a...",
  "promptVersionId": "019a..."
}
```

`202` → `{ "taskId": "019a..." }`；任务结果（轮询 `GET /exams/:id/rubric`）：

```json
{
  "status": "parsed",
  "markdown": "# 第一题（20 分）\n...",
  "items": [
    {
      "questionNo": "1",
      "seq": 1,
      "point": "准确概括材料中的三个问题",
      "score": "4.0",
      "criteria": "每点 1 分，需结合材料原词",
      "evidenceRequired": true,
      "confidence": 0.92
    }
  ],
  "warnings": [{ "code": "QUESTION_COUNT_MISMATCH", "message": "试卷 5 题，要点识别到 4 题" }]
}
```

- 解析结果**不直接生效**，必须 `PUT /rubric` + `POST /rubric/confirm`。
- 低置信度（< 0.7）条目在 UI 高亮，确认前必须逐条勾选"已核对"。

### 3.3 `POST /api/v1/grading/jobs`

```json
{
  "examId": "019a...",
  "scope": { "type": "ungraded" },
  "sheetIds": null,
  "modelId": null,
  "promptVersionId": null,
  "concurrency": 8,
  "budgetCents": 5000
}
```

`201 Created`：

```json
{
  "jobId": "019a...",
  "total": 286,
  "estimatedCostCents": 1280,
  "estimatedMinutes": 40,
  "queuePosition": 2
}
```

错误：`409 EXAM_NOT_READY`（要点未确认）、`409 JOB_ALREADY_RUNNING`、`422 NO_ELIGIBLE_SHEETS`、`402 BUDGET_EXCEEDED`（预留）。

### 3.4 `POST /api/v1/review-comments` + `POST /api/v1/regenerations`

一次提交多条 comment（判分场景，锚定到"题 + 采分点"）：

```json
{
  "targetType": "grade",
  "targetId": "019a...",
  "comments": [
    {
      "anchor": { "questionId": "019a...", "rubricItemId": "019a...", "quote": "概括不全面" },
      "category": "score_wrong",
      "severity": "blocking",
      "content": "第 2 点应给 2 分，学员答出了'监管缺位'，与采分点 3 同义"
    },
    {
      "anchor": { "questionId": "019a...", "blockRange": null, "quote": "" },
      "category": "evidence_missing",
      "severity": "suggestion",
      "content": "补充引用原文，便于学员理解"
    }
  ]
}
```

```json
{ "runId": "019a...", "targetType": "grade", "mode": "incremental", "commentCount": 2 }
```

- 服务端对同一 `targetId` 加 advisory lock，防并发重生成互相覆盖。
- 重生成时把"该目标 + 全部 open comment + 未改动的结构化上下文"作为输入；输出必须是**完整的新结构**（便于直接 diff），而不是 patch 文本。
- 完成后写 `regeneration_runs.diff`，审核员接受才落为新版本；不接受则丢弃。

### 3.5 `GET /api/v1/grading/jobs/:id/stream`（SSE）

```
event: progress
data: {"jobId":"...","total":286,"done":120,"failed":2,"etaSeconds":900}

event: item
data: {"sheetId":"...","status":"succeeded","score":"78.5","latencyMs":8400}

event: done
data: {"jobId":"...","succeeded":284,"failed":2,"costCents":1240}
```

- 心跳 `: ping` 每 15s；`id:` 用事件序号，断线重连带 `Last-Event-ID` 补发。
- 鉴权走 Cookie；非本租户/无权限直接 403，不建立流。

---

## 4. 回调与事件

| 来源 | 路径 | 验签 | 事件 |
|---|---|---|---|
| 小鹅通 | `POST /webhooks/xiaoe` | `sign` + 时间戳 + 重放窗口 5 分钟 | 学员交卷、考试上下架、订单（可选） |
| 微信 | `GET/POST /webhooks/wechat` | `signature`/`msg_signature` | 公众号消息（可选，二期） |

处理原则：先落 `webhook_events`（按 `event_id` 唯一）再异步消费；重复投递直接 200；处理失败进重试队列，不影响上游。

---

## 5. 错误码

| HTTP | code | 场景 | 前端处理 |
|---|---|---|---|
| 400 | `BAD_REQUEST` | 参数结构错误 | 表单定位 |
| 401 | `AUTH_REQUIRED` | 未登录/会话过期 | 跳登录，带 `redirect` |
| 403 | `PERMISSION_DENIED` | 无功能权限 | toast + 说明缺哪个权限 |
| 403 | `TENANT_MISMATCH` | 跨租户 | 记录安全日志 |
| 404 | `NOT_FOUND` / `PAGE_NOT_VISIBLE` | 资源不存在/页面不可见 | 404 页 |
| 409 | `CONFLICT` | 状态不允许（如未确认要点就批改） | 提示当前状态与下一步 |
| 409 | `JOB_ALREADY_RUNNING` | 同范围已有任务 | 跳转已有任务 |
| 422 | `VALIDATION_ERROR` | 字段校验失败（含 `details[]`） | 字段级错误 |
| 422 | `AI_OUTPUT_INVALID` | 模型输出不满足 Schema（重试后仍失败） | 展示原始输出 + 重试/转人工 |
| 429 | `RATE_LIMITED` | 触发限流 | 倒计时 |
| 502 | `UPSTREAM_ERROR` | 小鹅通/微信/模型不可用 | 重试 + 降级说明 |
| 500 | `INTERNAL_ERROR` | 未捕获异常 | 展示 traceId，引导反馈 |

约定：`message` 给用户看（中文、可操作），`details` 给开发者看（字段、上游响应码），`traceId` 必须回传。

---

## 6. OpenAPI 与前端类型工作流

1. Elysia 路由用 `t.Object` 定义 body/query/response，`detail` 写 summary、`x-permission`、`x-audit`。
2. CI 生成 `openapi.json` 快照；**接口变更必须更新快照**，PR 里展示 diff（新增/删除/字段类型变化）。
3. 前端用 Eden Treaty：`treaty<App>(BASE_URL)`，不生成也不维护第二套类型。
4. 破坏性变更（删字段/改类型/改语义）必须走 `/api/v2` 或提供兼容期；CI 检查 `breaking` 标记。
5. 文档站：`/openapi` 供后端/测试使用；对外合作再单独出脱敏版。

> 这条流水线是"接口即契约"的落地方式：类型不靠人同步，靠生成 + 快照 + CI 拦截。
