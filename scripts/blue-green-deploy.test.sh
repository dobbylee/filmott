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
  'server frontend-blue:3000' \
  'server backend-blue:3001'; do
  [[ "$upstream" == *"$fragment"* ]] || { echo "upstream missing: $fragment" >&2; exit 1; }
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

# slot 상태는 service label뿐 아니라 실행 image와 SHA tag까지 일치해야 한다.
blue_green_compose() {
  [ "$1" = ps ] && printf 'container-%s\n' "$3"
}
test_container_image='sha256:expected'
docker() {
  local last="${!#}"
  if [ "$1" = image ]; then
    printf 'sha256:expected\n'
  elif [[ "$*" == *'.State.Running'* ]]; then
    printf 'true\n'
  elif [[ "$*" == *'com.docker.compose.service'* ]]; then
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
blue_green_build_inactive() { record "build:$1"; }
blue_green_start_inactive() { record "start:$1"; }
blue_green_wait_inactive() { record "wait:$1"; }
git() {
  [[ "$*" == *'rev-parse origin/main'* ]] && printf '%s\n' "$target_sha"
  return 0
}
blue_green_write_upstream() { record "candidate:$2:$3"; printf candidate > "$1"; }
blue_green_test_candidate() { record test_nginx; }
blue_green_mark_uncertain() { record mark_uncertain; : > "$FILMOTT_UNCERTAIN_FILE"; }
blue_green_reload_nginx() { record reload; }
blue_green_wait_for_identity() { record "identity:$1:$2"; }
blue_green_revalidate() { record "revalidate:$1"; }
blue_green_write_release() { record "commit:$1:$2"; }
blue_green_compose() { record "compose:$*"; }
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
mark_uncertain
reload
identity:green:${target_sha}
revalidate:green
commit:green:${target_sha}
compose:stop backend-blue frontend-blue"
status="$(run_deploy)"
assert_status 0 "$status" 'successful deploy'
assert_events "$success_events" 'successful deploy'
[ ! -e "$FILMOTT_UNCERTAIN_FILE" ]

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

set +e
direct_output="$(bash "${repo_root}/scripts/deploy-blue-green.sh" 2>&1)"
status=$?
set -e
assert_status 64 "$status" 'direct execution guard'
[[ "$direct_output" == *'Usage: deploy-blue-green.sh deploy <40-character SHA>'* ]]

echo 'Blue-green 배포 상태 전이 검증 통과'
