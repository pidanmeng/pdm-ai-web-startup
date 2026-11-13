# 04 · 平台 Key、资源清单与部署上线

> 目标：把"要开通什么、要买什么、放哪儿、怎么发版、怎么合规"一次说清，避免开发到一半卡在资质和密钥上。
> 关键前置：**ICP 备案（2–4 周）** 和 **微信开放平台/公众号认证（1–2 周）** 是长周期项，第一天就要启动。
> 部署口径以 **2026-11-13 决策**为准（见第 0 节）。Vercel 是**过渡方案**，正式入口的迁移触发条件与步骤见第 7 节。

---

## 0. 本期决策（2026-11-13）

| 决策项 | 本期选择 | 理由 | 复核 / 迁移条件 |
|---|---|---|---|
| OCR | **百度智能云文字识别**（通用高精度含位置 + 手写 + 表格识别 V2） | 中文/手写/表格均衡，有免费额度，境内主体 | 手写行准确率 < 85%，或整卷识别成本 > ¥0.5/份 |
| 大模型 | **DeepSeek 4.1 Flash（`deepseek-flash`）为唯一模型** | 单价低、中文强、OpenAI 兼容、判分场景够用 | 难例率 > 10%，或长上下文不足（一份评分要点 + 答卷超窗） |
| 应用运行 | **Vercel**（`web` + `api` 两个 Project） | Git 集成即 CI/CD，PR 预览 + 秒级回滚，M0/M1 上线最快 | 见 7.1 |
| 数据库 | **阿里云 RDS PostgreSQL 16** | 托管备份、`pgvector`、与境内合规一致 | 持续，随数据量升配 |
| 对象存储 | **阿里云 OSS** | 私有 Bucket + 签名 URL，与 RDS 同厂 | 持续 |
| 备案与固定出口 | **阿里云 CDN（回源 Vercel）+ 1 台低配 ECS（固定 EIP）** | 备案需要境内资源；小鹅通 IP 白名单需要固定出口 | 迁境内后合并成应用机 |

> 一句话：**Vercel 负责"快"，阿里云负责"数据落地"**。代价是请求经境外、Vercel 出口 IP 不固定——这两点在第 2.5 节给了规避方式与红线，别当成没看见。

---

## 1. 平台 Key 与账号清单

### 1.1 微信生态（登录）

| 项 | 用途 | 需要什么 | 提前期 | 备注 |
|---|---|---|---|---|
| 微信开放平台 · 网站应用 | PC 端扫码登录 | AppID、AppSecret、授权回调域 | 认证 1–2 周 | 企业主体，认证费 300 元/年；回调域必须已备案且 HTTPS |
| UnionID 机制 | 同一用户跨公众号/网站识别 | 开放平台绑定公众号 | 绑定后生效 | 不做绑定就只能用 openid，换主体会丢用户 |
| 微信支付（可选） | 二期计费 | 商户号、API v3 密钥、证书 | 2–3 周 | MVP 不做 |

**关键约束**

- 网站应用扫码登录走 `https://open.weixin.qq.com/connect/qrconnect`，`redirect_uri` 域名必须与备案主体一致。
- 公众号网页授权走 `snsapi_base`（静默，拿 openid）或 `snsapi_userinfo`（拿昵称头像，需用户确认）；H5 里优先 `snsapi_base`，头像昵称让用户自己填。
- 微信要求服务器配置 URL 校验（`signature/timestamp/nonce/echostr`），部署时必须先把校验文件/接口跑通，否则公众号后台保存不了。Vercel 上把 `MP_verify_*.txt` 放 `public/` 即可通过域名归属校验。
- 所有微信域名（授权回调、JS 安全域名、业务域名）都要备案 + HTTPS，且不能带端口。**备案与 Vercel 的关系见 6.1**——不要等到联调那天才发现回调域没备案。

### 1.2 小鹅通（业务数据源）

