#!/usr/bin/env node
/**
 * deploy-ops · 部署 / 运维 / 环境变量同步 CLI
 *
 * 一套实现，两个入口：
 *   · 本机运维（Windows / macOS / Linux）：node skills/deploy-ops/scripts/ops.mjs <cmd>
 *   · GitHub Actions：同一个文件，配置全部由环境变量注入
 *
 * 配置优先级：环境变量 > skills/deploy-ops/.env > 内置默认值
 * 敏感值（SSH 私钥、DB 密码、LLM Key）只存在于 .env（已 gitignore）与服务器的 shared/*.env。
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { connect } from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = resolve(SCRIPT_DIR, '..')
const REPO_ROOT = resolve(SKILL_DIR, '../..')
const REMOTE_DIR = join(SCRIPT_DIR, 'remote')

// ─── 配置 ────────────────────────────────────────────────────────────────────

function parseDotEnv(text) {
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadEnvFile() {
  const file = join(SKILL_DIR, '.env')
  if (!existsSync(file)) return {}
  return parseDotEnv(readFileSync(file, 'utf8'))
}

const fileEnv = loadEnvFile()
const env = (key, fallback = '') => {
  const fromProcess = process.env[key]
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess
  return fileEnv[key] ?? fallback
}

const repoPath = (value) => (isAbsolute(value) ? value : resolve(SKILL_DIR, value))

const CFG = {
  host: env('DEPLOY_HOST'),
  user: env('DEPLOY_USER', 'root'),
  port: env('DEPLOY_PORT', '22'),
  keyPath: repoPath(env('SSH_KEY_PATH', '.ssh/id_ed25519')),

  appDir: env('APP_DIR', '/var/www/pdm-ai-web-startup'),
  webPort: env('WEB_PORT', '3001'),
  apiPort: env('API_PORT', '3101'),
  pm2Web: env('PM2_WEB', 'pdm-web'),
  pm2Api: env('PM2_API', 'pdm-api'),
  bunBin: env('BUN_BIN', '/usr/local/bin/bun'),

  domain: env('DOMAIN', 'ai.koiism.cn'),
  publicOrigin: env('PUBLIC_ORIGIN', 'https://ai.koiism.cn'),

  dbName: env('DB_NAME', 'pdm_ai_platform'),
  dbUser: env('DB_USER', 'pdm_app'),
  dbPassword: env('DB_PASSWORD'),
  databaseUrl: env('DATABASE_URL'),

  llmBaseUrl: env('LLM_BASE_URL', 'https://api.deepseek.com/v1'),
  llmApiKey: env('LLM_API_KEY'),
  llmModel: env('LLM_MODEL', 'deepseek-flash'),

  tunnelPort: env('TUNNEL_PORT', '15432'),
}

// remote/*.sh 需要的上下文（通过导出注入到远端脚本）
function remoteEnv() {
  return {
    APP_DIR: CFG.appDir,
    WEB_PORT: CFG.webPort,
    API_PORT: CFG.apiPort,
    PM2_WEB: CFG.pm2Web,
    PM2_API: CFG.pm2Api,
    BUN_BIN: CFG.bunBin,
    DOMAIN: CFG.domain,
  }
}

// ─── 小工具 ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
}
const log = (msg) => console.log(`\n${C.cyan}${C.bold}==> ${msg}${C.reset}`)
const info = (msg) => console.log(`    ${msg}`)
const ok = (msg) => console.log(`${C.green}  ✓ ${msg}${C.reset}`)
const warn = (msg) => console.log(`${C.yellow}  ! ${msg}${C.reset}`)
const fail = (msg) => {
  console.error(`\n${C.red}  ✗ ${msg}${C.reset}`)
  process.exit(1)
}

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i += 1
      } else {
        flags[key] = true
      }
    } else {
      positional.push(token)
    }
  }
  return { positional, flags }
}

// Windows 上不用 shell 执行：ssh/scp 的参数里常有管道、重定向、引号，
// 交给 cmd 解释会被改坏。Node 直接 CreateProcess 时会按 PATHEXT 补 .exe。
function nativeBin(cmd) {
  if (process.platform !== 'win32') return cmd
  return /\.(exe|cmd|bat)$/i.test(cmd) ? cmd : `${cmd}.exe`
}

function run(cmd, args, options = {}) {
  const result = spawnSync(nativeBin(cmd), args, {
    stdio: 'inherit',
    ...options,
  })
  if (result.error) fail(`执行失败：${cmd} ${args.join(' ')} — ${result.error.message}`)
  return result.status ?? 0
}

function capture(cmd, args, options = {}) {
  const result = spawnSync(nativeBin(cmd), args, {
    encoding: 'utf8',
    ...options,
  })
  if (result.error) fail(`执行失败：${cmd} — ${result.error.message}`)
  return { status: result.status ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

// ─── ssh ─────────────────────────────────────────────────────────────────────

function assertSshReady(label = 'SSH') {
  if (!CFG.host)
    fail(`缺少 DEPLOY_HOST。请在 ${join(SKILL_DIR, '.env')} 里配置（参考 .env.example）`)
  if (!existsSync(CFG.keyPath)) fail(`找不到私钥 ${CFG.keyPath}（SSH_KEY_PATH）`)
  info(`${label} -> ${CFG.user}@${CFG.host}:${CFG.port}`)
}

function sshBaseArgs() {
  return [
    '-i',
    CFG.keyPath,
    '-p',
    CFG.port,
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'BatchMode=yes',
    '-o',
    'ServerAliveInterval=20',
    `${CFG.user}@${CFG.host}`,
  ]
}

/** 把若干 remote 脚本拼接后通过 stdin 交给远端 bash 执行 */
function remoteScript(scripts, args = [], extraEnv = {}) {
  assertSshReady('ssh')
  const body = scripts.map((name) => readFileSync(join(REMOTE_DIR, name), 'utf8')).join('\n')
  const exports = Object.entries({ ...remoteEnv(), ...extraEnv })
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n')
  const text = `#!/usr/bin/env bash\n${exports}\n${body}\n`
  const argStr = args.map((a) => shellQuote(a)).join(' ')

  return new Promise((resolvePromise, reject) => {
    const child = spawn('ssh', [...sshBaseArgs(), `bash -s -- ${argStr}`], {
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`远端脚本退出码 ${code}`))
    })
    child.stdin.write(text)
    child.stdin.end()
  })
}

