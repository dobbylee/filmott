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
  'workflow_dispatch:' \
  "vars.FILMOTT_BLUE_GREEN_READY == '1'" \
  'actions: read' \
  'No successful CI run for ${VERIFY_SHA}' \
  'git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main' \
  'git cat-file -e "${DEPLOY_SHA}^{commit}"' \
  'git show "${DEPLOY_SHA}:scripts/deploy-blue-green.sh" > "$deploy_script"' \
  'command_timeout: 20m' \
  'envs: DEPLOY_SHA,FILMOTT_REQUIRE_SSE_SMOKE,FILMOTT_REQUIRE_CUTOVER' \
  'FILMOTT_REPO_ROOT="$PWD" bash "$deploy_script" deploy "$DEPLOY_SHA"'; do
  if [[ "$deploy_workflow" != *"$required_fragment"* ]]; then
    echo "검증된 SHA의 blue-green 스크립트 실행 계약이 누락됐습니다: ${required_fragment}" >&2
    exit 1
  fi
done

for forbidden_fragment in \
  'compose restart nginx' \
  'compose up -d' \
  'docker compose down'; do
  if [[ "$deploy_workflow" == *"$forbidden_fragment"* ]]; then
    echo "Deploy workflow가 검증된 blue-green 스크립트 밖에서 lifecycle을 변경합니다: ${forbidden_fragment}" >&2
    exit 1
  fi
done

blue_green_script="$(<"${repo_root}/scripts/deploy-blue-green.sh")"
for required_fragment in \
  "trap '' PIPE" \
  'mktemp "${FILMOTT_RECOVERY_LOG_DIR:-/tmp}/filmott-blue-green-recovery.XXXXXX"' \
  'Rollback failed; preserving both slots and uncertainty marker' \
  'blue_green_compose build "frontend-${slot}" "backend-${slot}"' \
  'blue_green_compose up -d --no-deps --force-recreate' \
  'blue_green_compose exec -T nginx nginx -s reload' \
  'FILMOTT_BLUE_GREEN_DRAIN_SECONDS:-300' \
  'blue_green_start_probe' \
  'blue_green_verify_observers' \
  'blue_green_wait_drain' \
  'blue_green_finish_probe' \
  'blue_green_signal_sse_cutover' \
  'FILMOTT_REQUIRE_CUTOVER' \
  'Manual cutover target is stale' \
  'Manual cutover did not activate target' \
  'blue-green-smoke.sh' \
  'git -C "$FILMOTT_REPO_ROOT" reset --hard "$target_sha"'; do
  if [[ "$blue_green_script" != *"$required_fragment"* ]]; then
    echo "Blue-green 복구 안전 계약이 누락됐습니다: ${required_fragment}" >&2
    exit 1
  fi
done

blue_green_smoke_script="$(<"${repo_root}/scripts/blue-green-smoke.sh")"
for required_fragment in \
  'blue_green_wait_probe_ready' \
  'FILMOTT_SMOKE_READY_FILE' \
  'blue_green_sse_marker_matches' \
  'openssl rand -hex 16'; do
  if [[ "$blue_green_smoke_script" != *"$required_fragment"* ]]; then
    echo "Blue-green 관측 helper 계약이 누락됐습니다: ${required_fragment}" >&2
    exit 1
  fi
done

for forbidden_fragment in \
  'compose down' \
  'docker volume' \
  '--volumes' \
  'compose restart nginx'; do
  if [[ "$blue_green_script" == *"$forbidden_fragment"* ]]; then
    echo "Blue-green app 배포 상태 머신에 금지된 lifecycle 범위가 있습니다: ${forbidden_fragment}" >&2
    exit 1
  fi
done

pre_recovery_output="${blue_green_script%%blue_green_error \"Deploy interrupted by \${signal}\"*}"
if [[ "$pre_recovery_output" != *"trap '' PIPE"* ]] ||
  [[ "$pre_recovery_output" != *'exec >> "$recovery_log" 2>&1'* ]]; then
  echo '중단 신호 복구가 출력 전에 SIGPIPE 보호와 서버 로그 전환을 수행하지 않습니다.' >&2
  exit 1
fi

bash "${repo_root}/scripts/blue-green-deploy.test.sh"
bash "${repo_root}/scripts/blue-green-smoke.test.sh"

echo '운영 스크립트 안전 회귀 검증 통과'