| 项 | 用途 | 需要什么 | 备注 |
|---|---|---|---|
| 小鹅云开放平台 | 拉考试、考卷、答卷、学员 | `app_id`、`app_secret`（部分版本叫 `client_id`/`client_secret`） | 在「小鹅通后台 → 应用 → 经营渠道 → 多渠道终端 → API 自主开发」创建 |
| 接口权限集 | 考试管理、用户管理、课程/学习数据 | 在控制台申请开通 | **不同套餐开放的能力不同，必须让商务确认** |
| IP 白名单 | 调 `access_token` 前置条件 | 生产出口 IP（NAT 网关/ECS 公网 IP） | 不在白名单直接拒绝；Vercel 无固定出口 IP，走阿里云 ECS 代理（见 2.3 / 2.5） |
| 消息推送 | 学员交卷事件、考试变更 | 回调 URL + 验签 token | 可把"交卷即入队批改"做成准实时 |
| 店铺 ID | 多店铺隔离 | `app_id` 即店铺标识 | 多机构要按店铺隔离 |

**接口事实（已核实）**

- `access_token`：`GET https://api.xiaoe-tech.com/token`，有效期 7200 秒，剩余 < 30 分钟刷新会返回新 token，旧 token 短暂并存；接口限频 10 分钟 100 次；**必须中控单点刷新**，不能每个 worker 各自刷。
- 业务接口统一 `POST https://api.xiaoe-tech.com/xe.*/1.0.0`，参数含 `access_token` 与 `buz_data`。
- 已有「获取考试列表」等考试管理接口，具体字段以开通后的文档为准（不同版本字段有差异）。

