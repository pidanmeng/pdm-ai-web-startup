#!/usr/bin/env bash
# 冒烟：本机两个端口 + 公网 HTTPS（含一次真实 SSE 流式，可 --no-stream 跳过）
#   bash smoke.sh [--no-stream]
WITH_STREAM=1
[ "${1:-}" = "--no-stream" ] && WITH_STREAM=0

fail=0
check() { # check <名称> <命令...>
  local name="$1"; shift
  if "$@" > /tmp/smoke.out 2>&1; then
    ok "$name"
  else
    warn "$name 失败"
    tail -n 20 /tmp/smoke.out
    fail=1
  fi
}

log "本机"
check "api /api/health 200"  bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${API_PORT}/api/health)\" = 200"
check "api 数据库 up"        bash -c "curl -fsS http://127.0.0.1:${API_PORT}/api/health | grep -q '\"database\":\"up\"'"
check "api LLM 已配置"       bash -c "curl -fsS http://127.0.0.1:${API_PORT}/api/health | grep -q '\"llm\":\"configured\"'"
check "web / 200"            bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/)\" = 200"
check "web /demo 200"        bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/demo)\" = 200"

log "公网 https://${DOMAIN}"
check "首页 200"             bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://${DOMAIN}/)\" = 200"
check "首页带站点标题"        bash -c "curl -fsS --max-time 20 https://${DOMAIN}/ | grep -q 'AI'"
check "elysia 前缀可访问"     bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://${DOMAIN}/elysia/api/health)\" = 200"
check "http 跳 https"        bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 http://${DOMAIN}/)\" = 301"

if [ "$WITH_STREAM" = "1" ]; then
  log "SSE 流式（会消耗一次真实模型调用）"
  if curl -sS -N --max-time 90 -X POST "http://127.0.0.1:${WEB_PORT}/api/demo" \
      -H 'Content-Type: application/json' \
      -d '{"goal":"两周内整理一份遴选笔试的备考计划"}' > /tmp/smoke-sse.txt 2>&1; then
    grep -q '^event: meta' /tmp/smoke-sse.txt && ok "收到 meta 事件" || { warn "没有 meta 事件"; fail=1; }
    grep -q '^event: todos' /tmp/smoke-sse.txt && ok "收到 todos 事件" || warn "没有 todos 事件（模型可能只回了文本）"
    grep -q '^event: done' /tmp/smoke-sse.txt && ok "收到 done 事件" || { warn "没有 done 事件"; tail -n 15 /tmp/smoke-sse.txt; fail=1; }
  else
    warn "SSE 请求失败"; tail -n 15 /tmp/smoke-sse.txt; fail=1
  fi
fi

[ "$fail" = "0" ] && ok "全部通过" || die "存在失败项"
