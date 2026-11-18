---
name: deploy-ops
description: 部署、运维与 .env 同步。向阿里云 ECS（ai.koiism.cn / pm2 + nginx + PostgreSQL）发布这个 AI Web 项目、回滚、查日志、重启、跑冒烟、开数据库隧道，或修改并下发服务器端环境变量时使用。当用户说“发布/上线/部署”“回滚”“看日志”“服务挂了”“改一下线上配置/密钥”“同步 env”“证书/域名”时加载本 Skill。
---

# deploy-ops · 部署 / 运维 / `.env` 同步

一套自包含的运维入口：**SKILL.md（手册）+ `scripts/`（可执行）+ `.env`（全部敏感值）**。
GitHub Actions 的 `deploy.yml` 调用的就是这里的同一份脚本，所以「CI 能做的，本地也能做」。

```
skills/deploy-ops/
├── SKILL.md                 # 本文件
├── .env                     # 真实配置与密钥（已 gitignore，永不提交）
├── .env.example             # 变量清单（提交）
├── env/
│   ├── server.env.tpl       # → 服务器 shared/server.env
│   └── web.env.local.tpl    # → 服务器 shared/web.env.local
└── scripts/
    ├── ops.mjs              # 唯一本地入口（Windows/macOS/Linux 通用）
    └── remote/              # 在服务器上执行的 bash（经 ssh stdin 注入）
        ├── _common.sh       # 变量 / 日志 / switch_release()
        ├── bootstrap.sh     # 一次性初始化
        ├── release.sh       # 切换 release
        ├── rollback.sh      # 回滚
        ├── env-write.sh     # 安装 env 文件并重载
        └── smoke.sh         # 冒烟
```

---

## 0. 绝对前提（先满足再动命令）

| 项     | 要求                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| 服务器 | 阿里云 ECS `8.140.27.125`（北京，Alibaba Cloud Linux 3，2C2G），`root` 可 SSH                       |
| 私钥   | `skills/deploy-ops/.ssh/id_ed25519`（`SSH_KEY_PATH` 可改），公钥已在服务器 `~/.ssh/authorized_keys` |
| 配置   | `.env` 存在且 `DEPLOY_HOST` / `DB_PASSWORD` / `DATABASE_URL` / `LLM_API_KEY` 已填                   |
| 本机   | `node ≥ 18`、`ssh`；本机构建时才需要 `bun`                                                          |

自检：

```bash
node scripts/ops.mjs doctor
```

输出应包含 `SSH 可用`、`env 模板可渲染`，并打印「目标 / 入口」。

---

## 1. 配置契约（`.env`）

**所有敏感值只放这里**。`.gitignore` 已忽略 `.env`、`.ssh/`、`.state/`、`releases/`；
`.env.example` 与 `env/*.tpl` 是唯一被提交的部分。

| 变量                                          | 作用                                 | 示例                                                        |
| --------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` | SSH 目标                             | `8.140.27.125` / `root` / `22`                              |
| `SSH_KEY_PATH`                                | 私钥路径（相对本目录）               | `.ssh/id_ed25519`                                           |
| `APP_DIR`                                     | 服务器应用根目录                     | `/var/www/pdm-ai-web-startup`                               |
| `WEB_PORT` / `API_PORT`                       | 进程端口                             | `3001` / `3101`                                             |
| `PM2_WEB` / `PM2_API`                         | pm2 进程名                           | `pdm-web` / `pdm-api`                                       |
| `DOMAIN` / `PUBLIC_ORIGIN`                    | 域名与站点基址                       | `ai.koiism.cn` / `https://ai.koiism.cn`                     |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD`         | 服务器本机 PostgreSQL                | `pdm_ai_platform` / `pdm_app`                               |
| `DATABASE_URL`                                | 应用连接串（服务器视角 `127.0.0.1`） | `postgresql://pdm_app:***@127.0.0.1:5432/pdm_ai_platform`   |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`  | OpenAI 兼容网关                      | `https://api.deepseek.com/v1` / `sk-...` / `deepseek-flash` |
| `TUNNEL_PORT`                                 | 迁移隧道本地端口                     | `15432`                                                     |

