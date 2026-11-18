/**
 * pm2 runtime for the AI Web startup template on the Aliyun ECS.
 *
 * 进程模型：
 *   pdm-web  Next.js（node，:3001，nginx 唯一上游）
 *   pdm-api  Elysia/Bun（:3101，只监听回环，由 Next 的 BFF 与 nginx 的 /elysia/ 前缀访问）
 *
 * 约束：
 *   · 路径全部取自环境变量，默认 $APP_DIR/current，可用 pm2 --update-env 覆盖
 *   · 不写死域名：域名只在 nginx 站点配置里出现一次
 *   · 两个进程都从各自的 .env 文件读配置，环境变量文件由 deploy-ops skill 同步
 */
const fs = require('node:fs')
const path = require('node:path')

const APP_DIR = process.env.APP_DIR || '/var/www/pdm-ai-web-startup'
const ROOT = path.join(APP_DIR, 'current')
const WEB_PORT = process.env.WEB_PORT || '3001'
const API_PORT = process.env.API_PORT || '3101'
const BUN_BIN = process.env.BUN_BIN || '/usr/local/bin/bun'

// bun 会把公共依赖提升到仓库根 node_modules；不同版本表现不一致，这里两种布局都认。
const NEXT_BIN =
  [
    path.join(ROOT, 'apps/web/node_modules/next/dist/bin/next'),
    path.join(ROOT, 'node_modules/next/dist/bin/next'),
  ].find((candidate) => fs.existsSync(candidate)) ??
  path.join(ROOT, 'node_modules/next/dist/bin/next')

const common = {
  autorestart: true,
  max_restarts: 10,
  min_uptime: '20s',
  restart_delay: 2000,
  kill_timeout: 8000,
  merge_logs: true,
  time: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
}

module.exports = {
  apps: [
    {
      ...common,
      name: process.env.PM2_API || 'pdm-api',
      cwd: path.join(ROOT, 'apps/server'),
      script: BUN_BIN,
      args: 'dist/index.js',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: API_PORT,
        HOST: '127.0.0.1',
      },
      error_file: path.join(APP_DIR, 'shared/logs/api-error.log'),
      out_file: path.join(APP_DIR, 'shared/logs/api-out.log'),
    },
    {
      ...common,
      name: process.env.PM2_WEB || 'pdm-web',
      cwd: path.join(ROOT, 'apps/web'),
      script: NEXT_BIN,
      args: `start -p ${WEB_PORT}`,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: WEB_PORT,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      error_file: path.join(APP_DIR, 'shared/logs/web-error.log'),
      out_file: path.join(APP_DIR, 'shared/logs/web-out.log'),
    },
  ],
}
