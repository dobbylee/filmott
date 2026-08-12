#!/usr/bin/env bash

set -Eeuo pipefail

blue_green_error() {
  echo "$1" >&2
}

blue_green_read_active_slot() {
  local state_file="${FILMOTT_ACTIVE_SLOT_FILE:?FILMOTT_ACTIVE_SLOT_FILE is required}"

  if [ ! -r "$state_file" ]; then
    blue_green_error "Active slot state is missing: ${state_file}"
    return 1
  fi

  if cmp -s "$state_file" <(printf 'blue\n'); then
    printf '%s\n' blue
  elif cmp -s "$state_file" <(printf 'green\n'); then
    printf '%s\n' green
  else
    blue_green_error "Invalid active slot state: ${state_file}"
    return 1
  fi
}

blue_green_inactive_slot() {
  case "$1" in
    blue)
      printf '%s\n' green
      ;;
    green)
      printf '%s\n' blue
      ;;
    *)
      blue_green_error "Cannot select inactive slot from: $1"
      return 1
      ;;
  esac
}

blue_green_unimplemented_hook() {
  blue_green_error "Blue-green production hook is not implemented yet: $1"
  return 64
}

blue_green_verify_deploy_target() {
  blue_green_unimplemented_hook blue_green_verify_deploy_target
}

blue_green_snapshot_active_release() {
  blue_green_unimplemented_hook blue_green_snapshot_active_release
}

blue_green_prepare_inactive_slot() {
  blue_green_unimplemented_hook blue_green_prepare_inactive_slot
}

blue_green_wait_for_inactive_backend() {
  blue_green_unimplemented_hook blue_green_wait_for_inactive_backend
}

blue_green_wait_for_inactive_frontend() {
  blue_green_unimplemented_hook blue_green_wait_for_inactive_frontend
}

blue_green_smoke_inactive_slot() {
  blue_green_unimplemented_hook blue_green_smoke_inactive_slot
}

blue_green_render_candidate_upstream() {
  blue_green_unimplemented_hook blue_green_render_candidate_upstream
}

blue_green_test_candidate_upstream() {
  blue_green_unimplemented_hook blue_green_test_candidate_upstream
}

blue_green_activate_candidate_upstream() {
  blue_green_unimplemented_hook blue_green_activate_candidate_upstream
}

blue_green_reload_nginx() {
  blue_green_unimplemented_hook blue_green_reload_nginx
}

blue_green_smoke_active_slot() {
  blue_green_unimplemented_hook blue_green_smoke_active_slot
}

blue_green_commit_active_slot() {
  blue_green_unimplemented_hook blue_green_commit_active_slot
}

blue_green_drain_previous_slot() {
  blue_green_unimplemented_hook blue_green_drain_previous_slot
}

blue_green_stop_previous_slot() {
  blue_green_unimplemented_hook blue_green_stop_previous_slot
}

blue_green_restore_previous_upstream() {
  blue_green_unimplemented_hook blue_green_restore_previous_upstream
}

blue_green_restore_previous_slot_state() {
  blue_green_unimplemented_hook blue_green_restore_previous_slot_state
}

blue_green_smoke_previous_slot() {
  blue_green_unimplemented_hook blue_green_smoke_previous_slot
}

blue_green_cleanup_inactive_slot() {
  blue_green_unimplemented_hook blue_green_cleanup_inactive_slot
}

blue_green_recover_and_exit() {
  local status="$1"
  local reason="$2"
  local recovery_log=""
  local rollback_succeeded=0

  trap - ERR HUP INT TERM
  set +e
  trap '' PIPE
  recovery_log="$(mktemp "${FILMOTT_RECOVERY_LOG_DIR:-/tmp}/filmott-blue-green-recovery.XXXXXX" 2>/dev/null || true)"
  if [ -n "$recovery_log" ]; then
    exec >> "$recovery_log" 2>&1
  fi
  blue_green_error "Blue-green deploy interrupted by ${reason}"

  if [ "${BLUE_GREEN_STATE_COMMITTED:-0}" = "1" ]; then
    blue_green_error 'New active slot is already committed; preserving both slots'
    exit "$status"
  fi

  if [ "${BLUE_GREEN_CUTOVER_STARTED:-0}" = "1" ]; then
    if blue_green_restore_previous_upstream \
      "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_INACTIVE_SLOT" &&
      blue_green_reload_nginx "$BLUE_GREEN_ACTIVE_SLOT" &&
      blue_green_smoke_previous_slot "$BLUE_GREEN_ACTIVE_SLOT" &&
      blue_green_restore_previous_slot_state \
        "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_INACTIVE_SLOT"; then
      rollback_succeeded=1
    else
      blue_green_error 'Blue-green automatic rollback failed; preserving both slots'
    fi
  fi

  if [ "${BLUE_GREEN_INACTIVE_PREPARED:-0}" = "1" ] &&
    { [ "${BLUE_GREEN_CUTOVER_STARTED:-0}" = "0" ] || [ "$rollback_succeeded" = "1" ]; }; then
    blue_green_cleanup_inactive_slot "$BLUE_GREEN_INACTIVE_SLOT"
  fi

  exit "$status"
}

