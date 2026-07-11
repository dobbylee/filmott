#!/usr/bin/env bash

set -Eeuo pipefail

backup_dir="${BACKUP_DIR:-/home/ubuntu/backups}"
container="${POSTGRES_CONTAINER:-filmott-postgres-1}"
db_user="${POSTGRES_USER:-filmott}"
verify_db="${POSTGRES_VERIFY_DB:-filmott_restore_verify}"
lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"

if [[ ! "$verify_db" =~ ^[a-z][a-z0-9_]*_restore_verify$ ]] ||
  [ "${#verify_db}" -gt 63 ]; then
  echo "복원 검증 DB 이름은 안전한 PostgreSQL identifier와 _restore_verify 접미사를 사용해야 합니다: ${verify_db}" >&2
  exit 1
fi

exec 9>"$lock_file"
if ! flock -w 900 9; then
  echo "[$(date)] 다른 운영 작업이 실행 중이어서 복원 검증을 중단합니다: ${lock_file}"
  exit 1
fi

production_db="${POSTGRES_DB:-}"
if [ -z "$production_db" ]; then
  production_db="$(
    docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container" |
      sed -n 's/^POSTGRES_DB=//p' |
      head -n 1
  )"
fi
if [ -z "$production_db" ]; then
  echo "운영 DB 이름을 확인할 수 없습니다: ${container}" >&2
  exit 1
fi
if [ "$verify_db" = "$production_db" ]; then
  echo "복원 검증 DB는 운영 DB와 달라야 합니다: ${verify_db}" >&2
  exit 1
fi

backup_path="$(find "$backup_dir" -maxdepth 1 -type f -name 'backup_*.dump' -print | sort | tail -n 1)"
if [ -z "$backup_path" ]; then
  echo "복원 검증에 사용할 백업이 없습니다: ${backup_dir}" >&2
  exit 1
fi

filename="$(basename "$backup_path")"
container_path="/tmp/${filename}"

cleanup() {
  docker exec "$container" dropdb \
    -U "$db_user" \
    --if-exists \
    --force \
    "$verify_db" >/dev/null 2>&1 || true
  docker exec "$container" rm -f "$container_path" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -f "${backup_path}.sha256" ]; then
  sha256sum --check "${backup_path}.sha256"
fi

docker exec "$container" pg_restore --list "$container_path" >/dev/null 2>&1 || \
  docker cp "$backup_path" "${container}:${container_path}"
docker exec "$container" pg_restore --list "$container_path" >/dev/null

docker exec "$container" dropdb \
  -U "$db_user" \
  --if-exists \
  --force \
  "$verify_db"
docker exec "$container" createdb -U "$db_user" "$verify_db"
docker exec "$container" pg_restore \
  -U "$db_user" \
  -d "$verify_db" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "$container_path"

migration_count="$(docker exec "$container" psql -U "$db_user" -d "$verify_db" -Atc 'SELECT COUNT(*) FROM migrations')"
content_count="$(docker exec "$container" psql -U "$db_user" -d "$verify_db" -Atc 'SELECT COUNT(*) FROM contents')"
if [ "$migration_count" -le 0 ] || [ "$content_count" -le 0 ]; then
  echo "복원 검증 데이터가 비어 있습니다: migrations=${migration_count}, contents=${content_count}" >&2
  exit 1
fi

echo "[$(date)] 복원 검증 완료: ${filename} (migrations=${migration_count}, contents=${content_count})"
