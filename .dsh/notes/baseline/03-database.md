# 03 · 数据库 Schema

> PostgreSQL 16 + `pgvector` + `pg_trgm`（模糊搜索）+ `citext`（可选）。ORM 用 Drizzle，schema 文件是唯一事实源，迁移由 `drizzle-kit generate` 产出 SQL 并人工审阅。
> 约定：所有业务表带 `tenant_id uuid not null`（全局字典表除外）、`created_at/updated_at timestamptz`；主键 `uuid`（v7，时间有序）；软删除用 `deleted_at`；金额 `integer`（分）；分数 `numeric(5,1)`；JSON 只存"结构不稳定"的扩展字段，可检索的字段必须建列。

---

## 1. 分组与优先级

| 组 | 表 | 说明 | 优先级 |
|---|---|---|---|
| A 租户与身份 | `tenants` `users` `roles` `permissions` `role_permissions` `user_roles` `pages` `role_pages` `sessions` `invitations` | 多租户 + RBAC + 页面可见性 | P0 |
| B 集成 | `integrations` `sync_runs` `webhook_events` | 小鹅通/微信/存储配置与同步记录 | P0 |
| C 考试与答卷 | `exams` `exam_papers` `questions` `rubrics` `rubric_items` `answer_sheets` `answers` | 业务主数据 | P0 |
| D 批改 | `grading_jobs` `grading_job_items` `grades` `grade_points` `grade_versions` | 异步任务与判分结果 | P0 |
| E 交付 | `artifacts` `artifact_blocks` `artifact_versions` `deliverables` | 结构化交付文本与交付记录 | P0 |
| F 审核 | `review_assignments` `review_tasks` `review_comments` `regeneration_runs` | 分配、comment、重生成 | P0 |
| G AI 资产 | `corpora` `corpus_entries` `prompt_templates` `prompt_versions` `model_providers` `models` `ai_usage_logs` | 语料/Prompt/模型/计量 | P0（计量）/P1 |
| H 文件与运维 | `files` `export_tasks` `audit_logs` `idempotency_keys` | 存储、导出、审计、幂等 | P0 |

共 44 张表；MVP 可先砍 `invitations`、`export_tasks`、`artifact_versions`（用 `artifacts.version` + JSON 快照）等，但不建议砍 `audit_logs` 与 `ai_usage_logs`——上线后再补数据就没了。

---

## 2. 表结构

> 以下 DDL 按逻辑分组展示，不是一份可直接执行的脚本；实际迁移由 Drizzle 按外键依赖排序生成。

### A. 租户与身份

```sql
create table tenants (
  id            uuid primary key,
  name          varchar(120) not null,
  slug          varchar(64)  not null unique,          -- 子域名/邀请码用
  status        tenant_status not null default 'active',
  plan          varchar(32)  not null default 'trial',
  seat_limit    int          not null default 10,
  settings      jsonb        not null default '{}',    -- 功能开关、默认模型等
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

create table users (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  wechat_openid  varchar(64),
  wechat_unionid varchar(64),
  name           varchar(80)  not null default '',
  avatar_url     text,
  phone_enc      bytea,                                 -- AES-GCM 密文
  phone_hash     char(64),                              -- sha256(phone + pepper)，用于查重
  email          citext,
  password_hash  text,                                  -- 仅内部账号；argon2id
  status         user_status not null default 'active',
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (tenant_id, wechat_openid),
  unique (tenant_id, email)
);
-- 注：微信 unionid 跨租户共享时另建 identity 映射表（P1）

create table roles (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  key         varchar(40) not null,          -- platform_admin / org_admin / teacher ...
  name        varchar(60) not null,
  description text not null default '',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

create table permissions (            -- 全局字典，代码内定义后 seed
  key    varchar(60) primary key,     -- exam:read
  name   varchar(80) not null,
  grp    varchar(40) not null,        -- exam / grading / review / admin ...
  sort   int not null default 0
);

create table role_permissions (
  role_id        uuid not null references roles(id) on delete cascade,
  permission_key varchar(60) not null references permissions(key),
  primary key (role_id, permission_key)
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table pages (                  -- 全局字典，由前端 manifest 同步
  key       varchar(60) primary key,  -- exams / review_sheet ...
  path      varchar(160) not null,
  name      varchar(80)  not null,
  grp       varchar(40)  not null,
  sort      int not null default 0,
  min_role  varchar(40)              -- 兜底：至少哪个角色可见（防全关）
);

create table role_pages (
  role_id  uuid not null references roles(id) on delete cascade,
  page_key varchar(60) not null references pages(key),
  visible  boolean not null default true,
  primary key (role_id, page_key)
);

create table sessions (
  id           uuid primary key,
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   char(64) not null unique,   -- sha256(token)
  user_agent   text,
  ip           inet,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table invitations (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id),
  contact    varchar(120) not null,
  role_id    uuid not null references roles(id),
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references users(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
```