> CI 不读这个文件：它用同名环境变量 + GitHub Secrets 注入。所以改名/加变量时要**两边都对齐**——
> 这也是为什么 `.env` 里只有值、`.env.example` 里写清楚每个键的含义。

---

## 2. 命令速查

```bash
node scripts/ops.mjs <command> [options]
```

| 命令                                                               | 用途                                             |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| `doctor`                                                           | 检查 `.env` / 私钥 / SSH / 本机工具链 / 公网可达 |
| `bootstrap [--domain X] [--db-password Y] [--no-cert] [--no-swap]` | 服务器一次性初始化（幂等）                       |
| `env show`                                                         | 渲染出将要下发的 env（密钥已打码）               |
| `env diff`                                                         | 对比本地模板与服务器现状                         |
| `env sync`                                                         | 渲染 → scp → 安装到 `shared/` → 重载两个进程     |
| `deploy [--skip-build] [--no-migrate] [--no-smoke] [--sha X]`      | 打包 → 上传 → 迁移 → 切换 → 冒烟                 |
| `release --sha <sha>`                                              | 切到已上传的某个 release                         |
| `rollback [--sha <sha>]`                                           | 回滚到上一个（或指定）release                    |
| `status`                                                           | pm2 / RELEASE / 磁盘内存 / 本机与公网健康        |
| `logs <api\|web> [--lines N]`                                      | pm2 日志                                         |
| `restart <api\|web\|all>`                                          | 重载进程                                         |
| `smoke [--no-stream]`                                              | 冒烟（默认含一次真实 SSE 流式）                  |
| `db tunnel [--port N]` / `db psql` / `db url`                      | 数据库隧道 / 远端 psql / 打印连接串              |
| `ssh`                                                              | 直连服务器                                       |

---

## 3. Runbook

### 3.1 日常发布（正常路径）

```bash
git push origin main          # CI 自动：ci.yml 门禁 + deploy.yml 发布
node scripts/ops.mjs status   # 发布后确认
```

失败时 Actions 日志里能直接看到远端输出的 `✗` 行；本地可复现同一路径：

```bash
node scripts/ops.mjs deploy --skip-build   # 用本地已构建的产物重跑发布
node scripts/ops.mjs deploy                # 本地从头构建再发布（需要 bun，慢）
```

### 3.2 只改了配置 / 密钥（不重新发布）

```bash
vim .env                                   # 改 LLM_API_KEY、DATABASE_URL…
node scripts/ops.mjs env diff               # 先看差异（密钥自动打码）
node scripts/ops.mjs env sync               # 下发并重载 pdm-api / pdm-web
node scripts/ops.mjs smoke --no-stream
```

`env sync` 只动 `shared/*.env` 与软链，不重建 release。**注意**：`NEXT_PUBLIC_*` 是构建期内联的，
改 `PUBLIC_ORIGIN`/域名必须重新构建（走一次 `deploy`），否则浏览器仍用旧地址。

### 3.3 回滚

```bash
node scripts/ops.mjs rollback                  # 上一个 release
node scripts/ops.mjs rollback --sha <sha>      # 指定
# 或 GitHub：Actions → Deploy (Aliyun ECS) → Run workflow → mode=rollback
```

回滚只换代码，不回滚数据库 schema（迁移必须向前兼容；破坏性变更拆两次发布）。

### 3.4 服务异常排查顺序

```bash
node scripts/ops.mjs status                 # 进程是否 online / release 是哪个 / 健康
node scripts/ops.mjs logs api --lines 200   # 先看 API（数据库/LLM 的错都在这里）
node scripts/ops.mjs logs web --lines 200
node scripts/ops.mjs ssh                    # 需要更深时直连
```

常见症状对照：

