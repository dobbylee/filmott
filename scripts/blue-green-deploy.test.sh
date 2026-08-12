#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
event_log="${test_root}/events.log"
state_file="${test_root}/active-slot"

cleanup() {
  rm -f "$event_log" "$state_file" "${test_root}"/filmott-blue-green-recovery.*
  rmdir "$test_root" 2>/dev/null || true
}
trap cleanup EXIT

# shellcheck source=scripts/deploy-blue-green.sh
source "${repo_root}/scripts/deploy-blue-green.sh"

record_hook() {
  local name="$1"
  local event="$1"
  shift

  if [ "$#" -gt 0 ]; then
    event="${event}:$*"
  fi
  printf '%s\n' "$event" >> "$event_log"

  local failure
  for failure in ${FAIL_AT:-}; do
    if [ "$failure" = "$name" ] || [ "$failure" = "$event" ]; then
      return 1
    fi
  done
  return 0
}

blue_green_verify_deploy_target() { record_hook verify "$@"; }
blue_green_snapshot_active_release() { record_hook snapshot "$@"; }
blue_green_prepare_inactive_slot() { record_hook prepare "$@"; }
blue_green_wait_for_inactive_backend() { record_hook wait_backend "$@"; }
blue_green_wait_for_inactive_frontend() { record_hook wait_frontend "$@"; }
blue_green_smoke_inactive_slot() { record_hook smoke_inactive "$@"; }
blue_green_render_candidate_upstream() { record_hook render_upstream "$@"; }
blue_green_test_candidate_upstream() { record_hook test_nginx "$@"; }
blue_green_activate_candidate_upstream() { record_hook activate_upstream "$@"; }
blue_green_reload_nginx() { record_hook reload_nginx "$@"; }
blue_green_smoke_active_slot() { record_hook smoke_active "$@"; }
blue_green_commit_active_slot() {
  record_hook commit_state "$@" || return 1
  printf '%s\n' "$1" > "$state_file"
}
blue_green_drain_previous_slot() { record_hook drain "$@"; }
blue_green_stop_previous_slot() { record_hook stop_previous "$@"; }
blue_green_restore_previous_upstream() { record_hook restore_upstream "$@"; }
blue_green_restore_previous_slot_state() {
  record_hook restore_state "$@" || return 1
  printf '%s\n' "$1" > "$state_file"
}
blue_green_smoke_previous_slot() { record_hook smoke_previous "$@"; }
blue_green_cleanup_inactive_slot() { record_hook cleanup_inactive "$@"; }

assert_status() {
  local expected="$1"
  local actual="$2"
  local context="$3"

  if [ "$actual" -ne "$expected" ]; then
    echo "${context}: expected status ${expected}, got ${actual}" >&2
    exit 1
  fi
}

assert_events() {
  local expected="$1"
  local context="$2"
  local actual

  actual="$(<"$event_log")"
  if [ "$actual" != "$expected" ]; then
    echo "${context}: unexpected event sequence" >&2
    printf '%s\n' '--- expected ---' "$expected" '--- actual ---' "$actual" >&2
    exit 1
  fi
}

run_transition() {
  local active_slot="$1"
  local failure_hook="${2:-}"
  local status

  : > "$event_log"
  printf '%s\n' "$active_slot" > "$state_file"
  export FILMOTT_ACTIVE_SLOT_FILE="$state_file"
  export FILMOTT_RECOVERY_LOG_DIR="$test_root"
  export FAIL_AT="$failure_hook"

  set +e
  blue_green_run
  status=$?
  set -e
  printf '%s\n' "$status"
}

success_blue_expected='verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
wait_frontend:green
smoke_inactive:green
render_upstream:green blue
test_nginx:green
activate_upstream:green blue
reload_nginx:green
smoke_active:green
commit_state:green blue
drain:blue
stop_previous:blue'

status="$(run_transition blue)"
assert_status 0 "$status" 'blue to green transition'
assert_events "$success_blue_expected" 'blue to green transition'
if [ "$(<"$state_file")" != green ]; then
  echo 'blue to green transition did not commit green state' >&2
  exit 1
fi

success_green_expected="${success_blue_expected//blue/__blue__}"
success_green_expected="${success_green_expected//green/blue}"
success_green_expected="${success_green_expected//__blue__/green}"
status="$(run_transition green)"
assert_status 0 "$status" 'green to blue transition'
assert_events "$success_green_expected" 'green to blue transition'

status="$(run_transition blue wait_backend)"
assert_status 1 "$status" 'pre-cutover health failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
cleanup_inactive:green' 'pre-cutover health failure'

status="$(run_transition blue prepare)"
assert_status 1 "$status" 'partial inactive preparation failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
cleanup_inactive:green' 'partial inactive preparation failure'

status="$(run_transition blue test_nginx)"
assert_status 1 "$status" 'nginx validation failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
wait_frontend:green
smoke_inactive:green
render_upstream:green blue
test_nginx:green
cleanup_inactive:green' 'nginx validation failure'