### B. 集成

```sql
create table integrations (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  provider    varchar(32) not null,          -- xiaoe / wechat / storage / sms
  config      jsonb not null default '{}',   -- 非敏感配置：店铺 id、base url、回调地址
  secrets_enc bytea,                         -- AES-GCM(app_secret / api_key)
  key_version int not null default 1,
  status      varchar(20) not null default 'unconfigured',
  last_checked_at timestamptz,
  last_error  text,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table sync_runs (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  provider    varchar(32) not null,
  kind        varchar(32) not null,          -- exams / papers / sheets
  status      sync_status not null default 'running',
  params      jsonb not null default '{}',
  stats       jsonb not null default '{}',   -- {created, updated, skipped, failed}
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table webhook_events (
  id           uuid primary key,
  tenant_id    uuid references tenants(id),
  provider     varchar(32) not null,
  event_id     varchar(120) not null,
  event_type   varchar(60) not null,
  payload      jsonb not null,
  status       varchar(20) not null default 'pending',
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
```

### C. 考试与答卷

```sql
create table exams (
  id               uuid primary key,
  tenant_id        uuid not null references tenants(id),
  xiaoe_exam_id    varchar(80),
  title            varchar(200) not null,
  title_override   varchar(200),                -- 人工改名，不被同步覆盖
  exam_at          timestamptz not null,
  duration_min     int,
  total_score      numeric(6,1),
  status           exam_status not null default 'synced',
  source           varchar(16) not null default 'xiaoe',  -- xiaoe / manual
  owner_id         uuid references users(id),
  paper_synced_at  timestamptz,
  rubric_id        uuid,                        -- 当前生效要点
  sheet_count      int not null default 0,      -- 冗余计数，异步维护
  graded_count     int not null default 0,
  meta             jsonb not null default '{}',
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (tenant_id, xiaoe_exam_id)
);

create table exam_papers (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  exam_id     uuid not null references exams(id) on delete cascade,
  version     int not null default 1,
  source      varchar(16) not null default 'xiaoe',
  raw         jsonb not null default '{}',      -- 平台原始结构，留档排查
  parsed_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table questions (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  exam_id     uuid not null references exams(id) on delete cascade,
  paper_id    uuid not null references exam_papers(id) on delete cascade,
  seq         int not null,                     -- 题号顺序
  label       varchar(20) not null,             -- 一、1、（1）
  type        question_type not null,           -- essay / short_answer / objective
  stem_md     text not null default '',
  options     jsonb,
  ref_answer_md text,                           -- 参考答案
  score       numeric(5,1) not null default 0,
  tags        text[] not null default '{}',
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (paper_id, seq)
);

create table rubrics (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  exam_id           uuid not null references exams(id) on delete cascade,
  version           int not null default 1,
  status            rubric_status not null default 'draft',
  markdown          text not null default '',
  structured        jsonb not null default '{}',
  source_file_ids   uuid[] not null default '{}',
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  warnings          jsonb not null default '[]',
  confirmed_by      uuid references users(id),
  confirmed_at      timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  unique (exam_id, version)
);

create table rubric_items (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  rubric_id      uuid not null references rubrics(id) on delete cascade,
  question_id    uuid references questions(id) on delete set null,
  question_no    varchar(20) not null,          -- 解析阶段可能还没绑定题
  seq            int not null,
  point          text not null,                 -- 采分点描述
  score          numeric(5,1) not null,
  criteria       text not null default '',      -- 判定标准
  evidence_required boolean not null default false,
  tags           text[] not null default '{}',
  confidence     numeric(3,2),
  created_at     timestamptz not null default now(),
  unique (rubric_id, question_no, seq)
);

create table answer_sheets (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  exam_id        uuid not null references exams(id) on delete cascade,
  xiaoe_user_id  varchar(80),
  attempt_no     int not null default 1,
  student_name   varchar(80) not null default '',
  student_phone_enc bytea,
  submitted_at   timestamptz,
  status         sheet_status not null default 'pending',
  total_score    numeric(6,1),
  max_score      numeric(6,1),
  ocr_status     varchar(20) not null default 'none',
  raw_file_id    uuid references files(id),
  meta           jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (exam_id, xiaoe_user_id, attempt_no)
);

create table answers (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  sheet_id    uuid not null references answer_sheets(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  content_md  text not null default '',
  images      jsonb not null default '[]',      -- [{fileId, order}]
  word_count  int not null default 0,
  unique (sheet_id, question_id)
);
```