| 现象                                        | 先看什么                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 首页 502                                    | `pm2 ls` 里 `pdm-web` 是否 online；`logs web` 有没有 `.next` 缺失                       |
| 健康检查 `database:"down"`                  | `shared/server.env` 的 `DATABASE_URL`；`systemctl status postgresql`                    |
| 健康检查 `llm:"missing-key"`                | `.env` 里 `LLM_API_KEY` 是否为空 → `env sync`                                           |
| 流式“一次吐出全部”                          | nginx 是否少了 `proxy_buffering off`（`bootstrap` 生成的配置里有）                      |
| 浏览器报 `Failed to fetch` 于 `/elysia/...` | nginx `location /elysia/` 是否指向 `127.0.0.1:3101`；`PUBLIC_ORIGIN` 是否与访问域名一致 |
| 证书告警                                    | `certbot renew --dry-run`；见 3.6                                                       |

### 3.5 首次上线 / 换一台新机器

```bash
node scripts/ops.mjs doctor
node scripts/ops.mjs bootstrap --domain ai.koiism.cn    # 目录/bun/swap/PG/pm2 自启/nginx/证书
node scripts/ops.mjs env sync
node scripts/ops.mjs deploy                             # 首次发布（本地构建）
```

`bootstrap` 是幂等的，重复跑只会补齐缺的东西。它**不碰**机器上其他站点（例如 `:3000` 的旧应用）。

DNS 与证书由它一并处理：

- 阿里云 DNS 加 `A ai.koiism.cn → 8.140.27.125`（本仓库不做 DNS 自动化）
- `certbot certonly --webroot` 签发 Let's Encrypt，续期走 `certbot-renew.timer` 或 `/etc/cron.d/certbot-renew`
- deploy hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` 续期后自动 reload nginx

### 3.6 证书

```bash
node scripts/ops.mjs ssh
certbot certificates                 # 看有效期
certbot renew --dry-run              # 演练续期
systemctl list-timers certbot-renew.timer
```

### 3.7 数据库

```bash
node scripts/ops.mjs db tunnel       # 本地开隧道：psql -h 127.0.0.1 -p 15432 -U pdm_app pdm_ai_platform
node scripts/ops.mjs db psql         # 直接在服务器上进 psql
node scripts/ops.mjs db url          # 打印（打码后的）连接串
```

5432 **不对公网开放**，所有外部访问都走 SSH 隧道。

---

## 4. 服务器布局（`APP_DIR`）

```
/var/www/pdm-ai-web-startup/
├── current/               # 当前代码（node_modules 跨次发布保留）
│   ├── apps/web/.env.local -> ../../shared/web.env.local
│   ├── apps/server/.env    -> ../../shared/server.env
│   └── RELEASE
├── releases/<sha>.tgz     # 发布包（保留最近 5 个，回滚用）
├── shared/
│   ├── server.env         # 由 env sync 写入（600）
│   ├── web.env.local
│   ├── RELEASE            # sha + 时间
│   └── logs/              # pm2 的 out/error 日志
└── deploy/ecosystem.config.cjs（随 release 一起更新）
```

为什么这样分：发布包**不含** `.env`，也不含 `node_modules`，所以「重建 release」不会丢配置，「回滚」不用重装整棵树。

---

## 5. 安全约定

- `.env`、`.ssh/`、`releases/`、`.state/` 已 gitignore；`git status` 里出现它们就是配置错了。
- 私钥只放两处：本机 `.ssh/id_ed25519` 与 GitHub Secret `DEPLOY_SSH_KEY`（或 `_B64`）。不要贴进聊天、Issue、日志。
- CI 日志里不要 `cat` 任何 `.env`；`ops.mjs` 输出默认打码（`sk-***`、`://user:***@`）。
- 服务器 5432 与 3101 都不监听公网；安全组只放 22/80/443。
- 换密钥后记得 `env sync`，并确认 `smoke` 的 `llm: configured` 为绿。