function sshExec(command, { captureOutput = false } = {}) {
  assertSshReady('ssh')
  if (captureOutput) {
    const result = capture('ssh', [...sshBaseArgs(), command])
    if (result.status !== 0) fail(`远端命令失败：${command}\n${result.stderr}`)
    return result.stdout.trim()
  }
  const code = run('ssh', [...sshBaseArgs(), command])
  if (code !== 0) fail(`远端命令失败：${command}`)
  return ''
}

function scpUpload(localPath, remotePath) {
  assertSshReady('scp')
  const code = run('scp', [
    '-i',
    CFG.keyPath,
    '-P',
    CFG.port,
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'BatchMode=yes',
    localPath,
    `${CFG.user}@${CFG.host}:${remotePath}`,
  ])
  if (code !== 0) fail(`上传失败：${remotePath}`)
}

// ─── 构建与打包 ──────────────────────────────────────────────────────────────

const EXCLUDES = [
  './.git',
  './.dsh',
  './.tmp',
  './out',
  './node_modules',
  '*node_modules*',
  './apps/web/.next/cache',
  './apps/server/.env',
  './apps/web/.env.local',
  './apps/web/.env.production',
  './skills/deploy-ops/.env',
  './skills/deploy-ops/.ssh',
  './skills/deploy-ops/.state',
  './skills/deploy-ops/releases',
]

function gitSha() {
  const fromEnv = process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 12)
  const { status, stdout } = capture('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: REPO_ROOT })
  if (status !== 0) return `local-${Date.now().toString(36)}`
  return stdout.trim()
}

function buildApp() {
  log('构建 API（bun bundle）')
  run('bun', ['run', 'build:server'], { cwd: REPO_ROOT })
  log('构建 Web（next build）')
  run('bun', ['run', 'build:web'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_API_URL: `${CFG.publicOrigin}/elysia`,
    },
  })
}