### D. 批改

```sql
create table grading_jobs (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  exam_id           uuid not null references exams(id) on delete cascade,
  status            job_status not null default 'queued',
  scope             jsonb not null default '{}',  -- {type:'ungraded'|'selected', sheetIds:[]}
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  concurrency       int not null default 4,
  budget_cents      int,
  total             int not null default 0,
  succeeded         int not null default 0,
  failed            int not null default 0,
  cost_cents        int not null default 0,
  idempotency_key   varchar(120),
  created_by        uuid references users(id),
  started_at        timestamptz,
  finished_at       timestamptz,
  error             text,
  created_at        timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table grading_job_items (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  job_id      uuid not null references grading_jobs(id) on delete cascade,
  sheet_id    uuid not null references answer_sheets(id) on delete cascade,
  status      job_item_status not null default 'queued',
  attempts    int not null default 0,
  error_code  varchar(40),
  error       text,
  latency_ms  int,
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  cost_cents  int not null default 0,
  updated_at  timestamptz not null default now(),
  unique (job_id, sheet_id)
);

create table grades (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  sheet_id          uuid not null references answer_sheets(id) on delete cascade,
  question_id       uuid not null references questions(id) on delete cascade,
  rubric_id         uuid references rubrics(id),
  score             numeric(5,1) not null default 0,
  max_score         numeric(5,1) not null default 0,
  confidence        numeric(3,2),
  reasoning_md      text not null default '',
  status            grade_status not null default 'ai',   -- ai / edited / approved
  version           int not null default 1,
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  locked_by         uuid references users(id),
  locked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (sheet_id, question_id)
);

create table grade_points (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  grade_id       uuid not null references grades(id) on delete cascade,
  rubric_item_id uuid references rubric_items(id) on delete set null,
  hit            boolean not null default false,
  awarded        numeric(5,1) not null default 0,
  evidence_quote text,                 -- 学员原文引用
  evidence_anchor jsonb,               -- {answerId, start, end}
  comment        text,
  unique (grade_id, rubric_item_id)
);

create table grade_versions (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id),
  grade_id   uuid not null references grades(id) on delete cascade,
  version    int not null,
  snapshot   jsonb not null,           -- 完整判分结构快照
  reason     varchar(40) not null,     -- ai / manual_edit / regeneration
  note       text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (grade_id, version)
);
```

### E. 交付物

```sql
create table artifacts (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  exam_id           uuid not null references exams(id) on delete cascade,
  sheet_id          uuid not null references answer_sheets(id) on delete cascade,
  type              artifact_type not null,   -- problem_overview / problem_analysis / improvement_advice / full_report
  status            artifact_status not null default 'draft',
  version           int not null default 1,
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  approved_by       uuid references users(id),
  approved_at       timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (sheet_id, type)
);

create table artifact_blocks (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id),
  artifact_id   uuid not null references artifacts(id) on delete cascade,
  seq           int not null,
  kind          block_kind not null,        -- heading / paragraph / list / table / quote
  heading_path  text[] not null default '{}',
  content_md    text not null default '',
  corpus_refs   jsonb not null default '[]',-- [{corpusId, entryId, score}]
  status        block_status not null default 'active', -- active / frozen
  created_at    timestamptz not null default now(),
  unique (artifact_id, seq)
);

create table artifact_versions (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,              -- blocks 全量快照
  reason      varchar(40) not null,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  unique (artifact_id, version)
);

create table deliverables (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id),
  exam_id      uuid not null references exams(id) on delete cascade,
  sheet_id     uuid not null references answer_sheets(id) on delete cascade,
  status       deliverable_status not null default 'draft',
  share_token  varchar(80) unique,           -- 学员 H5 免登录链接
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  delivered_by uuid references users(id),
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sheet_id)
);
```

### F. 审核

