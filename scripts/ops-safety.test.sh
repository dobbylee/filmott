#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"

cleanup() {
  rm -f \
    "${test_root}/init/certbot/conf/live/filmott.kr/fullchain.pem" \
    "${test_root}/init/ops.lock" \
    "${test_root}/verify.lock"
  rmdir \
    "${test_root}/init/certbot/conf/live/filmott.kr" \
    "${test_root}/init/certbot/conf/live" \
    "${test_root}/init/certbot/conf" \
    "${test_root}/init/certbot" \
    "${test_root}/init" \
    "${test_root}/backups" \
    "$test_root" 2>/dev/null || true
}
trap cleanup EXIT

flock() {
  echo '__flock_called__'
  return 0
}

run_verify() {
  local production_db="$1"
  local verify_db="$2"

  (
    export BACKUP_DIR="${test_root}/backups"
    export FILMOTT_OPS_LOCK_FILE="${test_root}/verify.lock"
    export POSTGRES_DB="$production_db"
    export POSTGRES_VERIFY_DB="$verify_db"
    source "${repo_root}/scripts/verify-db-backup.sh"
  ) 2>&1
}

mkdir -p "${test_root}/backups"

set +e
same_db_output="$(run_verify filmott_restore_verify filmott_restore_verify)"
same_db_status=$?
invalid_name_output="$(run_verify filmott filmott-restore-verify)"
invalid_name_status=$?
safe_name_output="$(run_verify filmott filmott_restore_verify)"
safe_name_status=$?
set -e

if [ "$same_db_status" -eq 0 ] ||
  [[ "$same_db_output" != *'복원 검증 DB는 운영 DB와 달라야 합니다'* ]]; then
  echo '운영 DB와 같은 이름을 복원 검증이 거부하지 않았습니다.' >&2
  exit 1
fi
if [ "$invalid_name_status" -eq 0 ] ||
  [[ "$invalid_name_output" != *'안전한 PostgreSQL identifier'* ]]; then
  echo '안전하지 않은 복원 DB 이름을 거부하지 않았습니다.' >&2
  exit 1
fi
if [ "$safe_name_status" -eq 0 ] ||
  [[ "$safe_name_output" != *'복원 검증에 사용할 백업이 없습니다'* ]]; then
  echo 'restore_verify 전용 이름이 안전성 검사를 통과하지 못했습니다.' >&2
  exit 1
fi

docker() {
  echo '__docker_should_not_run__'
  return 99
}
openssl() {
  echo '__openssl_should_not_run__'
  return 99
}

mkdir -p "${test_root}/init/certbot/conf/live/filmott.kr"
: > "${test_root}/init/certbot/conf/live/filmott.kr/fullchain.pem"

set +e
init_output="$({
  cd "${test_root}/init"
  export FILMOTT_OPS_LOCK_FILE="${test_root}/init/ops.lock"
  source "${repo_root}/scripts/init-ssl.sh" filmott.kr admin@filmott.kr
} 2>&1)"
init_status=$?
set -e

if [ "$init_status" -eq 0 ] ||
  [[ "$init_output" != *'__flock_called__'* ]] ||
  [[ "$init_output" != *'기존 인증서가 있어 초기 발급을 중단합니다'* ]] ||
  [[ "$init_output" == *'__docker_should_not_run__'* ]] ||
  [[ "$init_output" == *'__openssl_should_not_run__'* ]]; then
  echo 'SSL 초기 발급의 lock 이후 기존 인증서 보호 검증이 실패했습니다.' >&2
  exit 1
fi

deploy_workflow="$(<"${repo_root}/.github/workflows/deploy.yml")"
for required_fragment in \
  'previous_head=$(git rev-parse HEAD)' \
  'git reset --hard "$previous_head"' \
  'docker image tag filmott-frontend:rollback "$previous_frontend_ref"' \
  'docker image tag filmott-backend:rollback "$previous_backend_ref"'; do
  if [[ "$deploy_workflow" != *"$required_fragment"* ]]; then
    echo "배포 복구 계약이 누락됐습니다: ${required_fragment}" >&2
    exit 1
  fi
done

restore_call_count="$(grep -Fc 'restore_previous_build_state' "${repo_root}/.github/workflows/deploy.yml")"
if [ "$restore_call_count" -lt 4 ]; then
  echo 'stale skip, pre-cutover 실패, rollback의 상태 복구 호출이 누락됐습니다.' >&2
  exit 1
fi

post_checkout="${deploy_workflow#*git reset --hard \"\$DEPLOY_SHA\"}"
pre_cutover="${post_checkout%%cutover_started=1*}"
if [[ "$pre_cutover" == *'exit 1'* ]]; then
  echo 'checkout 변경 후 cutover 전 오류가 복구 handler를 우회합니다.' >&2
  exit 1
fi

echo '운영 스크립트 안전 회귀 검증 통과'
