#!/usr/bin/env bash
# 服务器一次性初始化（幂等）。由 deploy-ops skill 或人工执行：
#
#   DOMAIN=ai.koiism.cn DB_PASSWORD='...' bash bootstrap.sh
#
# 做四件事：目录 / bun / swap / PM2 开机自启，然后（默认）签发 Let's Encrypt 证书并写入 nginx 站点。
# 不碰机器上已有的其他站点（例如 :3000 上的旧应用）。
# 注意：远端脚本统一以「_common.sh + 本文件」拼接后 `ssh ... bash -s -- <args>` 执行，
# 所以这里不需要 source 同目录文件，函数已在上方注入。
set -euo pipefail

DB_NAME="${DB_NAME:-pdm_ai_platform}"
DB_USER="${DB_USER:-pdm_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
WITH_CERT="${WITH_CERT:-1}"
WITH_SWAP="${WITH_SWAP:-1}"
ACME_ROOT="/var/www/letsencrypt"
NGINX_CONF="/etc/nginx/conf.d/${DOMAIN}.conf"

log "1/6 目录"
ensure_dirs
info "APP_DIR=$APP_DIR"

log "2/6 swap"
if [ "$WITH_SWAP" = "1" ]; then
  if [ -n "$(swapon --show --noheadings 2>/dev/null || true)" ]; then
    info "已有 swap，跳过"
  else
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
      chmod 600 /swapfile
      mkswap /swapfile > /dev/null
    fi
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "2G swap 已启用（2G 内存机器跑 next start 更稳）"
  fi
else
  info "--no-swap，跳过"
fi

log "3/6 Bun"
if command -v bun > /dev/null 2>&1; then
  info "已安装：$(bun -v)"
elif [ -x "$BUN_BIN" ]; then
  info "已存在：$($BUN_BIN -v)"
else
  # 国内机器上官方安装脚本（走 GitHub Release）可能只有几十 KB/s，
  # 优先用 npm 镜像（bun 的 npm 包自带各平台二进制），失败再回退官方脚本。
  if command -v npm > /dev/null 2>&1 \
     && npm install -g "bun@${BUN_VERSION:-1.2.19}" --registry="${NPM_REGISTRY:-https://registry.npmmirror.com}" > /tmp/bun-npm.log 2>&1 \
     && command -v bun > /dev/null 2>&1; then
    ok "bun $(bun -v)（来自 npm 镜像）"
  else
    warn "npm 镜像安装失败（见 /tmp/bun-npm.log），回退官方脚本"
    command -v unzip > /dev/null 2>&1 || dnf install -y unzip > /dev/null 2>&1 || true
    curl -fsSL https://bun.sh/install | bash
    ln -sf /root/.bun/bin/bun "$BUN_BIN"
    ok "bun $($BUN_BIN -v) -> $BUN_BIN"
  fi
fi

log "4/6 PostgreSQL 数据库"
if ! command -v psql > /dev/null 2>&1; then
  warn "没有 psql，跳过建库（需要手工准备 DATABASE_URL）"
else
  run_sql() { su - postgres -c "psql -tAc \"$1\"" 2>/dev/null; }

  if [ -z "$(run_sql "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" ]; then
    [ -n "$DB_PASSWORD" ] || die "首次初始化需要 DB_PASSWORD"
    su - postgres -c "psql -q -c \"CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'\"" > /dev/null
    ok "角色 $DB_USER 已创建"
  else
    if [ -n "$DB_PASSWORD" ]; then
      su - postgres -c "psql -q -c \"ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASSWORD'\"" > /dev/null
      ok "角色 $DB_USER 密码已更新"
    else
      info "角色 $DB_USER 已存在"
    fi
  fi

  if [ -z "$(run_sql "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" ]; then
    su - postgres -c "createdb -O $DB_USER $DB_NAME" > /dev/null
    ok "数据库 $DB_NAME 已创建（owner=$DB_USER）"
  else
    info "数据库 $DB_NAME 已存在"
  fi

  su - postgres -c "psql -q -d $DB_NAME -c 'GRANT ALL ON SCHEMA public TO $DB_USER'" > /dev/null 2>&1 || true
fi

log "5/6 PM2 开机自启"
if systemctl list-unit-files 2>/dev/null | grep -q '^pm2-root.service'; then
  info "pm2-root.service 已注册"
else
  if command -v pm2 > /dev/null 2>&1; then
    pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
    systemctl enable pm2-root > /dev/null 2>&1 || true
    ok "已注册 pm2-root.service"
  else
    warn "没有 pm2，跳过（release.sh 会用 pm2 起进程）"
  fi
fi

if [ "$WITH_CERT" != "1" ]; then
  log "6/6 nginx / HTTPS（--no-cert，跳过）"
  exit 0
fi

log "6/6 nginx + Let's Encrypt"
command -v nginx > /dev/null 2>&1 || die "没有 nginx"
mkdir -p "$ACME_ROOT"

# 6.1 先只写 80：ACME 挑战目录 + 反代，保证证书申请能通过
cat > "$NGINX_CONF" <<EOF
# 由 deploy-ops skill bootstrap 生成；证书续期后无需修改
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
    }

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
EOF
nginx -t > /dev/null 2>&1 || die "nginx 配置校验失败：$NGINX_CONF"
systemctl reload nginx 2>/dev/null || nginx -s reload
ok "80 端口站点已生效"

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  if ! command -v certbot > /dev/null 2>&1; then
    info "安装 certbot ..."
    dnf install -y certbot > /dev/null 2>&1 || die "certbot 安装失败（dnf 源不可用？）"
  fi
  info "申请证书：${DOMAIN}（webroot）"
  if ! certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" \
        --agree-tos --register-unsafely-without-email --non-interactive --keep-until-expiring; then
    warn "证书申请失败。确认 ${DOMAIN} 的 A 记录已生效且 80 端口对外可达，然后重跑："
    warn "  certbot certonly --webroot -w $ACME_ROOT -d $DOMAIN --agree-tos --register-unsafely-without-email"
    exit 1
  fi
  ok "证书已签发"
else
  info "证书已存在：/etc/letsencrypt/live/${DOMAIN}"
fi

# 6.2 写入 HTTPS 站点（含 SSE 必要的 proxy_buffering off）
cat > "$NGINX_CONF" <<EOF
# 由 deploy-ops skill bootstrap 生成
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 20m;

    # Elysia API（Eden treaty 的 base 指向 /elysia）
    location /elysia/ {
        proxy_pass http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Next.js（含 /api/demo 的 SSE 透传）
    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE：必须关闭缓冲，否则逐字流式会攒成一次性输出
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
nginx -t > /dev/null 2>&1 || die "nginx 配置校验失败：$NGINX_CONF"
systemctl reload nginx 2>/dev/null || nginx -s reload
ok "HTTPS 站点已生效：https://${DOMAIN}"

# 6.3 自动续签：deploy hook + 定时器（或 cron）
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx 2>/dev/null || nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

if systemctl list-unit-files 2>/dev/null | grep -q '^certbot-renew.timer'; then
  systemctl enable --now certbot-renew.timer > /dev/null 2>&1 || true
  ok "自动续签：certbot-renew.timer 已启用"
else
  cat > /etc/cron.d/certbot-renew <<'EOF'
0 3,15 * * * root certbot renew --quiet --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
EOF
  chmod 644 /etc/cron.d/certbot-renew
  ok "自动续签：已写入 /etc/cron.d/certbot-renew"
fi

log "bootstrap 完成"
info "下一步：在本地执行 ops.mjs env sync 写应用环境变量，然后触发一次部署"