```sql
create table review_assignments (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id),
  exam_id      uuid not null references exams(id) on delete cascade,
  reviewer_id  uuid not null references users(id),
  strategy     varchar(20) not null default 'by_load',
  total        int not null default 0,
  done         int not null default 0,
  status       varchar(20) not null default 'active',
  assigned_by  uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (exam_id, reviewer_id)
);

create table review_tasks (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  assignment_id  uuid not null references review_assignments(id) on delete cascade,
  target_type    varchar(16) not null,     -- sheet / artifact
  target_id      uuid not null,
  reviewer_id    uuid not null references users(id),
  status         task_status not null default 'pending',
  claimed_at     timestamptz,
  completed_at   timestamptz,
  unique (reviewer_id, target_type, target_id)
);

create table review_comments (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  target_type varchar(16) not null,        -- grade / artifact_block
  target_id   uuid not null,
  question_id uuid references questions(id),
  block_id    uuid references artifact_blocks(id),
  anchor      jsonb not null,              -- {start, end, quote}
  category    varchar(32) not null,        -- score_wrong / evidence_missing / criteria_misread / wording
  severity    varchar(16) not null default 'suggestion', -- blocking / suggestion
  content     text not null,
  status      comment_status not null default 'open',
  created_by  uuid not null references users(id),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create table regeneration_runs (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  target_type       varchar(16) not null,
  target_id         uuid not null,
  comment_ids       uuid[] not null,
  mode              varchar(16) not null default 'incremental',
  status            job_status not null default 'queued',
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  diff              jsonb,
  error             text,
  created_by        uuid not null references users(id),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);
```

### G. AI 资产

```sql
create table corpora (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  key         varchar(40) not null,        -- advice / template / rubric_pattern / example / policy_term
  name        varchar(80) not null,
  type        corpus_type not null,
  description text not null default '',
  embedding_model varchar(80) not null default 'text-embedding-v3',
  status      varchar(20) not null default 'active',
  created_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

create table corpus_entries (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id),
  corpus_id     uuid not null references corpora(id) on delete cascade,
  title         varchar(200) not null default '',
  content_md    text not null,
  tags          text[] not null default '{}',
  metadata      jsonb not null default '{}',   -- 适用题型、地区、年份、分数段
  enabled       boolean not null default true,
  embedding     vector(1024),
  embedding_status varchar(20) not null default 'pending',
  usage_count   int not null default 0,
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index corpus_entries_embedding_idx on corpus_entries
  using hnsw (embedding vector_cosine_ops) where deleted_at is null;

create table prompt_templates (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  key         varchar(60) not null,        -- grade_essay / parse_rubric / gen_advice
  name        varchar(80) not null,
  purpose     prompt_purpose not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

create table prompt_versions (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id),
  template_id   uuid not null references prompt_templates(id) on delete cascade,
  version       int not null,
  system_prompt text not null,
  user_template text not null,             -- 含 {{variables}}
  output_schema jsonb,                     -- JSON Schema，用于结构化输出校验
  model_params  jsonb not null default '{}', -- {temperature:0, maxTokens:...}
  status        varchar(20) not null default 'draft', -- draft / published / archived
  eval_score    numeric(4,2),
  published_at  timestamptz,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (template_id, version)
);

create table model_providers (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id),
  name        varchar(60) not null,
  kind        varchar(24) not null,        -- openai_compat（DeepSeek/通义/豆包均属此类） / azure / anthropic
  base_url    text not null,
  api_key_enc bytea,
  key_version int not null default 1,
  status      varchar(20) not null default 'active',
  created_at  timestamptz not null default now()
);

create table models (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id),
  provider_id   uuid not null references model_providers(id) on delete cascade,
  model_id      varchar(80) not null,      -- deepseek-flash（本期唯一模型）
  display_name  varchar(80) not null,
  context_window int,
  input_price_cents  numeric(10,4) not null default 0,  -- 每 1K token
  output_price_cents numeric(10,4) not null default 0,
  capabilities  jsonb not null default '{}',  -- {json_mode, streaming, context_window}
  is_default    boolean not null default false,
  status        varchar(20) not null default 'active'
);

create table ai_usage_logs (
  id                uuid primary key,
  tenant_id         uuid not null references tenants(id),
  user_id           uuid references users(id),
  purpose           prompt_purpose not null,
  model_id          uuid references models(id),
  prompt_version_id uuid references prompt_versions(id),
  ref_type          varchar(24),           -- exam / sheet / artifact / corpus
  ref_id            uuid,
  tokens_in         int not null default 0,
  tokens_out        int not null default 0,
  cost_cents        int not null default 0,
  latency_ms        int,
  status            varchar(16) not null default 'succeeded',
  error_code        varchar(40),
  trace_id          varchar(64),
  created_at        timestamptz not null default now()
);
```

