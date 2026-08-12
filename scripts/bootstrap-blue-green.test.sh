#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
event_log="${test_root}/events"
target_sha='1111111111111111111111111111111111111111'
active_sha='2222222222222222222222222222222222222222'
frontend_id="$(printf 'a%.0s' {1..64})"
backend_id="$(printf 'b%.0s' {1..64})"
postgres_id="$(printf 'c%.0s' {1..64})"

cleanup() {
  rm -f "${test_root}"/* "${test_root}"/nginx/* 2>/dev/null || true
  rmdir "${test_root}/nginx" "$test_root" 2>/dev/null || true
}
trap cleanup EXIT

export FILMOTT_REPO_ROOT="$repo_root"
export FILMOTT_DEPLOY_STATE_DIR="$test_root"
export FILMOTT_BOOTSTRAP_FILE="${test_root}/bootstrap-state"
export FILMOTT_RELEASE_FILE="${test_root}/active-release"
export FILMOTT_UPSTREAM_FILE="${test_root}/nginx/upstreams.conf"
export FILMOTT_CANDIDATE_FILE="${test_root}/nginx/candidate.conf"
export FILMOTT_STATIC_ASSET_FILE="${test_root}/previous-static-assets"
export FILMOTT_LEGACY_NGINX_FILE="${test_root}/legacy-nginx.conf"
export FILMOTT_LEGACY_OVERRIDE_FILE="${test_root}/legacy-nginx.override.yml"
export FILMOTT_RECOVERY_LOG_DIR="$test_root"
# shellcheck source=bootstrap-blue-green.sh
source "${repo_root}/scripts/bootstrap-blue-green.sh"

record() { printf '%s\n' "$1" >> "$event_log"; }

assert_events() {
  local actual="$(<"$event_log")"
  [ "$actual" = "$1" ] || {
    printf 'event mismatch\nexpected:\n%s\nactual:\n%s\n' "$1" "$actual" >&2
    exit 1
  }
}

BOOTSTRAP_TARGET_SHA="$target_sha"
BOOTSTRAP_ACTIVE_SHA="$active_sha"
BOOTSTRAP_LEGACY_FRONTEND="$frontend_id"
BOOTSTRAP_LEGACY_BACKEND="$backend_id"
BOOTSTRAP_POSTGRES="$postgres_id"
bootstrap_write_state prepared
bootstrap_read_state
[ "$BOOTSTRAP_PHASE" = prepared ] && [ "$BOOTSTRAP_TARGET_SHA" = "$target_sha" ]

# Docker service label template은 Go template parser에 quote를 그대로 전달한다.
(
  bootstrap_compose() { printf '%s\n' "$frontend_id"; }
  docker() {
    if [ "$3" = '{{.State.Running}}' ]; then
      printf 'true\n'
    elif [ "$3" = '{{index .Config.Labels "com.docker.compose.service"}}' ]; then
      printf 'frontend\n'
    else
      return 1
    fi
  }
  [ "$(bootstrap_running_container frontend)" = "$frontend_id" ]
)

printf 'extra=1\n' >> "$FILMOTT_BOOTSTRAP_FILE"
if bootstrap_read_state 2>/dev/null; then
  echo 'Malformed bootstrap state was accepted' >&2
  exit 1
fi
bootstrap_write_state prepared

mkdir -p "${test_root}/nginx"
printf 'expected\n' > "$FILMOTT_CANDIDATE_FILE"
printf 'expected\n' > "$FILMOTT_UPSTREAM_FILE"
printf 'legacy\n' > "$FILMOTT_LEGACY_NGINX_FILE"
printf 'services: {}\n' > "$FILMOTT_LEGACY_OVERRIDE_FILE"
blue_green_write_upstream() { printf 'expected\n' > "$1"; }
bootstrap_legacy_compose() { return 0; }
bootstrap_validate_prepared_files
printf 'tampered\n' > "$FILMOTT_UPSTREAM_FILE"
if bootstrap_validate_prepared_files; then
  echo 'Tampered prepared upstream was accepted' >&2
  exit 1
fi
printf 'expected\n' > "$FILMOTT_UPSTREAM_FILE"

bootstrap_prepare_run() { record prepare_run; return "${PREPARE_STATUS:-0}"; }
bootstrap_prepare_cleanup() { record "prepare_cleanup:$1"; }
: > "$event_log"
bootstrap_prepare "$target_sha" "$active_sha"
assert_events 'prepare_run'
: > "$event_log"
PREPARE_STATUS=1
bootstrap_prepare_run() { BOOTSTRAP_PREPARE_STARTED=1; record prepare_run; return 1; }
set +e
bootstrap_prepare "$target_sha" "$active_sha"
prepare_status=$?
set -e
[ "$prepare_status" -eq 1 ]
assert_events "prepare_run
prepare_cleanup:${active_sha}"
unset PREPARE_STATUS

# 신호 중단은 현재 operation에 맞는 복구를 한 번만 수행한다.
: > "$event_log"
BOOTSTRAP_OPERATION=prepare
BOOTSTRAP_OPERATION_COMPLETED=0
BOOTSTRAP_RECOVERY_STARTED=0
BOOTSTRAP_PREPARE_STARTED=1
set +e
(bootstrap_on_signal 143 TERM)
signal_status=$?
set -e
[ "$signal_status" -eq 143 ]
assert_events "prepare_cleanup:${active_sha}"

: > "$event_log"
BOOTSTRAP_OPERATION=cutover
BOOTSTRAP_RECOVERY_STARTED=0
BOOTSTRAP_NGINX_CHANGED=1
bootstrap_finish_maintenance_probe() { record finish_probe; }
bootstrap_rollback() { record rollback; }
set +e
(bootstrap_on_signal 143 TERM)
signal_status=$?
set -e
[ "$signal_status" -eq 143 ]
assert_events "finish_probe
rollback"

bootstrap_cutover_run() { record cutover_run; return "${CUTOVER_STATUS:-0}"; }
bootstrap_finish_maintenance_probe() { record finish_probe; }
bootstrap_rollback() { record rollback; }
: > "$event_log"
bootstrap_cutover "$target_sha"
assert_events 'cutover_run'
: > "$event_log"
CUTOVER_STATUS=1
BOOTSTRAP_NGINX_CHANGED=0
set +e
bootstrap_cutover "$target_sha"
cutover_status=$?
set -e
[ "$cutover_status" -eq 1 ]
assert_events "cutover_run
finish_probe"
: > "$event_log"
bootstrap_cutover_run() { BOOTSTRAP_NGINX_CHANGED=1; record cutover_run; return 1; }
set +e
bootstrap_cutover "$target_sha"
cutover_status=$?
set -e
[ "$cutover_status" -eq 1 ]
assert_events "cutover_run
finish_probe
rollback"
unset CUTOVER_STATUS

# rollback은 legacy apps 확인 후 저장된 nginx override 한 경로만 사용한다.
# shellcheck source=bootstrap-blue-green.sh
source "${repo_root}/scripts/bootstrap-blue-green.sh"
bootstrap_read_state() {
  BOOTSTRAP_PHASE=cutover
  BOOTSTRAP_TARGET_SHA="$target_sha"
  BOOTSTRAP_ACTIVE_SHA="$active_sha"
  BOOTSTRAP_LEGACY_FRONTEND="$frontend_id"
  BOOTSTRAP_LEGACY_BACKEND="$backend_id"
  BOOTSTRAP_POSTGRES="$postgres_id"
}
bootstrap_source_deploy() { return 0; }
blue_green_read_release() {
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_ACTIVE_SHA="$active_sha"
}
docker() {
  record "docker:$*"
  [[ "$*" != *'.State.Running'* ]] || printf 'true\n'
}
bootstrap_legacy_compose() { record "legacy_compose:$*"; }
bootstrap_wait_legacy_origin() { record wait_legacy_origin; }
bootstrap_write_state() { record "write_state:$1"; }
git() { record "git:$*"; }
: > "$FILMOTT_RELEASE_FILE"
: > "$event_log"
bootstrap_rollback
assert_events "docker:start ${backend_id} ${frontend_id}
docker:inspect -f {{.State.Running}} ${backend_id}
docker:inspect -f {{.State.Running}} ${frontend_id}
legacy_compose:up -d --no-deps --force-recreate nginx
wait_legacy_origin
git:-C ${repo_root} reset --hard ${active_sha}
write_state:prepared"
[ ! -e "$FILMOTT_RELEASE_FILE" ]

# release 삭제 실패 전 prepared state를 기록해 rollback 재실행 경로를 보존한다.
: > "$FILMOTT_RELEASE_FILE"
blue_green_read_release() {
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_ACTIVE_SHA="$active_sha"
}
: > "$event_log"
set +e
(
  rm() {
    if [ "${1:-}" = -f ] && [ "${2:-}" = "$FILMOTT_RELEASE_FILE" ]; then
      record release_rm_failed
      return 1
    fi
    command rm "$@"
  }
  bootstrap_rollback
) 2>/dev/null
release_rm_status=$?
set -e
[ "$release_rm_status" -eq 1 ]
[[ "$(<"$event_log")" == *$'write_state:prepared\nrelease_rm_failed'* ]]

: > "$FILMOTT_RELEASE_FILE"
blue_green_read_release() {
  BLUE_GREEN_ACTIVE_SLOT=green
  BLUE_GREEN_ACTIVE_SHA="$target_sha"
}
: > "$event_log"
set +e
bootstrap_rollback 2>/dev/null
stale_rollback_status=$?
set -e
[ "$stale_rollback_status" -eq 1 ]
assert_events ''
rm -f "$FILMOTT_RELEASE_FILE"

# prepare는 운영 checkout을 target으로 바꾸지 않고, cutover 직전에만 전환한다.
prepare_source="$(sed -n '/^bootstrap_prepare_run() {$/,/^bootstrap_prepare() {$/p' \
  "${repo_root}/scripts/bootstrap-blue-green.sh")"
cutover_source="$(sed -n '/^bootstrap_cutover_run() {$/,/^bootstrap_cutover() {$/p' \
  "${repo_root}/scripts/bootstrap-blue-green.sh")"
[[ "$prepare_source" != *'reset --hard "$target_sha"'* ]]
[[ "$prepare_source" == *'bootstrap_extract_target_files "$target_sha"'* ]]
[[ "$cutover_source" == *'reset --hard "$target_sha"'* ]]

set +e
usage_output="$(bash "${repo_root}/scripts/bootstrap-blue-green.sh" 2>&1)"
usage_status=$?
set -e
[ "$usage_status" -eq 64 ] && [[ "$usage_output" == *'Usage: bootstrap-blue-green.sh'* ]]

echo 'Blue-green 단계별 bootstrap 계약 검증 통과'