function verifyBuild() {
  const buildId = join(REPO_ROOT, 'apps/web/.next/BUILD_ID')
  const serverEntry = join(REPO_ROOT, 'apps/server/dist/index.js')
  if (!existsSync(buildId)) fail('apps/web/.next/BUILD_ID 不存在，Next 构建产物不完整')
  if (!existsSync(serverEntry)) fail('apps/server/dist/index.js 不存在，Bun 打包产物不完整')
  ok(`web BUILD_ID = ${readFileSync(buildId, 'utf8').trim()}`)
  ok(`api dist = ${(statSync(serverEntry).size / 1024).toFixed(0)} KB`)
}

function packageRelease(sha) {
  const outDir = join(SKILL_DIR, 'releases')
  mkdirSync(outDir, { recursive: true })
  const archive = join(outDir, `${sha}.tgz`)
  rmSync(archive, { force: true })
  log(`打包 release ${sha}`)
  const args = ['-czf', archive]
  for (const pattern of EXCLUDES) args.push(`--exclude=${pattern}`)
  args.push('-C', REPO_ROOT, '.')
  run('tar', args)
  const size = (statSync(archive).size / 1024 / 1024).toFixed(1)
  ok(`${archive} (${size} MB)`)
  return archive
}

function uploadRelease(archive, sha) {
  log('上传 release 包')
  sshExec(`mkdir -p ${shellQuote(CFG.appDir + '/releases')}`)
  scpUpload(archive, `${CFG.appDir}/releases/${sha}.tgz`)
  ok(`-> ${CFG.appDir}/releases/${sha}.tgz`)
}

// ─── 数据库迁移（SSH 隧道，避免把 5432 暴露到公网） ──────────────────────────

function waitForPort(port, timeoutMs = 15000) {
  const started = Date.now()
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      const socket = connect({ host: '127.0.0.1', port }, () => {
        socket.end()
        resolvePromise()
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error(`等待 127.0.0.1:${port} 超时`))
        else setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

function remoteDatabaseUrl() {
  const raw = sshExec(
    `grep -m1 '^DATABASE_URL=' ${shellQuote(CFG.appDir + '/shared/server.env')} | cut -d= -f2-`,
    { captureOutput: true },
  )
  if (!raw) fail('服务器上没有 shared/server.env 的 DATABASE_URL，先执行：ops.mjs env sync')
  return raw
}

async function migrate() {
  log('数据库迁移（SSH 隧道）')
  const url = remoteDatabaseUrl()
  const local = url.replace(/@[^/@]+/, `@127.0.0.1:${CFG.tunnelPort}`)
  if (local === url)
    fail(`无法把 DATABASE_URL 改写到本地隧道：${url.replace(/:\/\/[^@]*@/, '://***@')}`)

  const tunnel = spawn('ssh', [...sshBaseArgs(), '-N', '-L', `${CFG.tunnelPort}:127.0.0.1:5432`], {
    stdio: 'ignore',
  })
  try {
    await waitForPort(Number(CFG.tunnelPort))
    info(`隧道就绪 127.0.0.1:${CFG.tunnelPort} -> ${CFG.host}:5432`)
    const code = run('bun', ['run', 'db:migrate'], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: local },
    })
    if (code !== 0) fail('迁移失败')
    ok('迁移完成')
  } finally {
    tunnel.kill()
  }
}

// ─── 环境变量渲染 ────────────────────────────────────────────────────────────

function renderTemplate(file, vars) {
  const text = readFileSync(file, 'utf8')
  const missing = []
  const rendered = text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key]
    if (value === undefined || value === '') {
      missing.push(key)
      return ''
    }
    return value
  })
  if (missing.length)
    fail(`模板 ${file} 缺少变量：${[...new Set(missing)].join(', ')}（检查 .env）`)
  return rendered
}

