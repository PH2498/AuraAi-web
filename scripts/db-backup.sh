#!/bin/sh
set -eu
if [ -z "${DATABASE_URL:-}" ]; then
  echo "缺少 DATABASE_URL。先在当前环境里设置，不要把连接串写进命令。" >&2
  exit 1
fi
out="${1:-./backups/aura-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$out")"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$out"
echo "已写入 $out"