status="$(run_transition blue smoke_active)"
assert_status 1 "$status" 'post-cutover smoke failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
wait_frontend:green
smoke_inactive:green
render_upstream:green blue
test_nginx:green
activate_upstream:green blue
reload_nginx:green
smoke_active:green
restore_upstream:blue green
reload_nginx:blue
smoke_previous:blue
restore_state:blue green
cleanup_inactive:green' 'post-cutover smoke failure'

status="$(run_transition blue reload_nginx:green)"
assert_status 1 "$status" 'nginx reload failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
wait_frontend:green
smoke_inactive:green
render_upstream:green blue
test_nginx:green
activate_upstream:green blue
reload_nginx:green
restore_upstream:blue green
reload_nginx:blue
smoke_previous:blue
restore_state:blue green
cleanup_inactive:green' 'nginx reload failure'

status="$(run_transition blue 'smoke_active restore_upstream')"
assert_status 1 "$status" 'rollback upstream restoration failure'
assert_events 'verify:blue
snapshot:blue
prepare:green blue
wait_backend:green
wait_frontend:green
smoke_inactive:green
render_upstream:green blue
test_nginx:green
activate_upstream:green blue
reload_nginx:green
smoke_active:green
restore_upstream:blue green' 'rollback upstream restoration failure'

status="$(run_transition blue verify)"
assert_status 1 "$status" 'stale target failure'
assert_events 'verify:blue' 'stale target failure'

: > "$event_log"
printf '%s\n' invalid > "$state_file"
export FILMOTT_ACTIVE_SLOT_FILE="$state_file"
set +e
blue_green_run > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'invalid active slot'
assert_events '' 'invalid active slot'

: > "$event_log"
printf 'blue\ngreen\n' > "$state_file"
set +e
blue_green_run > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'multi-line active slot'
assert_events '' 'multi-line active slot'

: > "$event_log"
printf 'blue\0' > "$state_file"
set +e
blue_green_run > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'NUL active slot'
assert_events '' 'NUL active slot'

: > "$event_log"
rm -f "$state_file"
set +e
blue_green_run > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'missing active slot'
assert_events '' 'missing active slot'

: > "$event_log"
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=0
  BLUE_GREEN_STATE_COMMITTED=0
  blue_green_recover_and_exit 143 TERM
) > /dev/null 2>&1
status=$?
set -e
assert_status 143 "$status" 'pre-cutover signal recovery'
assert_events 'cleanup_inactive:green' 'pre-cutover signal recovery'

: > "$event_log"
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=0
  BLUE_GREEN_STATE_COMMITTED=0
  blue_green_recover_and_exit 130 INT
) > /dev/null 2>&1
status=$?
set -e
assert_status 130 "$status" 'pre-cutover INT recovery'
assert_events 'cleanup_inactive:green' 'pre-cutover INT recovery'

: > "$event_log"
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=1
  BLUE_GREEN_STATE_COMMITTED=0
  blue_green_recover_and_exit 129 HUP
) > /dev/null 2>&1
status=$?
set -e
assert_status 129 "$status" 'post-cutover signal recovery'
assert_events 'restore_upstream:blue green
reload_nginx:blue
smoke_previous:blue
restore_state:blue green
cleanup_inactive:green' 'post-cutover signal recovery'

: > "$event_log"
printf '%s\n' green > "$state_file"
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=1
  BLUE_GREEN_STATE_COMMITTED=1
  blue_green_recover_and_exit 143 TERM
) > /dev/null 2>&1
status=$?
set -e
assert_status 143 "$status" 'drain signal recovery'
assert_events '' 'drain signal recovery'
if [ "$(<"$state_file")" != green ]; then
  echo 'drain signal recovery changed the committed active slot' >&2
  exit 1
fi

: > "$event_log"
export FAIL_AT='restore_upstream'
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=1
  BLUE_GREEN_STATE_COMMITTED=0
  blue_green_recover_and_exit 143 TERM
) > /dev/null 2>&1
status=$?
set -e
assert_status 143 "$status" 'signal rollback failure'
assert_events 'restore_upstream:blue green' 'signal rollback failure'

: > "$event_log"
export FAIL_AT=''
set +e
(
  BLUE_GREEN_ACTIVE_SLOT=blue
  BLUE_GREEN_INACTIVE_SLOT=green
  BLUE_GREEN_INACTIVE_PREPARED=1
  BLUE_GREEN_CUTOVER_STARTED=0
  BLUE_GREEN_STATE_COMMITTED=0
  blue_green_recover_and_exit 143 TERM
) 2>&1 | true
pipeline_status=("${PIPESTATUS[@]}")
set -e
assert_status 143 "${pipeline_status[0]}" 'closed output signal recovery'
assert_events 'cleanup_inactive:green' 'closed output signal recovery'

set +e
direct_output="$(bash "${repo_root}/scripts/deploy-blue-green.sh" 2>&1)"
status=$?
set -e
assert_status 64 "$status" 'direct production execution guard'
if [[ "$direct_output" != *'Blue-green production deployment is not enabled until Phase 2.'* ]]; then
  echo 'Phase 1 direct execution guard message is missing' >&2
  exit 1
fi

echo 'Blue-green 배포 상태 전이 검증 통과'
