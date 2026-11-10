#!/bin/sh
set -eu
file="${1:-}"
if [ -z "$file" ] || [ -z "${DATABASE_URL:-}" ]; then
  echo "用法: DATABASE_URL=... scripts/db-restore.sh 备份文件.dump" >&2
  echo "这会按备份覆盖目标库。先确认 DATABASE_URL 指向要恢复的库。" >&2
  exit 1
fi
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner "$file"
echo "已按备份恢复"
