#!/usr/bin/env bash
# 切换到一个已经上传好的 release 包并重载进程。
#   bash release.sh <sha>
SHA="${1:-}"
[ -n "$SHA" ] || die "用法：release.sh <sha>"
switch_release "$SHA"