### H. 文件与运维

```sql
create table files (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id),
  bucket       varchar(80) not null,
  storage_key  text not null,
  mime         varchar(120) not null,
  size_bytes   bigint not null,
  sha256       char(64) not null,
  kind         varchar(32) not null,        -- rubric_source / answer_image / export
  uploaded_by  uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (tenant_id, sha256, size_bytes)
);

create table export_tasks (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  format         varchar(8) not null,       -- docx / pdf
  status         job_status not null default 'queued',
  file_id        uuid references files(id),
  error          text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create table audit_logs (
  id            bigserial primary key,
  tenant_id     uuid not null,
  actor_id      uuid,
  actor_name    varchar(80),
  action        varchar(60) not null,       -- exam.rubric.confirm
  resource_type varchar(40) not null,
  resource_id   uuid,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  trace_id      varchar(64),
  created_at    timestamptz not null default now()
);

create table idempotency_keys (
  tenant_id   uuid not null,
  key         varchar(120) not null,
  endpoint    varchar(120) not null,
  request_hash char(64) not null,
  status_code int,
  response    jsonb,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (tenant_id, key)
);
```

---

## 3. 枚举

| 枚举 | 值 |
|---|---|
| `tenant_status` | `active` / `suspended` / `closed` |
| `user_status` | `active` / `invited` / `disabled` |
| `exam_status` | `synced` / `rubric_pending` / `parsing` / `rubric_review` / `ready` / `grading` / `review_pending` / `reviewing` / `revision` / `completed` / `archived` |
| `rubric_status` | `draft` / `parsing` / `parsed` / `confirmed` / `superseded` |
| `sheet_status` | `pending` / `grading` / `graded` / `reviewing` / `revision` / `approved` / `delivered` / `failed` |
| `grade_status` | `ai` / `edited` / `approved` |
| `job_status` | `queued` / `running` / `succeeded` / `partial` / `failed` / `cancelled` |
| `job_item_status` | `queued` / `running` / `succeeded` / `failed` / `skipped` |
| `artifact_type` | `problem_overview` / `problem_analysis` / `improvement_advice` / `full_report` |
| `artifact_status` | `draft` / `generating` / `pending_review` / `revising` / `approved` / `delivered` |
| `deliverable_status` | `draft` / `pending_review` / `approved` / `exported` / `delivered` / `failed` |
| `block_kind` | `heading` / `paragraph` / `list` / `table` / `quote` |
| `block_status` | `active` / `frozen` |
| `task_status` | `pending` / `in_progress` / `approved` / `rejected` |
| `comment_status` | `open` / `resolved` / `dismissed` |
| `corpus_type` | `advice` / `template` / `rubric_pattern` / `example` / `policy_term` |
| `prompt_purpose` | `parse_rubric` / `parse_paper` / `grade` / `generate_artifact` / `regenerate` |
| `question_type` | `essay` / `short_answer` / `objective` |
| `sync_status` | `running` / `succeeded` / `partial` / `failed` |

> 枚举用 PG `enum` 而非 `varchar + check`：Drizzle 生成类型更准。但**新增枚举值必须走迁移**，不能只改代码。

---

## 4. 索引与查询

```sql
-- 列表主查询：租户 + 时间倒序 + 状态过滤
create index exams_tenant_time_idx on exams (tenant_id, exam_at desc) where deleted_at is null;
create index exams_tenant_status_idx on exams (tenant_id, status) where deleted_at is null;
create index exams_title_trgm_idx on exams using gin (title gin_trgm_ops);

-- 答卷：按场次筛选未批改
create index answer_sheets_exam_status_idx on answer_sheets (exam_id, status);
create index answer_sheets_tenant_idx on answer_sheets (tenant_id, submitted_at desc);

-- 批改任务：进度查询
create index grading_jobs_exam_idx on grading_jobs (exam_id, created_at desc);
create index grading_job_items_job_status_idx on grading_job_items (job_id, status);

-- 审核：我的队列
create index review_tasks_reviewer_status_idx on review_tasks (reviewer_id, status);
create index review_comments_target_idx on review_comments (target_type, target_id, status);

-- 语料：标签与检索
create index corpus_entries_tenant_corpus_idx on corpus_entries (tenant_id, corpus_id) where deleted_at is null;
create index corpus_entries_tags_idx on corpus_entries using gin (tags);
create index corpus_entries_fts_idx on corpus_entries using gin (to_tsvector('simple', title || ' ' || content_md));

-- 计量与审计：按时间范围聚合
create index ai_usage_logs_tenant_time_idx on ai_usage_logs (tenant_id, created_at desc);
create index audit_logs_tenant_time_idx on audit_logs (tenant_id, created_at desc);
create index audit_logs_resource_idx on audit_logs (resource_type, resource_id);
```

