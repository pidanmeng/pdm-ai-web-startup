#!/usr/bin/env bash
# 远端脚本公共部分。所有 remote/*.sh 都以「_common.sh + 目标脚本」拼接后
# `ssh ... bash -s -- <args>` 执行，所以这里定义的函数在目标脚本里可直接调用。
# 变量一律由调用方以环境变量注入（CI / deploy-ops skill），脚本内不出现密钥。
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pdm-ai-web-startup}"
WEB_PORT="${WEB_PORT:-3001}"
API_PORT="${API_PORT:-3101}"
PM2_WEB="${PM2_WEB:-pdm-web}"
PM2_API="${PM2_API:-pdm-api}"
BUN_BIN="${BUN_BIN:-/usr/local/bin/bun}"
DOMAIN="${DOMAIN:-ai.koiism.cn}"

SHARED_DIR="$APP_DIR/shared"
CURRENT_DIR="$APP_DIR/current"
RELEASES_DIR="$APP_DIR/releases"
LOGS_DIR="$SHARED_DIR/logs"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

ensure_dirs() {
  mkdir -p "$SHARED_DIR" "$CURRENT_DIR" "$RELEASES_DIR" "$LOGS_DIR"
}

# 等待 http 就绪；usage: wait_http <url> [期望状态码，空格分隔] [重试次数]
wait_http() {
  local url="$1" want="${2:-200}" tries="${3:-30}" code=""
  for _ in $(seq 1 "$tries"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
    case " $want " in
      *" $code "*) return 0 ;;
    esac
    sleep 2
  done
  return 1
}

require_bun() {
  if [ ! -x "$BUN_BIN" ]; then
    if command -v bun > /dev/null 2>&1; then
      BUN_BIN="$(command -v bun)"
    else
      die "bun 未安装：先跑 bootstrap.sh（curl -fsSL https://bun.sh/install | bash 并软链到 /usr/local/bin/bun）"
    fi
  fi
}

# 把一个 tarball 切成当前版本：展开 -> 挂 env -> 装依赖 -> 重载 pm2 -> 冒烟
# usage: switch_release <sha>
switch_release() {
  local sha="$1" tgz="$RELEASES_DIR/${1}.tgz" health=""

  ensure_dirs
  require_bun
  [ -f "$tgz" ] || die "找不到 $tgz（先上传：ops.mjs upload / CI 的 scp 步骤）"
  for f in "$SHARED_DIR/server.env" "$SHARED_DIR/web.env.local"; do
    [ -s "$f" ] || die "缺少 $f，先在本地执行：node .agents/skills/deploy-ops/scripts/ops.mjs env sync"
  done

  log "1/5 展开代码（保留 node_modules）"
  find "$CURRENT_DIR" -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf {} +
  tar -xzf "$tgz" -C "$CURRENT_DIR"
  ok "解包 $sha"

  log "2/5 挂载环境变量"
  ln -sfn "$SHARED_DIR/server.env" "$CURRENT_DIR/apps/server/.env"
  ln -sfn "$SHARED_DIR/web.env.local" "$CURRENT_DIR/apps/web/.env.local"
  ok "apps/{server/.env,web/.env.local} -> shared/"

  log "3/5 安装运行时依赖"
  ( cd "$CURRENT_DIR" && $BUN_BIN install --frozen-lockfile --production )
  printf '%s\n' "$sha" > "$CURRENT_DIR/RELEASE"
  printf '%s\n' "$sha" > "$SHARED_DIR/RELEASE"
  date -Is >> "$SHARED_DIR/RELEASE"
  ok "RELEASE=$sha"

  log "4/5 重载进程"
  mkdir -p "$LOGS_DIR"
  APP_DIR="$APP_DIR" WEB_PORT="$WEB_PORT" API_PORT="$API_PORT" \
    PM2_WEB="$PM2_WEB" PM2_API="$PM2_API" BUN_BIN="$BUN_BIN" \
    pm2 startOrReload "$CURRENT_DIR/deploy/ecosystem.config.cjs" --update-env
  pm2 save > /dev/null 2>&1 || true
  ok "pm2 已重载"

  log "5/5 冒烟（本机）"
  if ! wait_http "http://127.0.0.1:${API_PORT}/api/health" 200 30; then
    warn "API 未就绪，最近日志："
    tail -n 40 "$LOGS_DIR/api-error.log" 2>/dev/null || true
    tail -n 40 "$LOGS_DIR/api-out.log" 2>/dev/null || true
    exit 1
  fi
  health="$(curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT}/api/health" || true)"
  printf '    %s\n' "$health"
  case "$health" in
    *'"database":"up"'*) ok "API + PostgreSQL 正常" ;;
    *'"database":"down"'*)
      warn "API 起来了但连不上 PostgreSQL，检查 shared/server.env 的 DATABASE_URL"
      exit 1 ;;
    *) warn "健康检查返回不符合预期" ;;
  esac

  if ! wait_http "http://127.0.0.1:${WEB_PORT}/" 200 30; then
    warn "Web 未就绪，最近日志："
    tail -n 40 "$LOGS_DIR/web-error.log" 2>/dev/null || true
    tail -n 40 "$LOGS_DIR/web-out.log" 2>/dev/null || true
    exit 1
  fi
  ok "Web 200"

  ls -1t "$RELEASES_DIR"/*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
}
