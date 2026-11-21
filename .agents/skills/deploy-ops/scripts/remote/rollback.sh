#!/usr/bin/env bash
# 回滚：切回上一个（或指定）release 包。
#   bash rollback.sh          # 上一个
#   bash rollback.sh <sha>    # 指定
ensure_dirs

CURRENT_SHA="$(head -n1 "$SHARED_DIR/RELEASE" 2>/dev/null || true)"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  TARGET="$(ls -1t "$RELEASES_DIR"/*.tgz 2>/dev/null \
    | sed 's#.*/##; s#\.tgz$##' \
    | grep -v -x "${CURRENT_SHA:-__none__}" \
    | head -n1 || true)"
fi

[ -n "$TARGET" ] || die "没有可回滚的 release 包（$RELEASES_DIR 为空）"
[ -f "$RELEASES_DIR/${TARGET}.tgz" ] || die "包不存在：$RELEASES_DIR/${TARGET}.tgz"

log "回滚：${CURRENT_SHA:-<unknown>} -> ${TARGET}"
switch_release "$TARGET"
ok "已回滚到 $TARGET"
