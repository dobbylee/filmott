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
  'docker image tag filmott-backend:rollback "$previous_backend_ref"' \
  "trap 'handle_deploy_signal HUP 129' HUP" \
  "trap 'handle_deploy_signal INT 130' INT" \
  "trap 'handle_deploy_signal TERM 143' TERM" \
  'docker image inspect filmott-frontend:rollback filmott-backend:rollback' \
  'docker image tag filmott-frontend:rollback filmott-frontend:latest' \
  'docker image tag filmott-backend:rollback filmott-backend:latest' \
  'compose up -d --no-deps --force-recreate frontend backend' \
  'wait_for_backend || return 1' \
  'wait_for_frontend || return 1' \
  'compose restart nginx || return 1'; do
  if [[ "$deploy_workflow" != *"$required_fragment"* ]]; then
    echo "배포 복구 계약이 누락됐습니다: ${required_fragment}" >&2
    exit 1
  fi
done

if [[ "$deploy_workflow" != *'recover_deploy "$status" "Deploy failed" 0'* ]] ||
  [[ "$deploy_workflow" != *'recover_deploy "$status" "Deploy interrupted by ${signal}" 1'* ]]; then
  echo 'ERR와 중단 신호가 같은 배포 복구 경로를 사용하지 않습니다.' >&2
  exit 1
fi

if [[ "$deploy_workflow" != *'recovery_in_progress=1'* ]] ||
  [[ "$deploy_workflow" != *'trap - ERR HUP INT TERM'* ]] ||
  [[ "$deploy_workflow" != *$'trap - ERR HUP INT TERM\n              set +e'* ]] ||
  [[ "$deploy_workflow" != *"trap '' PIPE"* ]] ||
  [[ "$deploy_workflow" != *'mktemp /tmp/filmott-deploy-recovery.XXXXXX.log'* ]] ||
  [[ "$deploy_workflow" != *'exec >> "$recovery_log" 2>&1'* ]]; then
  echo '중단 신호의 중복 rollback 방지 계약이 누락됐습니다.' >&2
  exit 1
fi

pre_recovery_output="${deploy_workflow%%echo \"\$reason\"*}"
if [[ "$pre_recovery_output" != *"trap '' PIPE"* ]] ||
  [[ "$pre_recovery_output" != *'exec >> "$recovery_log" 2>&1'* ]]; then
  echo '중단 신호 복구가 출력 전에 SIGPIPE 보호와 서버 로그 전환을 수행하지 않습니다.' >&2
  exit 1
fi

pre_container_snapshot="${deploy_workflow%%previous_frontend_container=\$\(compose ps -q frontend\)*}"
if [[ "$pre_container_snapshot" != *'if ! apps_are_running; then'* ]] ||
  [[ "$pre_container_snapshot" != *'if ! restore_interrupted_release; then'* ]]; then
  echo '실행 컨테이너 snapshot 전에 interrupted deploy 복구가 수행되지 않습니다.' >&2
  exit 1
fi

if [[ "$deploy_workflow" != *'Both frontend/backend rollback images are required for interrupted deploy recovery'* ]] ||
  [[ "$deploy_workflow" != *'fail_deploy "Cannot recover interrupted frontend/backend release"'* ]]; then
  echo '두 rollback 이미지가 없을 때 안전하게 실패하는 계약이 누락됐습니다.' >&2
  exit 1
fi

interrupted_restore_body="$(
  awk '
    $0 == "            restore_interrupted_release() {" {
      capture = 1
    }
    capture {
      print
    }
    capture && $0 == "            }" {
      exit
    }
  ' "${repo_root}/.github/workflows/deploy.yml"
)"
if [[ "$interrupted_restore_body" != *'compose up -d --no-deps --force-recreate frontend backend || return 1'* ]] ||
  [[ "$interrupted_restore_body" == *postgres* ]] ||
  [[ "$interrupted_restore_body" == *'compose down'* ]] ||
  [[ "$interrupted_restore_body" == *'docker volume'* ]] ||
  [[ "$interrupted_restore_body" == *'--volumes'* ]]; then
  echo 'interrupted deploy 복구가 frontend/backend 범위를 벗어났습니다.' >&2
  exit 1
fi

unexpected_lifecycle_call="$(
  printf '%s\n' "$interrupted_restore_body" |
    grep -E '^[[:space:]]+compose (up|down|stop|rm|restart)' |
    grep -Fv 'compose up -d --no-deps --force-recreate frontend backend || return 1' |
    grep -Fv 'compose restart nginx || return 1' ||
    true
)"
if [ -n "$unexpected_lifecycle_call" ]; then
  echo "interrupted deploy 복구에 허용되지 않은 compose lifecycle 호출이 있습니다: ${unexpected_lifecycle_call}" >&2
  exit 1
fi

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