> 参考：[获取 access_token](https://api-doc.xiaoe-tech.com/api_list/get_access_token.html)、[考试管理接口](https://xiaoe-tech.apifox.cn/api-15735670)、[开放平台文档首页](https://api-doc.xiaoe-tech.com/)

**接入设计要点**

1. `access_token` 由一个 `TokenManager` 统一持有（DB + 进程内缓存 + 分布式锁），其他服务只读。
2. 所有调用带重试（指数退避，仅幂等读接口）与熔断；失败写 `sync_runs.error`，可单条重放。
3. 若"答卷"接口只给图片，需要 OCR 链路（见 1.4）。
4. 若没有交卷 webhook，退化为定时轮询（5–15 分钟）——**这会直接影响"批改时效"的产品承诺，需商务确认**。
5. 小鹅通的调用必须从**固定 EIP** 出网（阿里云 ECS 反向代理），否则 IP 白名单对不上；这一点在 Vercel 阶段是硬约束。

### 1.3 大模型（DeepSeek 4.1 Flash，唯一）

| 用途 | 模型 id | 参数 | 备注 |
|---|---|---|---|
| 评分要点/试卷结构化 | `deepseek-flash` | `temperature=0`，JSON 输出 | 长文本；分片后逐段抽，避免超窗 |
| 主观题判分 | `deepseek-flash` | `temperature=0–0.2`，JSON 输出 | 必须带"评分要点 + 学员原文 + 输出 Schema" |
| 交付物生成（问题分析/提升建议） | `deepseek-flash` | `temperature=0.3`，流式 | 引用语料必须带出处，不允许自由发挥分数 |
| 难例复核 / 夜间评测 | `deepseek-flash` | 同模型 | **不为难例换模型**，避免同一场次分数口径分裂 |

**配置（仅服务端）**

```dotenv
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-flash        # DeepSeek 4.1 Flash；以控制台实际 id 为准
LLM_API_KEY=sk-...              # 只进 Vercel api 项目环境变量
```

**调用约束**

- **只用这一个模型**，不接第二家：切换模型 = 改环境变量 + 重跑评测集，不在代码里硬编码模型名（`models` 表按 `model_id` 记账）。
- 结构化输出：`response_format: {"type": "json_object"}` + JSON Schema 校验；格式错重试 ≤ 2 次，第 3 次进人工队列，**不静默返回空结果**。
- 超时：单次 60s（流式首包 10s 未到即重试）；并发闸门默认 8/租户、全局 32；429/5xx 指数退避（1s/2s/4s，最多 4 次）。
- 计量：每次调用写 `ai_usage_logs`（`tokens_in/out`、`model_id`、`purpose`、`latency_ms`、`cost_cents`）；单价进 `models` 表，代码只读配置。
- 数据最小化：只传题干、参考答案/要点、学员作答；**不传**姓名、手机号、微信 openid、店铺学员 ID（用内部 UUID 关联）。
- 合规：与 DeepSeek 确认数据处理条款——不用于训练、留存期 ≤ 30 天（以控制台/合同为准）；企业实名认证与发票提前办。

**单供应商风险与预案**

| 场景 | 动作 | 不做什么 |
|---|---|---|
| 限流 / 5xx | 指数退避 → 任务改期入队 → 前端展示"排队中，预计 x 分钟" | 不降级到别家模型 |
| 输出不合规（Schema 校验失败） | 重试 2 次（temperature=0）→ 人工队列 | 不把半成品写进 `grades` |
| 长时间不可用（> 2h） | 暂停新批次入队，保留已入队任务；公告 + 值班 | 不改 Prompt 临时"救火" |
| 模型升级/下线 | 先在评测集跑对比（05 篇 §8），再改环境变量 | 不在业务代码里写死版本 |

> 双供应商能力保留在数据层：`model_providers` / `models` 支持多行，且都是 OpenAI 兼容协议；接第二家是"加配置 + 跑评测"，不是改代码。**但本期不接。**

### 1.4 文档解析与 OCR（百度智能云）

| 场景 | 百度能力/接口 | 说明 |
|---|---|---|
| 评分要点 PDF/DOCX（文本层完好） | 本地 `pdfjs-dist` / `mammoth` 解析 | 最便宜，不耗 OCR 额度；解析失败再降级到 OCR |
| 扫描件、拍照卷面 | 通用文字识别（高精度含位置版）`/rest/2.0/ocr/v1/accurate` | 需要坐标做题目切分；精度优先于速度 |
| 手写答案 | 手写文字识别 `/rest/2.0/ocr/v1/handwriting` | 连笔/涂改不稳，必须配人工校对 |
| 复杂表格（成绩单、评分表） | 表格文字识别 V2 | 老的同步/异步表格接口已停止更新、即将下线，直接用 V2 |
| 拍照畸变、阴影 | 图像去畸变/切边增强（可选） | 手机拍摄比例高时再上，先看 badcase |

**接口事实（已核实，2026-11）**

- 鉴权：新版用 API Key（`Authorization: Bearer <API Key>`，`bce-v3/` 前缀，以官方鉴权文档为准）；老方式 `POST https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}` 换 `access_token`，有效期 30 天，**提前 1 天刷新、中控单点刷新**（同小鹅通，不能每个 worker 各刷）。
- 通用识别 4 个版本：`general_basic`（标准）、`accurate_basic`（高精度）、`general`（标准含位置）、`accurate`（高精度含位置）；含位置版返回 `location{left,top,width,height}`。
- 输入：`image`（base64 后 urlencode ≤ **10MB**）、`url`、`pdf_file`、`ofd_file` 四选一；最短边 ≥ 15px，最长边 ≤ 8192px，支持 jpg/jpeg/png/bmp。PDF 可直接传，扫描版评分要点不必逐页转图。
- 返回：`words_result[]`（`words` + 可选 `location`）、`words_result_num`、`log_id`。**按行返回，不保证题目分段**——切题必须自己做。
- 限频：按套餐给 QPS（免费/低档很低），批量识别必须排队 + 退避；不够就买 QPS 叠加包，**不要多账号轮询**（会封）。
- 计费：注册有免费测试额度，超出按次/次数包计费，价格以控制台为准（估算见第 5 节）。

> 参考：[文字识别文档首页](https://cloud.baidu.com/doc/OCR/index.html)、[通用文字识别（高精度含位置版）](https://cloud.baidu.com/doc/qianfan-api/s/kmwbl44wu)、[计费概述](https://cloud.baidu.com/doc/OCR/s/Jk3h7xtsd)

**接入设计**

1. 链路：小鹅通下载 / 用户上传 → OSS 原图（私有）→ 百度 OCR → `ocr_jobs`（原文、坐标、置信度、费用、`log_id`）→ 题目切分 → 判分。
2. 题目切分：优先用含位置版的 `top/height` 做 y 轴聚类，用「第 N 题」「N.」正则锚定；失败则让 DeepSeek 按题号切分，切分结果**允许人工修正**并留痕。
3. 幂等与重试：以 `sha256(图片字节)` 去重，同图只识别一次；网络/限频错误退避重试 3 次；仍失败的卷子进"待人工"队列，不阻塞整场。
4. 手写质量：OCR 文本**不得直接当最终答案**。低于置信度阈值的行标 `needs_review`，判分结果页提示"识别可能有误，建议核对原图"，并提供并排对照。
5. 成本：`ocr_jobs` 记每次调用费用；整卷识别前按"页数 × 单价"预估，超过 ¥0.5/份告警（说明卷面页数或清晰度异常）。
6. 合规：只传**题目区域裁剪图**，不带姓名/考号/座位号；OSS 私有 + 5–10 分钟签名 URL；与百度签数据处理条款（不用于训练）。

### 1.5 基础设施

| 资源 | 选择 | 规格（MVP） | 说明 |
|---|---|---|---|
| 应用运行（web + api） | Vercel Pro | 2 个 Project，Functions 区域 `hkg1` | 见第 2 节；Pro 才有分钟级 Cron 与 300s 函数 |
| 数据库 | 阿里云 RDS PostgreSQL 16 | 4C8G，100G SSD，开 `pgvector` + `pg_trgm` + 数据库代理 | 托管备份；临时阶段开公网地址 + SSL |
| 对象存储 | 阿里云 OSS | 标准 + 低频，私有 Bucket | 签名 URL；生命周期见 2.3 |
| CDN | 阿里云 CDN | 按量，回源 Vercel | 已备案域名，大陆访问统一走 CDN |
| 固定出口 | 阿里云 ECS 1C2G + EIP | 最低配 | 小鹅通代理出口 + 备案载体；迁移时升级复用 |
| 缓存/限流（可选） | 阿里云 Redis 1G | M2 再上 | 本期用 RDS + 进程内缓存，不提前引入 |
| 日志/审计 | `audit_logs` / `ai_usage_logs` 落 RDS | 留存 ≥ 6 个月 | Vercel 日志保留期短，不能当唯一证据 |

### 1.6 平台级密钥清单

| 变量 | 用途 | 存放 | 轮换 |
|---|---|---|---|
| `DATABASE_URL` | RDS 连接（`sslmode=require`） | Vercel env（Production/Preview 分库）+ GitHub Secrets | 90 天 |
| `LLM_API_KEY` | DeepSeek | Vercel env（仅 api 项目） | 90 天 / 泄露即换 |
| `BAIDU_OCR_API_KEY`（或 `AK/SK`） | 百度 OCR 鉴权 | Vercel env（仅 api 项目） | 90 天 |
| `OSS_ACCESS_KEY_ID` / `SECRET` | OSS 签名 | Vercel env | 90 天 |
| `APP_ENCRYPTION_KEY` | 租户密钥 AES-GCM 加密 | Vercel env + 离线备份 | 1 年（需重加密迁移） |
| `CRON_SECRET` | Cron / 内部任务鉴权 | Vercel env | 90 天 |
| `XIAOE_PROXY_TOKEN` | Vercel → ECS 代理鉴权 | Vercel env + ECS env | 90 天 |

> 分层原则：**平台自己的** key 放 Vercel 环境变量；**租户的** key（小鹅通 `app_secret`、微信 AppSecret）加密后存 `integrations.secrets_enc`，不进环境变量、不进代码、不进日志。

---

## 2. 部署拓扑：Vercel + 阿里云 RDS

### 2.1 请求路径

```
浏览器 / 微信 H5
   │ HTTPS（已备案域名，走阿里云 CDN）
   ▼
阿里云 CDN ──回源──▶ Vercel · web（Next.js App Router，静态 + RSC + BFF）
                        │ 同域 /api/*（next.config rewrites，避免 CORS）
                        ▼
                     Vercel · api（Elysia，函数运行时）
                        ├──▶ 阿里云 RDS PostgreSQL 16（公网地址 + SSL + 数据库代理）
                        ├──▶ 阿里云 OSS（私有 Bucket + 签名 URL）
                        ├──▶ 百度智能云 OCR（HTTPS 出网）
                        └──▶ DeepSeek API（deepseek-flash，境内）

Vercel Cron（每 1 分钟）──▶ /api/jobs/drain（≤300s）──▶ pg-boss 队列（在 RDS 里）
阿里云 ECS（固定 EIP）──▶ 小鹅通 OpenAPI（IP 白名单）+ 备案载体
```

### 2.2 Vercel 侧配置

- **两个 Project**：`xs-web`（Next.js，根目录 `apps/web`）与 `xs-api`（Elysia，根目录 `apps/server`）。对外只暴露一个域名：web 用 `next.config` 把 `/api/*` 重写到 `API_INTERNAL_URL`，避免 CORS 与跨站 Cookie 问题。
- **区域**：Functions Region 选 `hkg1`（香港），到华东 RDS 约 20–40ms；不要用美区节点（跨境往返 + 合规都难受）。
- **运行时（上线前置，不是部署当天再试）**：Elysia 现在依赖 `Bun.sql`。先验证 Vercel Functions 的 Bun runtime 是否可用；不可用则把 DB 访问切到 `postgres.js`（Node 运行时），本地继续用 Bun 跑。**这项验证不通过，Vercel 方案不成立**，要提前一周做。
- **函数规格**：默认 1 vCPU / 2GB；`maxDuration` 默认 60s（Hobby），Pro 可到 300s（Fluid compute 更高，以官方限制为准）。SSE 判分路由按"单卷"设计，批量拆片，单次 ≤ 40 份。
- **Cron**：`/api/jobs/drain` 每 1 分钟（Pro）；Header 带 `Authorization: Bearer $CRON_SECRET`；pg-boss 直接用 RDS 当队列，**M2 之前不引入 Redis**。
- **日志**：Vercel 日志保留期有限且默认记录请求信息 → 业务/审计日志必须落 RDS；错误上报接 Sentry（境内可用阿里云 ARMS）。
- **构建**：monorepo 用 `bun install --frozen-lockfile`，`bun run build`；Preview 用独立 env（测试库 + 测试 key），**绝不连生产库**。

### 2.3 阿里云侧配置

**RDS PostgreSQL**

- 版本 16，创建后执行 `CREATE EXTENSION IF NOT EXISTS vector;` 与 `pg_trgm`；字符集 UTF8、时区 `Asia/Shanghai`。
- 网络：临时阶段用**公网地址**（Vercel 在境外，进不了 VPC）。必须开 SSL（`sslmode=require`），安全组只放 5432，白名单 `0.0.0.0/0`——因为 Vercel 出口 IP 不固定，只能靠"SSL + 32 位随机密码 + 最小权限账号 + 连接数监控"兜底。
- 连接池：serverless 每次冷启动建连，**必须**开 RDS 数据库代理（连接池，transaction 模式）或前置 pgbouncer；应用侧连接池 `max: 3–5`，函数结束即释放。
- 账号：`xs_app`（业务，无 superuser，仅 CRUD/序列/扩展使用）、`xs_migrator`（只给迁移 job 用）、`xs_readonly`（报表/排查）。
- 备份：自动备份 7 天 + WAL；每月做一次"恢复到临时实例"演练，别只相信备份成功提示。
- 监控：CPU > 70%、连接数 > 70%、慢查询 > 1s、公网流量突增告警（突增 = 被扫）。

**OSS**

- 私有 Bucket，不开公共读；上传走服务端签名 URL（限制 `content-type` 与大小），下载用 5–10 分钟过期签名 URL。
- 生命周期：答卷原图 180 天转低频，导出文件 30 天清理；开版本控制（误删可恢复）。
- 跨域：只允许自有域名 `PUT/POST`，别图省事写 `*`。

**CDN 与域名**

- 已备案域名 → 阿里云 CDN → 回源 Vercel（`*.vercel.app` 或 Vercel 自定义域名），开启 HTTPS（免费证书够用）。
- 缓存：`/_next/static/*` 长缓存（immutable），`/api/*` 不缓存；HTML 短缓存 + 回源。
- Vercel 默认域名在大陆访问不稳定，**正式入口统一走 CDN**，别拿 `xxx.vercel.app` 做对外链接。

**ECS（固定出口 + 备案载体）**

- 最低配 1C2G + 固定 EIP；Nginx 反代小鹅通（或自建 HTTP CONNECT 代理），校验 `XIAOE_PROXY_TOKEN`。
- 小鹅通 IP 白名单填这台 EIP；所有 `access_token` 刷新与业务调用都从这里出网，`TokenManager` 也放在这里最省事（M2 迁 worker 时直接搬过去）。
- 备案要求"域名指向境内可访问资源"，这台 ECS 同时承担备案核验；迁移境内时升级成应用机，不浪费。

### 2.4 环境变量（生产）

| 变量 | 所属 Project | 示例 / 说明 | 敏感 |
|---|---|---|---|
| `DATABASE_URL` | api | `postgresql://xs_app:...@pgm-xxx.pg.rds.aliyuncs.com:5432/xs?sslmode=require` | 是 |
| `LLM_BASE_URL` / `LLM_MODEL` | api | `https://api.deepseek.com/v1` / `deepseek-flash` | 否 |
| `LLM_API_KEY` | api | DeepSeek key | 是 |
| `BAIDU_OCR_API_KEY` | api | 百度 OCR 应用 API Key | 是 |
| `OSS_ENDPOINT` / `OSS_BUCKET` / `OSS_*_KEY` | api | 私有 Bucket、签名 | 部分 |
| `XIAOE_PROXY_URL` / `XIAOE_PROXY_TOKEN` | api | ECS 代理地址与内部 token | 是 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | api | 平台级微信登录应用 | 是 |
| `API_INTERNAL_URL` | web | 指向 `xs-api` 的部署地址（同域重写用） | 否 |
| `CRON_SECRET` | api | Cron 与内部任务鉴权 | 是 |
| `SENTRY_DSN` | web + api | 错误上报（可选） | 否 |

### 2.5 已知冲突与规避（Vercel 阶段）

| # | 冲突 | 影响 | 临时规避 | 正式方案 |
|---|---|---|---|---|
| 1 | Vercel 函数无固定出口 IP | 小鹅通 `access_token` 的 IP 白名单过不了 | 小鹅通调用统一走阿里云 ECS 固定 EIP 代理 | 迁境内，worker 直接在内网出网 |
| 2 | 备案要求境内资源 | 微信回调域、大陆访问 | 1 台低配 ECS 完成备案 + 阿里云 CDN 回源 Vercel | 迁境内后域名直指 SLB |
| 3 | 请求经境外（数据出境） | 学员个人信息出境 | 试点只用脱敏/测试数据；Vercel 侧不落盘、日志脱敏、关闭 body 日志 | 真实数据上线前完成境内迁移（见 6.2、7.1） |
| 4 | 函数时长/冷启动 | 批量批改跑不完；首包慢 | Cron drain 分片（≤40 份/次）+ 单卷流式；Cron ping 保持常热 | 迁境内长驻 worker（pg-boss） |
| 5 | 连接数上限 | 冷启动多 → RDS 连接爆 | RDS 数据库代理 + 应用池 3–5 + 连接数告警 | 长驻服务 + pgbouncer |
| 6 | 日志留存短 | 等保审计证据不足 | `audit_logs` 落 RDS，Vercel 日志只做排障 | 迁境内后接 SLS |

> 这 6 条是 Vercel 方案的**已知代价**，不是待办。第 3 条是红线：一旦要处理真实学员数据，先看 6.2 和 7.1。

---

## 3. CI/CD：GitHub → Vercel

### 3.1 分支与部署映射

| 事件 | 动作 | 结果 |
|---|---|---|
| PR 创建/更新 | GitHub Actions 门禁 + Vercel Preview 构建 | 独立预览 URL（开 Deployment Protection） |
| PR 合并 `main` | Actions 全绿 → 迁移 job（人工 approve）→ Vercel Production | 线上版本 |
| 打 tag `v*` | 记录 release + 归档 `openapi.json` 快照 | 回滚锚点 |

### 3.2 门禁

- 复用 05 篇 §9.1 的 10 条：format / lint / typecheck / test / 集成测试 / openapi diff / migration check / secretlint / preview 冒烟（不跑 e2e）/ 人工评审。
- Vercel 只负责构建与部署，**不替代测试**；GitHub 分支保护要求检查通过才能合并，别关掉。

### 3.3 数据库迁移（关键，别偷懒）

- **迁移不在 Vercel build 里跑**：Preview 部署也会执行 build，很容易把测试数据写到生产库。
- 用 GitHub Actions 的 `deploy` job，`environment: production`（需人工 approve）：

```yaml
- run: bunx drizzle-kit migrate
  env:
    DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}   # xs_migrator，仅此 job 可读
- run: curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"
  env:
    VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}
```

- 迁移必须**向前兼容**（expand → 双写/回填 → contract），保证"回滚代码不回滚 schema"。
- 破坏性变更（删列、改类型）拆两个发布：先停写老列，下个版本再删。

### 3.4 回滚

- 代码：Vercel Deployments → 选上一个正常版本 → Promote to Production / Instant Rollback，秒级生效。
- 数据：按备份/时间点恢复业务数据，**不整体回滚 schema**；迁移脚本不允许出现"不可逆 + 丢数据"的操作。
- 触发条件：5xx > 2%、LLM 失败率 > 10%、P95 > 5s，任一持续 10 分钟即回滚并记录事故。

### 3.5 灰度

- Vercel Rolling Releases：5% → 25% → 100%（Pro）；或按租户白名单 + feature flag 灰度。
- 新 Prompt/模型先跑小评测（05 篇 §8.3），指标下降超阈值则阻断发布。

---

## 4. 上线 Runbook

| 阶段 | 步骤 | 产出 / 验收 |
|---|---|---|
| Day 0 | 阿里云实名与备案启动；百度智能云实名 + 开通 OCR；DeepSeek 充值 + 建 key；Vercel 团队 + GitHub App；微信开放平台认证提交 | 备案受理号、OCR 应用 API Key、模型 key、Vercel 项目空跑 |
| Day 1–2 | 创建 RDS（PG16、pgvector、数据库代理、SSL）；建账号与库；OSS Bucket；ECS + EIP；域名解析 | 本机 `psql` 能连（SSL）、OSS 签名上传成功、代理出口 IP 固定 |
| Day 2–3 | 两个 Vercel Project、env、Cron、域名、预览环境；GitHub Actions 门禁与迁移 job | Preview 可访问；main 合并自动上线；回滚演练通过 |
| 上线前 24h | 跑完下面 10 条冒烟，全绿才发 | 冒烟记录附在 PR/发布单 |
| 上线后 30min | 看 5xx、P95、LLM 失败率、OCR 失败率、RDS 连接数、成本 | 无异常则观察 24h；异常按 3.4 回滚 |

**冒烟清单（10 条）**

1. `GET /health` 返回 db / llm / ocr / storage 全 ok。
2. 微信扫码登录（已备案域名）→ 拿到 unionid → 建用户。
3. 上传 1 页答卷 → OCR 出文本，抽检 20 行错误 ≤ 2 行。
4. 单卷判分 SSE 首包 < 3s，完整 < 60s，结果落 `grades`。
5. 10 卷并发 → P95 < 8s、无 5xx、RDS 连接数 < 上限 60%。
6. Cron drain 能消化 20 条积压任务，且重复触发不重复扣费。
7. 导出 DOCX/PDF 可下载，签名 URL 过期后 403。
8. 审计日志有记录，且不含明文手机号/姓名。
9. 慢查询无 > 1s；`ai_usage_logs` 有本次调用的 token 与费用。
10. 回滚演练：把上一版本 Promote 回去，再切回当前版本。

---

## 5. 成本估算（MVP，月）

| 项 | 规格 | 月成本（¥，估） | 备注 |
|---|---|---|---|
| Vercel Pro | 2 seats | ≈ 300 | 分钟级 Cron、300s 函数、预览环境 |
| 阿里云 RDS PG16 | 4C8G / 100G，包年 | ≈ 900–1,300 | 按量更贵；升配前先看连接数与慢查询 |
| OSS | 100G + 请求 | ≈ 20 | 低频转储后更低 |
| 阿里云 CDN | 500G/月 | ≈ 100–150 | 静态资源为主 |
| ECS + EIP | 1C2G，按量/包年 | ≈ 80–120 | 备案 + 小鹅通代理 |
| 百度 OCR | 4.5 万次/月（30 场 × 300 份 × 5 页） | ≈ 200–600 | 免费额度外按次；高精度含位置略贵 |
| DeepSeek 4.1 Flash | ≈ 5,400 万 tokens/月 | ≈ 300–1,500 | 按 `models` 表单价核算，随 prompt 长度波动 |
| **合计** | | **≈ 1,900–3,900** | 不含人力与备案代办 |

> 表中价格随官网调整，只用于立项预算；真实成本以 `ai_usage_logs` + 云账单为准，**每季度校准一次**并回填 `models` 单价。

---

## 6. 合规与备案

### 6.1 备案（Day 0 启动）

- 网站备案需要：主体资质 + 域名 + **境内服务器资源**（阿里云 ECS/轻量等）。Vercel 不提供备案，也不接受备案核验 → 用 2.3 的 ECS 完成备案。
- 微信侧：授权回调域、JS 安全域名、公众号服务器 URL 都必须备案 + HTTPS + 不带端口；域名归属校验文件放 `public/` 即可。
- 备案期间用 Vercel 默认域名做内部测试；**不要**在未备案域名上做公开推广（大陆访问会被拦截，且影响后续备案）。

### 6.2 数据出境（Vercel 阶段的最大风险）

- 事实：Vercel 函数在境外运行，请求体与日志会出境；学员姓名/手机号/答卷属于个人信息。
- **红线**：真实学员数据（可识别到人）不得在 Vercel 阶段做长期处理。试点只用测试/脱敏数据，或采用"静态页面在 Vercel、全部 API 在境内"的拆分。
- 若必须提前用真实数据：先完成个人信息出境评估/合同（PIPL 第 38 条路径），隐私政策写明处理者、目的、保存期限。**这不是技术能单独解决的，需要法务确认。**
- 技术侧最小化：Vercel 侧不落盘、关闭请求体日志、日志里手机号/姓名打码、OCR 只传题目区域图、`trace_id` 不含 PII。

### 6.3 其他

- 等保二级：审计日志留存 ≥ 6 个月（`audit_logs` 已落库），Vercel 日志不能作为唯一证据。
- 密钥：Vercel env 加密存储 + 阿里云 KMS（可选）；secretlint 门禁禁止 key 进 repo。
- 供应商协议：DeepSeek、百度均需数据处理协议，确认"不用于训练、不留存"。
- 内容安全：生成内容含学员答案与教师点评，导出前过一遍敏感词；不做学员间公开分享。

---

## 7. 迁移到境内（后续）

### 7.1 触发条件（任一命中就启动）

1. 微信登录 + **真实学员数据**上线（出境风险不可接受）；
2. 月答卷 > 5,000 份或并发批改 > 20 卷（函数时长/连接数吃紧）；
3. Vercel + 代理方案月成本超过境内方案 1.5 倍；
4. 备案/CDN 方案满足不了微信或监管要求。

### 7.2 迁移步骤（域名与前端不变）

1. Elysia 打 Docker 镜像（Bun 或 Node 基础镜像），推阿里云 ACR。
2. 阿里云 ACK（或 2 台 ECS + SLB）+ 长驻 worker（pg-boss）+ Redis（限流/缓存）。
3. 数据库/OSS/OCR/DeepSeek 全部不动，只改出口与部署位置；`DATABASE_URL` 换成内网地址，关闭 RDS 公网。
4. 切流：10% 租户 → 50% → 100%，双跑 1 周比对错误率与延迟；DNS 走 CDN 分流。
5. 下线 Vercel Project，回收 EIP/代理；归档迁移记录与指标对比。

### 7.3 迁移后预期

- 应用层成本降 30–50%，但多出发布、监控、备份的运维成本；
- 预览环境用"预发环境 + Docker Compose"替代 Vercel Preview；
- 小鹅通白名单、微信回调域、备案信息保持同一主体，域名不变，用户无感。

---

## 8. 参考

- 百度智能云：[文字识别文档](https://cloud.baidu.com/doc/OCR/index.html)、[通用文字识别（高精度含位置版）](https://cloud.baidu.com/doc/qianfan-api/s/kmwbl44wu)、[计费概述](https://cloud.baidu.com/doc/OCR/s/Jk3h7xtsd)
- DeepSeek：[API 文档](https://api-docs.deepseek.com/)
- Vercel：[Functions 限制](https://vercel.com/docs/functions/limitations)、[Cron Jobs](https://vercel.com/docs/cron-jobs)、[Rolling Releases](https://vercel.com/docs/rolling-releases)
- 阿里云：[RDS PostgreSQL](https://www.aliyun.com/product/rds/postgresql)、[OSS](https://www.aliyun.com/product/oss)、[CDN](https://www.aliyun.com/product/cdn)
- 小鹅通：[获取 access_token](https://api-doc.xiaoe-tech.com/api_list/get_access_token.html)