**几个容易踩的坑**

- `exams.sheet_count/graded_count` 是冗余计数：用触发器或 worker 异步更新，不要每次 COUNT(*)。
- `answers.content_md` 可达数万字，不要 SELECT * 列表页带出来；列表页只取长度与分数。
- 审核队列的 `target_id` 是多态外键（sheet 或 artifact），无法建 FK；用应用层校验 + 定时一致性巡检。
- `audit_logs` 用 `bigserial`，按 `created_at` 做月度分区（数据量 > 500 万时）。

---

## 5. 多租户与 RLS

应用层每次请求设置会话变量，数据库层兜底：

```sql
-- 连接池取出连接后，每个事务开始执行：
set local app.tenant_id = '019a...';
set local app.user_id   = '019a...';

alter table exams enable row level security;
create policy exams_tenant_isolation on exams
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

注意事项：

- 连接池 + `set local` 必须在**同一事务**内，否则变量泄漏到下一个请求；
- 迁移/后台任务用 `bypassrls` 角色，业务连接用受限角色；
- RLS 是第二道防线，第一道仍是 repository 层强制传 `tenant_id`；
- 每个租户的集成密钥各自加密，禁止全局共享（除平台级 LLM Key，按套餐分发）。

**加密**：`phone_enc`、`secrets_enc`、`api_key_enc` 用 AES-256-GCM，密文格式 `[key_version(1B) | iv(12B) | tag(16B) | ciphertext]`；密钥放 KMS/Secrets Manager，应用启动拉取；轮换时按 `key_version` 双读。

---

## 6. 迁移、种子与数据治理

**迁移规范**

1. 只改 `schema.ts`，然后 `bun run db:generate` 生成 SQL；**不手写已生成的迁移文件**。
2. 迁移必须可前滚；破坏性变更（删列/改类型）走 expand → migrate → contract 三步，跨两次发布。
3. 大表加索引用 `CREATE INDEX CONCURRENTLY`（Drizzle 生成后手工加 `CONCURRENTLY`，并放到独立迁移）。
4. 每个迁移在 CI 用空库 + 生产 schema dump 各跑一次。
5. 迁移文件命名 `NNNN_snake_case.sql`，与 PR 绑定，评审必须看 SQL。

**种子数据**

- `permissions`、`pages` 由代码常量生成 seed（CI 校验 DB 与代码一致，防止"页面加了但矩阵里没有"）。
- 内置角色（6 个）与默认页面矩阵随租户创建时初始化。
- 演示数据单独脚本，禁止进生产。

**数据保留与删除**

| 数据 | 保留 | 说明 |
|---|---|---|
| 答卷原文/图片 | 3 年（可配） | 到期归档到冷存储或删除 |
| 判分/交付物 | 3 年 | 与答卷同生命周期 |
| AI 调用日志 | 1 年 | 含 token 与成本，用于对账 |
| 审计日志 | 3 年 | 合规要求 |
| 会话 | 30 天 | 过期清理任务 |
| 幂等键 | 24 小时 | 定时清理 |

学员行使删除权时：软删 `answer_sheets` + 异步清理对象存储 + 保留脱敏后的统计聚合（不含原文）。删除动作必须审计。

---

## 7. 容量估算（按 Q6 默认假设）

- 30 场/月 × 300 份 × 5 题 = 4.5 万条 `grades`/月，3 年约 160 万条；`grade_points` 约为其 3 倍（480 万）。
- 单份答卷原文 1–3 KB，图片 0.5–2 MB；3 年对象存储约 300 GB（含导出文件）。
- `ai_usage_logs` 每月约 10 万条（批改 + 生成 + 重生成），1 年 120 万，单表可承受；超过 1000 万再按月分区。
- 结论：单实例 4C8G PostgreSQL 足够支撑到约 50 家同规模机构；瓶颈在 LLM 并发而不在数据库。
