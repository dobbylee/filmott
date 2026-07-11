#!/usr/bin/env bash

set -Eeuo pipefail

config_file="${FILMOTT_BACKUP_CONFIG_FILE:-/home/ubuntu/.config/filmott-backup.env}"
if [ -f "$config_file" ]; then
  # shellcheck disable=SC1090
  source "$config_file"
fi

backup_dir="${BACKUP_DIR:-/home/ubuntu/backups}"
keep_days="${BACKUP_KEEP_DAYS:-7}"
container="${POSTGRES_CONTAINER:-filmott-postgres-1}"
db_user="${POSTGRES_USER:-filmott}"
db_name="${POSTGRES_DB:-filmott}"
lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"
timestamp="$(date +%Y%m%d_%H%M)"
filename="backup_${timestamp}.dump"
container_path="/tmp/${filename}"
partial_path="${backup_dir}/${filename}.part"
backup_path="${backup_dir}/${filename}"

exec 9>"$lock_file"
if ! flock -w 900 9; then
  echo "[$(date)] 다른 운영 작업이 실행 중이어서 DB 백업을 중단합니다: ${lock_file}"
  exit 1
fi

cleanup() {
  docker exec "$container" rm -f "$container_path" >/dev/null 2>&1 || true
  rm -f "$partial_path"
}
trap cleanup EXIT

mkdir -p "$backup_dir"
docker exec "$container" pg_dump \
  -U "$db_user" \
  -d "$db_name" \
  --format=custom \
  --file="$container_path"
docker exec "$container" pg_restore --list "$container_path" >/dev/null
docker cp "${container}:${container_path}" "$partial_path"
mv "$partial_path" "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "BACKUP_REMOTE가 설정됐지만 rclone을 찾을 수 없습니다." >&2
    exit 1
  fi
  remote_dir="${BACKUP_REMOTE%/}"
  rclone copyto "$backup_path" "${remote_dir}/${filename}"
  rclone copyto "${backup_path}.sha256" "${remote_dir}/${filename}.sha256"
  echo "[$(date)] 원격 백업 업로드 완료: ${remote_dir}/${filename}"
else
  echo "[$(date)] BACKUP_REMOTE가 없어 로컬 백업만 보관합니다."
fi

find "$backup_dir" -type f \
  \( -name 'backup_*.dump' -o -name 'backup_*.dump.sha256' \) \
  -mtime "+${keep_days}" -delete

echo "[$(date)] 백업 완료: ${backup_path} (보관: ${keep_days}일)"
