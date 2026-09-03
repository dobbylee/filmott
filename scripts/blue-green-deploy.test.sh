#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
event_log="${test_root}/events.log"
active_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
target_sha='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

cleanup() {
  rm -f "${test_root}"/* "${test_root}"/nginx/* 2>/dev/null || true
  rmdir "${test_root}/nginx" "$test_root" 2>/dev/null || true
}
trap cleanup EXIT

export FILMOTT_DEPLOY_STATE_DIR="$test_root"
export FILMOTT_RELEASE_FILE="${test_root}/active-release"
export FILMOTT_UNCERTAIN_FILE="${test_root}/deployment-uncertain"
export FILMOTT_UPSTREAM_FILE="${test_root}/nginx/upstreams.conf"
export FILMOTT_CANDIDATE_FILE="${test_root}/nginx/candidate.conf"
export FILMOTT_ROLLBACK_FILE="${test_root}/nginx/rollback.conf"
export FILMOTT_RECOVERY_LOG_DIR="$test_root"

# shellcheck source=scripts/deploy-blue-green.sh
source "${repo_root}/scripts/deploy-blue-green.sh"
blue_green_load_smoke_helpers
declare -F blue_green_start_probe > /dev/null
declare -F blue_green_start_sse_smoke > /dev/null

assert_status() {
  if [ "$2" -ne "$1" ]; then
    echo "$3: expected status $1, got $2" >&2
    exit 1
  fi
}

assert_events() {
  local actual
  actual="$(<"$event_log")"
  if [ "$actual" != "$1" ]; then
    echo "$2: unexpected event sequence" >&2
    printf '%s\n' '--- expected ---' "$1" '--- actual ---' "$actual" >&2
    exit 1
  fi
}

# release와 upstream 상태는 파일 전체를 정확히 검증한다.
blue_green_write_release blue "$active_sha"
blue_green_read_release
[ "$BLUE_GREEN_ACTIVE_SLOT" = blue ] && [ "$BLUE_GREEN_ACTIVE_SHA" = "$active_sha" ]
for invalid in $'slot=blue\nsha=bad' $'slot=blue\nsha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nextra=1'; do
  printf '%s\n' "$invalid" > "$FILMOTT_RELEASE_FILE"
  set +e
  blue_green_read_release > /dev/null 2>&1
  status=$?
  set -e
  assert_status 1 "$status" 'invalid release state'
done
printf 'slot=blue\nsha=%s\0' "$active_sha" > "$FILMOTT_RELEASE_FILE"
set +e
blue_green_read_release > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'NUL release state'

blue_green_write_release blue "$active_sha"
blue_green_write_upstream "$FILMOTT_UPSTREAM_FILE" blue "$active_sha"
upstream="$(<"$FILMOTT_UPSTREAM_FILE")"
for fragment in \
  'map $host $filmott_active_slot { default "blue"; }' \
  "map \$host \$filmott_active_sha { default \"${active_sha}\"; }" \
  'map $host $filmott_previous_frontend { default "frontend-blue:3000"; }' \
  'server frontend-blue:3000' \
  'server backend-blue:3001'; do
  [[ "$upstream" == *"$fragment"* ]] || { echo "upstream missing: $fragment" >&2; exit 1; }
done

blue_green_write_upstream "$FILMOTT_CANDIDATE_FILE" green "$target_sha" blue
green_upstream="$(<"$FILMOTT_CANDIDATE_FILE")"
for fragment in \
  'map $host $filmott_active_slot { default "green"; }' \
  'map $host $filmott_previous_frontend { default "frontend-blue:3000"; }' \
  'server frontend-green:3000' \
  'server backend-green:3001'; do
  [[ "$green_upstream" == *"$fragment"* ]] || { echo "green upstream missing: $fragment" >&2; exit 1; }
done

# uncertainty marker는 컨테이너 조회보다 먼저 배포를 차단한다.
: > "$event_log"
: > "$FILMOTT_UNCERTAIN_FILE"
blue_green_compose() { printf 'compose:%s\n' "$*" >> "$event_log"; }
set +e
blue_green_preflight > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'uncertain preflight'
assert_events '' 'uncertain preflight'
rm -f "$FILMOTT_UNCERTAIN_FILE"

# 200이어도 기대 slot/SHA header가 아니면 다음 응답까지 기다린다.
: > "${test_root}/identity-count"
blue_green_origin_headers() {
  local count
  count="$(wc -l < "${test_root}/identity-count" | tr -d '[:space:]')"
  printf 'x\n' >> "${test_root}/identity-count"
  if [ "$count" -eq 0 ]; then
    printf 'HTTP/1.1 200 OK\r\nX-Filmott-Slot: blue\r\nX-Filmott-SHA: %s\r\n\r\n' "$active_sha"
  else
    printf 'HTTP/1.1 200 OK\r\nX-Filmott-Slot: green\r\nX-Filmott-SHA: %s\r\n\r\n' "$target_sha"
  fi
}
sleep() { :; }
blue_green_wait_for_identity green "$target_sha" 2
[ "$(wc -l < "${test_root}/identity-count" | tr -d '[:space:]')" -eq 2 ]

# inactive lifecycle은 app 두 서비스만 다루고 첫 실패를 숨기지 않는다.
: > "$event_log"
blue_green_compose() {
  printf 'compose:%s\n' "$*" >> "$event_log"
  [ "${FAIL_COMPOSE:-}" != "$1" ]
}
blue_green_start_inactive green
assert_events 'compose:rm -sf frontend-green backend-green
compose:up -d --no-deps --force-recreate frontend-green backend-green' 'inactive lifecycle scope'
: > "$event_log"
FAIL_COMPOSE=rm
set +e
if ! blue_green_start_inactive green; then status=1; else status=0; fi
set -e
assert_status 1 "$status" 'inactive rm failure'
assert_events 'compose:rm -sf frontend-green backend-green' 'inactive rm failure'
unset FAIL_COMPOSE

# deploy disk headroom은 경계값을 허용하고 부족하거나 파싱할 수 없으면 실패한다.
FILMOTT_DEPLOY_MIN_FREE_MB=10
df() {
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
  printf '/dev/test 100000 1 %s 1%% /test\n' "${MOCK_AVAILABLE_KB}"
}
MOCK_AVAILABLE_KB=10240
blue_green_require_disk_headroom "$test_root"
MOCK_AVAILABLE_KB=10239
set +e
blue_green_require_disk_headroom "$test_root" > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'deploy disk below threshold'
MOCK_AVAILABLE_KB=invalid
set +e
blue_green_require_disk_headroom "$test_root" > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'deploy disk invalid result'
FILMOTT_DEPLOY_MIN_FREE_MB=invalid
MOCK_AVAILABLE_KB=10240
set +e
blue_green_require_disk_headroom "$test_root" > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'deploy disk invalid override'
FILMOTT_DEPLOY_MIN_FREE_MB=18014398509481984
set +e
blue_green_require_disk_headroom "$test_root" > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'deploy disk overflow override'
unset FILMOTT_DEPLOY_MIN_FREE_MB MOCK_AVAILABLE_KB
unset -f df

# slot 상태는 service label뿐 아니라 실행 image, slot image, SHA tag까지 일치해야 한다.
blue_green_compose() {
  [ "$1" = ps ] && printf 'container-%s\n' "$3"
}
test_container_image='sha256:expected'
test_slot_image='sha256:expected'
test_sha_image='sha256:expected'
MISSING_FRONTEND_SHA_TAG=0
MISSING_BACKEND_SHA_TAG=0
MISSING_SLOT_IMAGE=0
FAIL_SHA_TAG_RECOVERY=0
sha_tag_recovery_count=0
docker() {
  local last="${!#}"
  if [ "$1" = image ] && [ "$2" = inspect ]; then
    case "$last" in
      "filmott-frontend:${target_sha}"|"filmott-backend:${target_sha}")
        if [ "$last" = "filmott-frontend:${target_sha}" ]; then
          [ "$MISSING_FRONTEND_SHA_TAG" = 0 ] || return 1
        else
          [ "$MISSING_BACKEND_SHA_TAG" = 0 ] || return 1
        fi
        printf '%s\n' "$test_sha_image"
        ;;
      filmott-frontend:green|filmott-backend:green)
        [ "$MISSING_SLOT_IMAGE" = 0 ] || return 1
        printf '%s\n' "$test_slot_image"
        ;;
      *) return 1 ;;
    esac
  elif [ "$1" = image ] && [ "$2" = tag ]; then
    [ "$FAIL_SHA_TAG_RECOVERY" = 0 ] || return 1
    sha_tag_recovery_count=$((sha_tag_recovery_count + 1))
    case "$last" in
      "filmott-frontend:${target_sha}") MISSING_FRONTEND_SHA_TAG=0 ;;
      "filmott-backend:${target_sha}") MISSING_BACKEND_SHA_TAG=0 ;;
      *) return 1 ;;
    esac
  elif [[ "$*" == *'.State.Running'* ]]; then
    printf 'true\n'
  elif [[ "$*" == *'com.docker.compose.service'* ]]; then
    [ "$3" = '{{index .Config.Labels "com.docker.compose.service"}}' ] || return 1
    printf '%s\n' "${last#container-}"
  else
    printf '%s\n' "$test_container_image"
  fi
}
blue_green_assert_slot green "$target_sha"
test_container_image='sha256:unexpected'
set +e
blue_green_assert_slot green "$target_sha"
status=$?
set -e
assert_status 1 "$status" 'slot image mismatch'
test_container_image='sha256:expected'

# SHA tag만 누락된 경우 active container와 slot image 일치 후 tag를 복구한다.
MISSING_FRONTEND_SHA_TAG=1
MISSING_BACKEND_SHA_TAG=1
sha_tag_recovery_count=0
blue_green_assert_slot green "$target_sha"
[ "$sha_tag_recovery_count" -eq 2 ] || {
  echo 'missing SHA tag recovery should tag frontend and backend' >&2
  exit 1
}

# slot image가 없거나 container image와 다르면 SHA tag를 만들지 않고 실패한다.
MISSING_FRONTEND_SHA_TAG=1
MISSING_BACKEND_SHA_TAG=1
MISSING_SLOT_IMAGE=1
sha_tag_recovery_count=0
set +e
blue_green_assert_slot green "$target_sha"
status=$?
set -e
assert_status 1 "$status" 'missing slot image'
[ "$sha_tag_recovery_count" -eq 0 ]
MISSING_SLOT_IMAGE=0
test_slot_image='sha256:unexpected'
sha_tag_recovery_count=0
set +e
blue_green_assert_slot green "$target_sha"
status=$?
set -e
assert_status 1 "$status" 'container and slot image mismatch'
[ "$sha_tag_recovery_count" -eq 0 ]
test_slot_image='sha256:expected'

# SHA tag 복구 자체가 실패하면 배포를 계속하지 않는다.
MISSING_FRONTEND_SHA_TAG=1
MISSING_BACKEND_SHA_TAG=1
FAIL_SHA_TAG_RECOVERY=1
set +e
blue_green_assert_slot green "$target_sha"
status=$?
set -e
assert_status 1 "$status" 'SHA tag recovery failure'
FAIL_SHA_TAG_RECOVERY=0
MISSING_FRONTEND_SHA_TAG=0
MISSING_BACKEND_SHA_TAG=0

# nginx -t 실패 후 reload를 실행하지 않는다.
: > "$event_log"
blue_green_compose() {
  printf 'compose:%s\n' "$*" >> "$event_log"
  [[ "$*" != *'nginx -t'* ]]
}
set +e
if ! blue_green_reload_nginx; then status=1; else status=0; fi
set -e
assert_status 1 "$status" 'nginx test failure'
assert_events 'compose:exec -T nginx nginx -t' 'nginx test failure'

# 실제 상태 머신 순서는 mock hook으로 간결하게 고정한다.
record() {
  local failure
  printf '%s\n' "$1" >> "$event_log"
  for failure in ${FAIL_AT:-}; do
    [ "$failure" != "$1" ] || return 1
  done
}
sleep() { record "sleep:$1"; }
blue_green_build_inactive() { record "build:$1"; }
blue_green_start_inactive() { record "start:$1"; }
blue_green_wait_inactive() { record "wait:$1"; }
git() {
  [[ "$*" == *'rev-parse origin/main'* ]] && printf '%s\n' "$target_sha"
  return 0
}
blue_green_write_upstream() { record "candidate:$2:$3"; printf candidate > "$1"; }
blue_green_test_candidate() { record test_nginx; }
blue_green_static_smoke() { record "static:$1"; }
blue_green_start_probe() {
  record start_probe || return 1
  MOCK_PROBE_STARTED=1
}
blue_green_verify_observers() { record verify_observers; }
blue_green_wait_drain() { record "drain:${BLUE_GREEN_DRAIN_SECONDS}"; }
blue_green_finish_probe() {
  if ! record finish_probe; then
    MOCK_PROBE_STARTED=0
    return 1
  fi
  MOCK_PROBE_STARTED=0
}
blue_green_abort_probe() {
  [ "${MOCK_PROBE_STARTED:-0}" = 1 ] || return 0
  record abort_probe || true
  MOCK_PROBE_STARTED=0
}

# probe ready와 SSE marker는 실제 배포 helper 계약으로 교차 검증한다.
BLUE_GREEN_PROBE_PID=$$
: > "$FILMOTT_PROBE_READY_FILE"
blue_green_wait_probe_ready
rm -f "$FILMOTT_PROBE_READY_FILE"
: > "$FILMOTT_PROBE_FAILURE_FILE"
set +e
blue_green_wait_probe_ready
status=$?
set -e
assert_status 1 "$status" 'probe ready failure marker'
rm -f "$FILMOTT_PROBE_FAILURE_FILE"

export FILMOTT_REQUIRE_SSE_SMOKE=1
export FILMOTT_SSE_ATTEMPT=0123456789abcdef0123456789abcdef
BLUE_GREEN_ACTIVE_SLOT=blue
printf 'attempt=ffffffffffffffffffffffffffffffff\nslot=blue\n' > "$FILMOTT_SSE_READY_FILE"
printf 'attempt=%s\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_SUCCESS_FILE"
set +e
blue_green_wait_sse_ready
status=$?
set -e
assert_status 1 "$status" 'stale SSE ready marker'
printf 'attempt=%s\nslot=blue\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_READY_FILE"
blue_green_wait_sse_ready
printf 'attempt=ffffffffffffffffffffffffffffffff\n' > "$FILMOTT_SSE_SUCCESS_FILE"
true &
BLUE_GREEN_SSE_PID=$!
: > "$FILMOTT_SSE_LOG_FILE"
set +e
blue_green_finish_sse_smoke
status=$?
set -e
assert_status 1 "$status" 'stale SSE success marker'
printf 'attempt=%s\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_SUCCESS_FILE"
true &
BLUE_GREEN_SSE_PID=$!
blue_green_finish_sse_smoke
blue_green_signal_sse_cutover
[ "$(<"$FILMOTT_SSE_CUTOVER_FILE")" = "attempt=${FILMOTT_SSE_ATTEMPT}" ]
blue_green_cleanup_sse_smoke
unset FILMOTT_REQUIRE_SSE_SMOKE FILMOTT_SSE_ATTEMPT

blue_green_start_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  record start_sse
}
blue_green_signal_sse_cutover() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  record signal_sse
}
blue_green_finish_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  record finish_sse
}
blue_green_cleanup_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  record cleanup_sse
}
blue_green_abort_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  record abort_sse || true
}
blue_green_mark_uncertain() { record mark_uncertain; : > "$FILMOTT_UNCERTAIN_FILE"; }
blue_green_reload_nginx() { record reload; }
blue_green_finalize_upstream() { record finalize_upstream; }
blue_green_wait_for_identity() { record "identity:$1:$2"; }
blue_green_revalidate() { record "revalidate:$1"; }
blue_green_write_release() { record "commit:$1:$2"; }
blue_green_compose() {
  record "compose:$*" || return 1
  [ "${FAIL_RETIRED_CLEANUP:-0}" != 1 ]
}
blue_green_rollback() {
  record rollback || return 1
  rm -f "$FILMOTT_UNCERTAIN_FILE"
}

run_deploy() {
  local failure="${1:-}"
  local status
  : > "$event_log"
  rm -f "$FILMOTT_UNCERTAIN_FILE"
  printf active > "$FILMOTT_UPSTREAM_FILE"
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_ACTIVE_SHA="$active_sha"
  BLUE_GREEN_TARGET_SHA="$target_sha"
  MOCK_PROBE_STARTED=0
  export BLUE_GREEN_ACTIVE_SLOT BLUE_GREEN_ACTIVE_SHA BLUE_GREEN_TARGET_SHA
  FAIL_AT="$failure"
  set +e
  blue_green_deploy
  status=$?
  set -e
  printf '%s\n' "$status"
}

success_events="build:green
start:green
wait:green
candidate:green:${target_sha}
test_nginx
static:capture-static
start_probe
verify_observers
mark_uncertain
reload
identity:green:${target_sha}
static:check-static
revalidate:green
drain:120
finalize_upstream
finish_probe
commit:green:${target_sha}
compose:rm -sf frontend-blue backend-blue"
status="$(run_deploy)"
assert_status 0 "$status" 'successful deploy'
assert_events "$success_events" 'successful deploy'
[ ! -e "$FILMOTT_UNCERTAIN_FILE" ]

opt_in_success_events="${success_events/start_probe/start_probe
start_sse}"
opt_in_success_events="${opt_in_success_events/reload/reload
signal_sse}"
opt_in_success_events="${opt_in_success_events/finish_probe/finish_probe
finish_sse}"
opt_in_success_events="${opt_in_success_events/commit:green:${target_sha}/commit:green:${target_sha}
cleanup_sse}"
status="$(FILMOTT_REQUIRE_SSE_SMOKE=1 run_deploy)"
assert_status 0 "$status" 'successful SSE opt-in deploy'
assert_events "$opt_in_success_events" 'successful SSE opt-in deploy'

# 동일 SHA 재실행은 immutable tag와 active slot을 건드리지 않는다.
: > "$event_log"
BLUE_GREEN_ACTIVE_SHA="$target_sha"
BLUE_GREEN_TARGET_SHA="$target_sha"
FAIL_AT="build:green identity:green:${target_sha}"
blue_green_deploy > /dev/null
assert_events '' 'same SHA deploy'

status="$(run_deploy "identity:green:${target_sha}")"
assert_status 1 "$status" 'post-cutover identity failure'
[[ "$(<"$event_log")" == *$'rollback' ]]
[ ! -e "$FILMOTT_UNCERTAIN_FILE" ]

status="$(run_deploy wait:green)"
assert_status 1 "$status" 'pre-cutover readiness failure'
[[ "$(<"$event_log")" == *'compose:rm -sf frontend-green backend-green'* ]]
[[ "$(<"$event_log")" != *'mark_uncertain'* ]]

status="$(run_deploy static:capture-static)"
assert_status 1 "$status" 'pre-cutover static capture failure'
[[ "$(<"$event_log")" == *'compose:rm -sf frontend-green backend-green'* ]]
[[ "$(<"$event_log")" != *'mark_uncertain'* ]]

status="$(run_deploy verify_observers)"
assert_status 1 "$status" 'pre-cutover observer failure'
[[ "$(<"$event_log")" == *$'abort_probe'* ]]
[[ "$(<"$event_log")" != *'mark_uncertain'* ]] && [[ "$(<"$event_log")" != *$'reload' ]]

status="$(run_deploy static:check-static)"
assert_status 1 "$status" 'post-cutover static check failure'
[[ "$(<"$event_log")" == *$'rollback' ]]

status="$(FILMOTT_REQUIRE_SSE_SMOKE=1 run_deploy signal_sse)"
assert_status 1 "$status" 'SSE cutover signal failure'
[[ "$(<"$event_log")" == *$'abort_probe\nabort_sse\nrollback' ]]

status="$(run_deploy drain:120)"
assert_status 1 "$status" 'availability probe drain failure'
[[ "$(<"$event_log")" == *$'abort_probe\nrollback' ]]

status="$(run_deploy finalize_upstream)"
assert_status 1 "$status" 'previous static fallback cleanup failure'
[[ "$(<"$event_log")" == *$'abort_probe\nrollback' ]]

status="$(run_deploy "commit:green:${target_sha}")"
assert_status 1 "$status" 'release state commit failure'
[[ "$(<"$event_log")" == *$'rollback' ]]
[[ "$(<"$event_log")" != *'compose:rm -sf frontend-blue backend-blue'* ]]

status="$(FAIL_RETIRED_CLEANUP=1 run_deploy)"
assert_status 1 "$status" 'post-commit retired slot cleanup failure'
[[ "$(<"$event_log")" == *$'commit:green:'* ]]
[[ "$(<"$event_log")" == *'compose:rm -sf frontend-blue backend-blue'* ]]
[[ "$(<"$event_log")" != *$'rollback' ]]
[ ! -e "$FILMOTT_UNCERTAIN_FILE" ]

status="$(run_deploy rollback)"
# rollback hook is reached only after inducing a post-cutover failure.
assert_status 0 "$status" 'rollback hook is not used on success'
status="$(run_deploy "identity:green:${target_sha} rollback")"
assert_status 1 "$status" 'rollback failure'
[[ "$(<"$event_log")" != *'compose:rm'* ]]
[ -e "$FILMOTT_UNCERTAIN_FILE" ]

# 닫힌 SSH 출력에서도 signal handler가 pre-cutover inactive만 정리한다.
: > "$event_log"
rm -f "$FILMOTT_UNCERTAIN_FILE"
BLUE_GREEN_INACTIVE_SLOT=green
BLUE_GREEN_INACTIVE_STARTED=1
BLUE_GREEN_CUTOVER_STARTED=0
BLUE_GREEN_COMMITTED=0
set +e
(blue_green_on_signal 143 TERM) 2>&1 | true
pipeline_status=("${PIPESTATUS[@]}")
set -e
assert_status 143 "${pipeline_status[0]}" 'closed output signal recovery'
assert_events 'compose:rm -sf frontend-green backend-green' 'closed output signal recovery'

# release commit 이후 signal은 검증된 routing을 rollback하거나 추가 lifecycle을 실행하지 않는다.
: > "$event_log"
BLUE_GREEN_INACTIVE_SLOT=green
BLUE_GREEN_INACTIVE_STARTED=1
BLUE_GREEN_CUTOVER_STARTED=1
BLUE_GREEN_COMMITTED=1
set +e
(blue_green_on_signal 143 TERM) 2>&1 | true
pipeline_status=("${PIPESTATUS[@]}")
set -e
assert_status 143 "${pipeline_status[0]}" 'committed cleanup signal handling'
assert_events '' 'committed cleanup signal handling'

set +e
direct_output="$(bash "${repo_root}/scripts/deploy-blue-green.sh" 2>&1)"
status=$?
set -e
assert_status 64 "$status" 'direct execution guard'
[[ "$direct_output" == *'Usage: deploy-blue-green.sh deploy <40-character SHA>'* ]]

# manual cutover는 stale/no-op을 성공으로 취급하지 않고 최종 active SHA까지 확인한다.
run_main_contract() (
  local strict="$1"
  local origin_sha="$2"
  local initial_active_sha="$3"
  local final_active_sha="$4"
  local expected_status="$5"
  local expected_events="$6"
  local actual_status
  local actual_events

  # shellcheck source=scripts/deploy-blue-green.sh
  source "${repo_root}/scripts/deploy-blue-green.sh"
  : > "$event_log"
  export FILMOTT_REQUIRE_CUTOVER="$strict"
  export FILMOTT_OPS_LOCK_FILE="${test_root}/main-contract.lock"
  blue_green_require_files() { return 0; }
  flock() { return 0; }
  git() {
    if [[ "$*" == *'rev-parse origin/main'* ]]; then
      printf '%s\n' "$origin_sha"
    elif [[ "$*" == *'reset --hard'* ]]; then
      record reset
    fi
  }
  blue_green_preflight() {
    record preflight
    BLUE_GREEN_ACTIVE_SLOT=blue
    BLUE_GREEN_ACTIVE_SHA="$initial_active_sha"
    export BLUE_GREEN_ACTIVE_SLOT BLUE_GREEN_ACTIVE_SHA
  }
  blue_green_compose() { record compose_config; }
  blue_green_deploy() { record deploy; }
  blue_green_read_release() {
    record read_release
    BLUE_GREEN_ACTIVE_SHA="$final_active_sha"
    export BLUE_GREEN_ACTIVE_SHA
  }
  set +e
  blue_green_main "$target_sha" > /dev/null 2>&1
  actual_status=$?
  set -e
  actual_events="$(<"$event_log")"
  [ "$actual_status" -eq "$expected_status" ] || {
    echo "manual main status mismatch: expected=${expected_status} actual=${actual_status}" >&2
    exit 1
  }
  [ "$actual_events" = "$expected_events" ] || {
    echo "manual main events mismatch: expected=${expected_events} actual=${actual_events}" >&2
    exit 1
  }
)

# main 경로는 disk headroom 실패 후 preflight, checkout, compose와 deploy에 도달하지 않는다.
run_low_disk_main_contract() (
  local actual_status
  local actual_events

  # shellcheck source=scripts/deploy-blue-green.sh
  source "${repo_root}/scripts/deploy-blue-green.sh"
  : > "$event_log"
  export FILMOTT_OPS_LOCK_FILE="${test_root}/main-low-disk.lock"
  blue_green_require_files() { return 0; }
  flock() { return 0; }
  git() {
    if [[ "$*" == *'rev-parse origin/main'* ]]; then
      printf '%s\n' "$target_sha"
    elif [[ "$*" == *'reset --hard'* ]]; then
      record reset
    fi
  }
  blue_green_require_disk_headroom() { record disk; return 1; }
  blue_green_preflight() { record preflight; }
  blue_green_compose() { record compose; }
  blue_green_deploy() { record deploy; }
  set +e
  blue_green_main "$target_sha" > /dev/null 2>&1
  actual_status=$?
  set -e
  actual_events="$(<"$event_log")"
  [ "$actual_status" -eq 1 ] || {
    echo "low disk main status mismatch: ${actual_status}" >&2
    exit 1
  }
  [ "$actual_events" = disk ] || {
    echo "low disk main crossed mutation boundary: ${actual_events}" >&2
    exit 1
  }
)

run_low_disk_main_contract

run_main_contract 0 "$active_sha" "$active_sha" "$active_sha" 0 ''
run_main_contract 1 "$active_sha" "$active_sha" "$active_sha" 1 ''
run_main_contract 1 "$target_sha" "$target_sha" "$target_sha" 1 'preflight'
run_main_contract 1 "$target_sha" "$active_sha" "$target_sha" 0 'preflight
reset
compose_config
deploy
read_release'
run_main_contract 1 "$target_sha" "$active_sha" "$active_sha" 1 'preflight
reset
compose_config
deploy
read_release'
rm -f "${test_root}/main-contract.lock"

echo 'Blue-green 배포 상태 전이 검증 통과'