function renderEnvFiles() {
  const vars = {
    DOMAIN: CFG.domain,
    PUBLIC_ORIGIN: CFG.publicOrigin,
    PUBLIC_API_URL: `${CFG.publicOrigin}/elysia`,
    WEB_PORT: CFG.webPort,
    API_PORT: CFG.apiPort,
    DATABASE_URL: CFG.databaseUrl,
    DB_NAME: CFG.dbName,
    DB_USER: CFG.dbUser,
    DB_PASSWORD: CFG.dbPassword,
    LLM_BASE_URL: CFG.llmBaseUrl,
    LLM_API_KEY: CFG.llmApiKey,
    LLM_MODEL: CFG.llmModel,
  }
  return {
    'server.env': renderTemplate(join(SKILL_DIR, 'env/server.env.tpl'), vars),
    'web.env.local': renderTemplate(join(SKILL_DIR, 'env/web.env.local.tpl'), vars),
  }
}

// ─── 命令实现 ────────────────────────────────────────────────────────────────

async function cmdDoctor() {
  log('自检')
  info(`node        ${process.version}`)
  const bun = capture('bun', ['-v'])
  info(`bun         ${bun.status === 0 ? bun.stdout.trim() : '缺失（本地构建需要）'}`)
  info(`skill dir   ${SKILL_DIR}`)
  info(
    `.env        ${existsSync(join(SKILL_DIR, '.env')) ? '已加载' : '缺失（复制 .env.example）'}`,
  )
  info(`私钥        ${existsSync(CFG.keyPath) ? CFG.keyPath : '缺失'}`)
  info(`目标        ${CFG.user}@${CFG.host}:${CFG.port}  ${CFG.appDir}`)
  info(`入口        ${CFG.publicOrigin}  (web :${CFG.webPort} / api :${CFG.apiPort})`)
  const rendered = renderEnvFiles()
  ok(
    `env 模板可渲染（server.env ${rendered['server.env'].length}B / web.env.local ${rendered['web.env.local'].length}B）`,
  )

  if (!CFG.host || !existsSync(CFG.keyPath)) {
    warn('跳过连通性测试（缺主机或私钥）')
    return
  }
  assertSshReady('ssh')
  const who = capture('ssh', [
    ...sshBaseArgs(),
    'echo ok; hostname; pm2 ls --silent 2>/dev/null | head -5',
  ])
  if (who.status === 0) ok(`SSH 可用：${who.stdout.trim().split('\n')[1] ?? 'ok'}`)
  else fail(`SSH 不通：${who.stderr.trim()}`)

  const health = capture('curl', [
    '-s',
    '-m',
    '10',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    `${CFG.publicOrigin}/`,
  ])
  info(`公网首页    HTTP ${health.stdout.trim() || 'n/a'}`)
}

async function cmdBootstrap({ flags }) {
  log('服务器初始化（幂等）')
  const domain = flags.domain ?? CFG.domain
  const dbPassword = flags['db-password'] ?? CFG.dbPassword
  if (!dbPassword) fail('缺少 DB_PASSWORD（.env 里配置，或 --db-password 传入）')
  await remoteScript(['_common.sh', 'bootstrap.sh'], [], {
    DB_NAME: CFG.dbName,
    DB_USER: CFG.dbUser,
    DB_PASSWORD: dbPassword,
    DOMAIN: domain,
    WITH_CERT: flags['no-cert'] ? '0' : '1',
    WITH_SWAP: flags['no-swap'] ? '0' : '1',
  })
  ok('bootstrap 完成')
}