blue_green_fail_before_cutover() {
  local message="$1"

  blue_green_error "$message"
  if [ "${BLUE_GREEN_INACTIVE_PREPARED:-0}" = "1" ]; then
    blue_green_cleanup_inactive_slot "$BLUE_GREEN_INACTIVE_SLOT" || true
  fi
  return 1
}

blue_green_fail_after_cutover() {
  local message="$1"

  blue_green_error "$message"
  if blue_green_restore_previous_upstream \
    "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_INACTIVE_SLOT" &&
    blue_green_reload_nginx "$BLUE_GREEN_ACTIVE_SLOT" &&
    blue_green_smoke_previous_slot "$BLUE_GREEN_ACTIVE_SLOT" &&
    blue_green_restore_previous_slot_state \
      "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_cleanup_inactive_slot "$BLUE_GREEN_INACTIVE_SLOT" || true
  else
    blue_green_error 'Blue-green automatic rollback failed; preserving both slots'
  fi
  return 1
}

blue_green_run() (
  set -Eeuo pipefail

  BLUE_GREEN_ACTIVE_SLOT="$(blue_green_read_active_slot)"
  BLUE_GREEN_INACTIVE_SLOT="$(blue_green_inactive_slot "$BLUE_GREEN_ACTIVE_SLOT")"
  BLUE_GREEN_INACTIVE_PREPARED=0
  BLUE_GREEN_CUTOVER_STARTED=0
  BLUE_GREEN_STATE_COMMITTED=0

  trap 'blue_green_recover_and_exit 129 HUP' HUP
  trap 'blue_green_recover_and_exit 130 INT' INT
  trap 'blue_green_recover_and_exit 143 TERM' TERM

  if ! blue_green_verify_deploy_target "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_error 'Deploy target verification failed before inactive slot preparation'
    exit 1
  fi
  if ! blue_green_snapshot_active_release "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_error 'Cannot snapshot active release'
    exit 1
  fi
  BLUE_GREEN_INACTIVE_PREPARED=1
  if ! blue_green_prepare_inactive_slot \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Inactive slot preparation failed'
    exit 1
  fi

  if ! blue_green_wait_for_inactive_backend "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Inactive backend is not ready'
    exit 1
  fi
  if ! blue_green_wait_for_inactive_frontend "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Inactive frontend is not ready'
    exit 1
  fi
  if ! blue_green_smoke_inactive_slot "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Inactive slot smoke failed'
    exit 1
  fi
  if ! blue_green_render_candidate_upstream \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Candidate upstream rendering failed'
    exit 1
  fi
  if ! blue_green_test_candidate_upstream "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_before_cutover 'Candidate nginx configuration is invalid'
    exit 1
  fi

  BLUE_GREEN_CUTOVER_STARTED=1
  if ! blue_green_activate_candidate_upstream \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_fail_after_cutover 'Upstream activation failed'
    exit 1
  fi
  if ! blue_green_reload_nginx "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_after_cutover 'Nginx graceful reload failed'
    exit 1
  fi
  if ! blue_green_smoke_active_slot "$BLUE_GREEN_INACTIVE_SLOT"; then
    blue_green_fail_after_cutover 'Post-cutover smoke failed'
    exit 1
  fi
  if ! blue_green_commit_active_slot \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SLOT"; then
    blue_green_fail_after_cutover 'Active slot state commit failed'
    exit 1
  fi
  BLUE_GREEN_STATE_COMMITTED=1

  blue_green_drain_previous_slot "$BLUE_GREEN_ACTIVE_SLOT"
  blue_green_stop_previous_slot "$BLUE_GREEN_ACTIVE_SLOT"
)

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  blue_green_error 'Blue-green production deployment is not enabled until Phase 2.'
  exit 64
fi
