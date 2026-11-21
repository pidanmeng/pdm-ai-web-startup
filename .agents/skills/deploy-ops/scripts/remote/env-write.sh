#!/usr/bin/env bash
# 把 /tmp 上的临时 env 文件安装到 shared/ 并重载两个进程。
# 由 ops.mjs env sync 的 scp 步骤把 *.tmp 放到 shared/ 下再调用本脚本。
ensure_dirs

for pair in "server.env" "web.env.local"; do
  tmp="$SHARED_DIR/${pair}.tmp"
  [ -f "$tmp" ] || die "缺少 $tmp"
  install -m 600 "$tmp" "$SHARED_DIR/$pair"
  rm -f "$tmp"
  ok "shared/$pair ($(stat -c%s "$SHARED_DIR/$pair") B)"
done

# 让当前 release 立刻用上新值（尚未首次部署时跳过）
ln -sfn "$SHARED_DIR/server.env" "$CURRENT_DIR/apps/server/.env" 2>/dev/null || true
ln -sfn "$SHARED_DIR/web.env.local" "$CURRENT_DIR/apps/web/.env.local" 2>/dev/null || true

if pm2 describe "$PM2_API" > /dev/null 2>&1; then
  pm2 restart "$PM2_API" --update-env > /dev/null
  ok "已重载 $PM2_API"
else
  info "$PM2_API 尚未启动，首次部署时生效"
fi

if pm2 describe "$PM2_WEB" > /dev/null 2>&1; then
  pm2 restart "$PM2_WEB" --update-env > /dev/null
  ok "已重载 $PM2_WEB"
else
  info "$PM2_WEB 尚未启动，首次部署时生效"
fi