async function cmdEnv(action) {
  if (action === 'show') {
    const rendered = renderEnvFiles()
    console.log(`\n${C.dim}--- server.env ---${C.reset}\n${maskSecrets(rendered['server.env'])}`)
    console.log(
      `\n${C.dim}--- web.env.local ---${C.reset}\n${maskSecrets(rendered['web.env.local'])}`,
    )
    return
  }

  if (action === 'diff') {
    const rendered = renderEnvFiles()
    const remote = sshExec(`cat ${shellQuote(CFG.appDir + '/shared/server.env')}`, {
      captureOutput: true,
    })
    const localLines = rendered['server.env'].split('\n')
    const remoteLines = remote.split('\n')
    const onlyLocal = localLines.filter((l) => l && !remoteLines.includes(l))
    const onlyRemote = remoteLines.filter((l) => l && !localLines.includes(l))
    if (!onlyLocal.length && !onlyRemote.length) return ok('服务器 env 与本地模板一致')
    if (onlyLocal.length)
      console.log(
        `\n${C.green}+ 本地有、远端没有${C.reset}\n${onlyLocal.map(maskSecrets).join('\n')}`,
      )
    if (onlyRemote.length)
      console.log(
        `\n${C.red}- 远端有、本地没有${C.reset}\n${onlyRemote.map(maskSecrets).join('\n')}`,
      )
    return
  }

  if (action === 'sync') {
    const rendered = renderEnvFiles()
    const staging = join(tmpdir(), `pdm-env-${Date.now()}`)
    mkdirSync(staging, { recursive: true })
    for (const [name, content] of Object.entries(rendered)) {
      writeFileSync(join(staging, name), content, { mode: 0o600 })
    }
    log('上传环境变量文件')
    sshExec(`mkdir -p ${shellQuote(CFG.appDir + '/shared')}`)
    scpUpload(join(staging, 'server.env'), `${CFG.appDir}/shared/server.env.tmp`)
    scpUpload(join(staging, 'web.env.local'), `${CFG.appDir}/shared/web.env.local.tmp`)
    await remoteScript(['_common.sh', 'env-write.sh'], [], {})
    rmSync(staging, { recursive: true, force: true })
    ok('shared/server.env 与 shared/web.env.local 已更新')
    return
  }

  fail('用法：ops.mjs env <show|diff|sync>')
}

async function cmdDeploy({ flags }) {
  const sha = flags.sha ?? gitSha()
  log(`部署 ${sha}`)
  if (!flags['skip-build']) buildApp()
  verifyBuild()
  const archive = packageRelease(sha)
  uploadRelease(archive, sha)
  if (!flags['no-migrate']) await migrate()
  await remoteScript(['_common.sh', 'release.sh'], [sha])
  if (!flags['no-smoke']) await cmdSmoke({ flags: { 'no-stream': true } })
  ok(`部署完成：${CFG.publicOrigin}  (${sha})`)
}

async function cmdRelease({ flags }) {
  const sha = flags.sha
  if (!sha) fail('用法：ops.mjs release --sha <sha>')
  await remoteScript(['_common.sh', 'release.sh'], [sha])
  ok(`已切换到 ${sha}`)
}

async function cmdRollback({ flags }) {
  await remoteScript(['_common.sh', 'rollback.sh'], flags.sha ? [flags.sha] : [])
  ok('回滚完成')
}

async function cmdStatus() {
  log('进程状态')
  sshExec(`pm2 ls`)
  log('release')
  sshExec(`cat ${shellQuote(CFG.appDir + '/shared/RELEASE')} 2>/dev/null || echo '(未部署)'`)
  log('磁盘 / 内存')
  sshExec(`df -h / | tail -1; free -m | head -3`)
  log('本机健康')
  sshExec(
    `curl -fsS --max-time 5 http://127.0.0.1:${CFG.apiPort}/api/health || echo 'api down'; echo; ` +
      `curl -s -o /dev/null -w 'web %{http_code}\\n' --max-time 5 http://127.0.0.1:${CFG.webPort}/ || true`,
  )
  log('公网健康')
  sshExec(
    `curl -s -o /dev/null -w 'https ${CFG.domain} -> %{http_code}\\n' --max-time 10 ${CFG.publicOrigin}/`,
  )
}

async function cmdLogs({ positional, flags }) {
  const target = positional[0] ?? 'api'
  const lines = flags.lines ?? '120'
  const name = target === 'web' ? CFG.pm2Web : CFG.pm2Api
  sshExec(`pm2 logs ${name} --lines ${lines} --nostream`)
}

async function cmdRestart({ positional }) {
  const target = positional[0] ?? 'all'
  if (target === 'all') sshExec(`pm2 restart ${CFG.pm2Api} ${CFG.pm2Web} --update-env`)
  else sshExec(`pm2 restart ${target === 'web' ? CFG.pm2Web : CFG.pm2Api} --update-env`)
  ok(`已重载 ${target}`)
}

async function cmdSmoke({ flags }) {
  await remoteScript(['_common.sh', 'smoke.sh'], flags['no-stream'] ? ['--no-stream'] : [])
  ok('冒烟通过')
}

async function cmdDb({ positional, flags }) {
  const action = positional[0] ?? 'tunnel'
  if (action === 'url') {
    console.log(maskSecrets(remoteDatabaseUrl()))
    return
  }
  if (action === 'psql') {
    const url = remoteDatabaseUrl()
    info(`在服务器上执行 psql（${url.replace(/:\/\/[^@]*@/, '://***@')}）`)
    sshExec(
      `set -a; . ${shellQuote(CFG.appDir + '/shared/server.env')}; set +a; psql "$DATABASE_URL"`,
    )
    return
  }
  if (action === 'tunnel') {
    const port = flags.port ?? CFG.tunnelPort
    log(`打开隧道 127.0.0.1:${port} -> ${CFG.host}:5432（Ctrl+C 结束）`)
    const url = remoteDatabaseUrl().replace(/@[^/@]+/, `@127.0.0.1:${port}`)
    info(`DATABASE_URL=${maskSecrets(url)}`)
    run('ssh', [...sshBaseArgs(), '-N', '-L', `${port}:127.0.0.1:5432`])
    return
  }
  fail('用法：ops.mjs db <tunnel|psql|url>')
}

function cmdSsh() {
  assertSshReady('ssh')
  run('ssh', sshBaseArgs())
}

// ─── 输出脱敏 ────────────────────────────────────────────────────────────────

function maskSecrets(text) {
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1***')
    .replace(/(:\/\/[^:@/\s]+:)([^@/\s]+)(@)/g, '$1***$3')
    .replace(/^((?:LLM_API_KEY|DB_PASSWORD)=).*$/gm, '$1***')
}

function printHelp() {
  console.log(`
${C.bold}deploy-ops${C.reset} · 部署 / 运维 / 环境变量同步

${C.bold}用法${C.reset}
  node skills/deploy-ops/scripts/ops.mjs <command> [options]

${C.bold}命令${C.reset}
  doctor                       检查 .env / 私钥 / SSH / 本机工具链
  bootstrap                    服务器一次性初始化（目录 / bun / swap / PG / PM2 / nginx + 证书）
  env <show|diff|sync>         渲染并同步 apps/*/.env 到服务器 shared/
  deploy [--skip-build]        打包 -> 上传 -> 迁移 -> 切换 -> 冒烟
  release --sha <sha>          切到已上传的某个 release
  rollback [--sha <sha>]       回滚到上一个（或指定）release
  status                       进程 / release / 磁盘 / 健康
  logs <api|web> [--lines N]   查看 pm2 日志
  restart <api|web|all>        重载进程
  smoke [--no-stream]          冒烟（含一次真实 SSE 流式）
  db <tunnel|psql|url>         数据库隧道 / 远端 psql / 打印连接串
  ssh                          直连服务器

${C.bold}配置文件${C.reset}
  ${join(SKILL_DIR, '.env')}   （已 gitignore，敏感值只放这里）
  ${join(SKILL_DIR, '.env.example')}
`)
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

const { positional, flags } = parseArgs(process.argv.slice(2))
const command = positional.shift() ?? 'help'

const handlers = {
  doctor: cmdDoctor,
  bootstrap: cmdBootstrap,
  env: () => cmdEnv(positional[0] ?? 'show'),
  deploy: cmdDeploy,
  release: cmdRelease,
  rollback: cmdRollback,
  status: cmdStatus,
  logs: cmdLogs,
  restart: cmdRestart,
  smoke: cmdSmoke,
  db: cmdDb,
  ssh: cmdSsh,
}

const handler = handlers[command]
if (!handler) {
  printHelp()
  process.exit(command === 'help' ? 0 : 1)
}

try {
  await handler({ positional, flags })
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
