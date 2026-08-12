#!/usr/bin/env bash

set -Eeuo pipefail

FILMOTT_REPO_ROOT="${FILMOTT_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FILMOTT_DEPLOY_STATE_DIR="${FILMOTT_DEPLOY_STATE_DIR:-${FILMOTT_REPO_ROOT}/.deploy-state}"
FILMOTT_BOOTSTRAP_FILE="${FILMOTT_BOOTSTRAP_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-state}"
FILMOTT_RELEASE_FILE="${FILMOTT_RELEASE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/active-release}"
FILMOTT_UPSTREAM_FILE="${FILMOTT_UPSTREAM_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/nginx/upstreams.conf}"
FILMOTT_CANDIDATE_FILE="${FILMOTT_CANDIDATE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/nginx/candidate.conf}"
FILMOTT_STATIC_ASSET_FILE="${FILMOTT_STATIC_ASSET_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/previous-static-assets}"
FILMOTT_LEGACY_NGINX_FILE="${FILMOTT_LEGACY_NGINX_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/legacy-nginx.conf}"
FILMOTT_LEGACY_OVERRIDE_FILE="${FILMOTT_LEGACY_OVERRIDE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/legacy-nginx.override.yml}"
FILMOTT_BOOTSTRAP_COMPOSE_FILE="${FILMOTT_BOOTSTRAP_COMPOSE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-docker-compose.prod.yml}"
FILMOTT_BOOTSTRAP_NGINX_FILE="${FILMOTT_BOOTSTRAP_NGINX_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-nginx.conf}"
FILMOTT_BOOTSTRAP_SECURITY_FILE="${FILMOTT_BOOTSTRAP_SECURITY_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-security-headers.conf}"
FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT="${FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-deploy-blue-green.sh}"
FILMOTT_BOOTSTRAP_SMOKE_SCRIPT="${FILMOTT_BOOTSTRAP_SMOKE_SCRIPT:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-blue-green-smoke.sh}"
FILMOTT_MAINTENANCE_PROBE_LOG="${FILMOTT_MAINTENANCE_PROBE_LOG:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-maintenance-probe.log}"
FILMOTT_MAINTENANCE_PROBE_READY="${FILMOTT_MAINTENANCE_PROBE_READY:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-maintenance-probe.ready}"
FILMOTT_MAINTENANCE_PROBE_STOP="${FILMOTT_MAINTENANCE_PROBE_STOP:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-maintenance-probe.stop}"
FILMOTT_MAINTENANCE_PROBE_FAILED="${FILMOTT_MAINTENANCE_PROBE_FAILED:-${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-maintenance-probe.failed}"

BOOTSTRAP_PROBE_PID=''
BOOTSTRAP_NGINX_CHANGED=0
BOOTSTRAP_PREPARE_STARTED=0
BOOTSTRAP_OPERATION=''
BOOTSTRAP_OPERATION_COMPLETED=0
BOOTSTRAP_RECOVERY_STARTED=0

bootstrap_error() {
  echo "$1" >&2
}

bootstrap_validate_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

bootstrap_validate_container_id() {
  [[ "$1" =~ ^[0-9a-f]{64}$ ]]
}

bootstrap_compose() {
  (
    cd "$FILMOTT_REPO_ROOT" || exit 1
    docker compose --env-file .env -f docker-compose.prod.yml "$@"
  )
}

bootstrap_legacy_compose() {
  (
    cd "$FILMOTT_REPO_ROOT" || exit 1
    docker compose --env-file .env -f docker-compose.prod.yml \
      -f "$FILMOTT_LEGACY_OVERRIDE_FILE" "$@"
  )
}

bootstrap_target_compose() {
  (
    cd "$FILMOTT_REPO_ROOT" || exit 1
    docker compose --project-directory "$FILMOTT_REPO_ROOT" \
      --env-file "${FILMOTT_REPO_ROOT}/.env" -f "$FILMOTT_BOOTSTRAP_COMPOSE_FILE" "$@"
  )
}

bootstrap_origin_status() {
  local host="$1"
  local path="$2"

  curl -sS --connect-timeout 5 --max-time 15 \
    --resolve "${host}:443:127.0.0.1" -o /dev/null -w '%{http_code}' \
    "https://${host}${path}"
}

bootstrap_wait_legacy_origin() {
  local attempt

  for attempt in $(seq 1 24); do
    if [ "$(bootstrap_origin_status filmott.kr / 2>/dev/null || true)" = 200 ] &&
      [ "$(bootstrap_origin_status filmott.kr /api/ 2>/dev/null || true)" = 200 ] &&
      [ "$(bootstrap_origin_status www.filmott.kr / 2>/dev/null || true)" = 301 ]; then
      return 0
    fi
    [ "$attempt" -eq 24 ] || sleep 5
  done
  return 1
}

bootstrap_require_files() {
  local variable

  [ -f "${FILMOTT_REPO_ROOT}/.env" ] &&
    [ -f "${FILMOTT_REPO_ROOT}/backend/.env.production" ] || return 1
  for variable in DB_NAME DB_USERNAME DB_PASSWORD REVALIDATE_SECRET; do
    grep -q "^${variable}=" "${FILMOTT_REPO_ROOT}/.env" || return 1
  done
}

bootstrap_check_host() {
  local backup_dir="${BACKUP_DIR:-/home/ubuntu/backups}"
  local backup
  local memory_kb
  local disk_kb

  backup="$(find "$backup_dir" -maxdepth 1 -type f -name 'backup_*.dump' -print | sort | tail -1)"
  [ -n "$backup" ] && [ -f "${backup}.sha256" ] || return 1
  sha256sum --check "${backup}.sha256" || return 1
  [ $(( $(date +%s) - $(stat -c %Y "$backup") )) -le 172800 ] || return 1
  memory_kb="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)"
  disk_kb="$(df -Pk "$FILMOTT_REPO_ROOT" | awk 'NR == 2 { print $4 }')"
  [[ "$memory_kb" =~ ^[0-9]+$ ]] && [ "$memory_kb" -ge 4194304 ] || return 1
  [[ "$disk_kb" =~ ^[0-9]+$ ]] && [ "$disk_kb" -ge 10485760 ] || return 1
  printf 'Preflight: backup=%s memory_available_kb=%s disk_available_kb=%s\n' \
    "$backup" "$memory_kb" "$disk_kb"
}

bootstrap_running_container() {
  local service="$1"
  local container

  container="$(bootstrap_compose ps -q "$service")" || return 1
  bootstrap_validate_container_id "$container" || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || return 1
  [ "$(docker inspect -f '{{index .Config.Labels \"com.docker.compose.service\"}}' "$container")" = "$service" ] || return 1
  printf '%s\n' "$container"
}

bootstrap_write_state() {
  local phase="$1"
  local temporary="${FILMOTT_BOOTSTRAP_FILE}.tmp"

  [[ "$phase" =~ ^(prepared|cutover)$ ]] || return 1
  bootstrap_validate_sha "$BOOTSTRAP_TARGET_SHA" || return 1
  bootstrap_validate_sha "$BOOTSTRAP_ACTIVE_SHA" || return 1
  bootstrap_validate_container_id "$BOOTSTRAP_LEGACY_FRONTEND" || return 1
  bootstrap_validate_container_id "$BOOTSTRAP_LEGACY_BACKEND" || return 1
  bootstrap_validate_container_id "$BOOTSTRAP_POSTGRES" || return 1
  mkdir -p "$(dirname "$FILMOTT_BOOTSTRAP_FILE")" || return 1
  printf 'phase=%s\ntarget=%s\nactive=%s\nlegacy_frontend=%s\nlegacy_backend=%s\npostgres=%s\n' \
    "$phase" "$BOOTSTRAP_TARGET_SHA" "$BOOTSTRAP_ACTIVE_SHA" \
    "$BOOTSTRAP_LEGACY_FRONTEND" "$BOOTSTRAP_LEGACY_BACKEND" \
    "$BOOTSTRAP_POSTGRES" > "$temporary" || return 1
  mv "$temporary" "$FILMOTT_BOOTSTRAP_FILE"
}

bootstrap_read_state() {
  local expected

  [ -r "$FILMOTT_BOOTSTRAP_FILE" ] || return 1
  BOOTSTRAP_PHASE="$(sed -n '1s/^phase=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  BOOTSTRAP_TARGET_SHA="$(sed -n '2s/^target=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  BOOTSTRAP_ACTIVE_SHA="$(sed -n '3s/^active=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  BOOTSTRAP_LEGACY_FRONTEND="$(sed -n '4s/^legacy_frontend=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  BOOTSTRAP_LEGACY_BACKEND="$(sed -n '5s/^legacy_backend=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  BOOTSTRAP_POSTGRES="$(sed -n '6s/^postgres=//p' "$FILMOTT_BOOTSTRAP_FILE")"
  expected="$(mktemp "${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-check.XXXXXX")" || return 1
  FILMOTT_BOOTSTRAP_FILE="$expected" bootstrap_write_state "$BOOTSTRAP_PHASE" || {
    rm -f "$expected"
    return 1
  }
  cmp -s "$expected" "$FILMOTT_BOOTSTRAP_FILE" || {
    rm -f "$expected"
    return 1
  }
  rm -f "$expected"
  export BOOTSTRAP_PHASE BOOTSTRAP_TARGET_SHA BOOTSTRAP_ACTIVE_SHA \
    BOOTSTRAP_LEGACY_FRONTEND BOOTSTRAP_LEGACY_BACKEND BOOTSTRAP_POSTGRES
}

bootstrap_refresh_target() {
  local expected="$1"

  git -C "$FILMOTT_REPO_ROOT" fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main || return 1
  [ "$(git -C "$FILMOTT_REPO_ROOT" rev-parse origin/main)" = "$expected" ] || return 1
}

bootstrap_source_deploy() {
  FILMOTT_COMPOSE_FILE="$FILMOTT_BOOTSTRAP_COMPOSE_FILE"
  FILMOTT_NGINX_CONFIG_FILE="$FILMOTT_BOOTSTRAP_NGINX_FILE"
  FILMOTT_SECURITY_HEADERS_FILE="$FILMOTT_BOOTSTRAP_SECURITY_FILE"
  FILMOTT_SMOKE_SCRIPT="$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT"
  export FILMOTT_COMPOSE_FILE FILMOTT_NGINX_CONFIG_FILE \
    FILMOTT_SECURITY_HEADERS_FILE FILMOTT_SMOKE_SCRIPT
  # shellcheck source=deploy-blue-green.sh
  source "$FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT"
}

bootstrap_extract_target_file() {
  local sha="$1"
  local repository_path="$2"
  local destination="$3"
  local temporary="${destination}.tmp"

  git -C "$FILMOTT_REPO_ROOT" show "${sha}:${repository_path}" > "$temporary" || return 1
  mv "$temporary" "$destination" || return 1
}

bootstrap_extract_target_files() {
  local sha="$1"

  bootstrap_extract_target_file "$sha" docker-compose.prod.yml "$FILMOTT_BOOTSTRAP_COMPOSE_FILE" || return 1
  bootstrap_extract_target_file "$sha" nginx/nginx.conf "$FILMOTT_BOOTSTRAP_NGINX_FILE" || return 1
  bootstrap_extract_target_file "$sha" nginx/security-headers.conf "$FILMOTT_BOOTSTRAP_SECURITY_FILE" || return 1
  bootstrap_extract_target_file "$sha" scripts/deploy-blue-green.sh "$FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT" || return 1
  bootstrap_extract_target_file "$sha" scripts/blue-green-smoke.sh "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT" || return 1
}

bootstrap_verify_target_file() {
  local sha="$1"
  local repository_path="$2"
  local saved_file="$3"
  local expected

  expected="$(mktemp "${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-target-check.XXXXXX")" || return 1
  git -C "$FILMOTT_REPO_ROOT" show "${sha}:${repository_path}" > "$expected" || {
    rm -f "$expected"
    return 1
  }
  cmp -s "$expected" "$saved_file" || {
    rm -f "$expected"
    return 1
  }
  rm -f "$expected" || return 1
}

bootstrap_verify_target_files() {
  local sha="$1"

  bootstrap_verify_target_file "$sha" docker-compose.prod.yml "$FILMOTT_BOOTSTRAP_COMPOSE_FILE" || return 1
  bootstrap_verify_target_file "$sha" nginx/nginx.conf "$FILMOTT_BOOTSTRAP_NGINX_FILE" || return 1
  bootstrap_verify_target_file "$sha" nginx/security-headers.conf "$FILMOTT_BOOTSTRAP_SECURITY_FILE" || return 1
  bootstrap_verify_target_file "$sha" scripts/deploy-blue-green.sh "$FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT" || return 1
  bootstrap_verify_target_file "$sha" scripts/blue-green-smoke.sh "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT" || return 1
}

bootstrap_validate_prepared_files() {
  local expected

  [ -r "$FILMOTT_LEGACY_NGINX_FILE" ] && [ -r "$FILMOTT_LEGACY_OVERRIDE_FILE" ] || return 1
  expected="$(mktemp "${FILMOTT_DEPLOY_STATE_DIR}/bootstrap-upstream.XXXXXX")" || return 1
  blue_green_write_upstream "$expected" blue "$BOOTSTRAP_ACTIVE_SHA" blue || {
    rm -f "$expected"
    return 1
  }
  cmp -s "$expected" "$FILMOTT_CANDIDATE_FILE" &&
    cmp -s "$expected" "$FILMOTT_UPSTREAM_FILE" || {
      rm -f "$expected"
      return 1
    }
  rm -f "$expected"
  bootstrap_legacy_compose config > /dev/null
}

bootstrap_prepare_cleanup() {
  local active_sha="$1"

  set +e
  [ ! -r "$FILMOTT_BOOTSTRAP_COMPOSE_FILE" ] ||
    bootstrap_target_compose rm -sf frontend-blue backend-blue
  git -C "$FILMOTT_REPO_ROOT" reset --hard "$active_sha"
  rm -f "$FILMOTT_BOOTSTRAP_FILE" "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_CANDIDATE_FILE" \
    "$FILMOTT_STATIC_ASSET_FILE" "$FILMOTT_LEGACY_NGINX_FILE" \
    "$FILMOTT_LEGACY_OVERRIDE_FILE" "$FILMOTT_BOOTSTRAP_COMPOSE_FILE" \
    "$FILMOTT_BOOTSTRAP_NGINX_FILE" "$FILMOTT_BOOTSTRAP_SECURITY_FILE" \
    "$FILMOTT_BOOTSTRAP_DEPLOY_SCRIPT" "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT"
}

bootstrap_prepare_run() {
  local target_sha="$1"
  local active_sha="$2"
  local app
  local container
  local image

  bootstrap_validate_sha "$target_sha" && bootstrap_validate_sha "$active_sha" || return 1
  [ "$target_sha" != "$active_sha" ] || return 1
  [ ! -e "$FILMOTT_BOOTSTRAP_FILE" ] && [ ! -e "$FILMOTT_RELEASE_FILE" ] || return 1
  bootstrap_refresh_target "$target_sha" || return 1
  [ "$(git -C "$FILMOTT_REPO_ROOT" rev-parse HEAD)" = "$active_sha" ] || return 1
  [ -z "$(git -C "$FILMOTT_REPO_ROOT" status --porcelain --untracked-files=no)" ] || return 1
  bootstrap_check_host || return 1
  BOOTSTRAP_TARGET_SHA="$target_sha"
  BOOTSTRAP_ACTIVE_SHA="$active_sha"
  BOOTSTRAP_LEGACY_FRONTEND="$(bootstrap_running_container frontend)" || return 1
  BOOTSTRAP_LEGACY_BACKEND="$(bootstrap_running_container backend)" || return 1
  BOOTSTRAP_POSTGRES="$(bootstrap_running_container postgres)" || return 1
  export BOOTSTRAP_TARGET_SHA BOOTSTRAP_ACTIVE_SHA BOOTSTRAP_LEGACY_FRONTEND \
    BOOTSTRAP_LEGACY_BACKEND BOOTSTRAP_POSTGRES
  BOOTSTRAP_PREPARE_STARTED=1
  mkdir -p "$FILMOTT_DEPLOY_STATE_DIR/nginx" || return 1
  git -C "$FILMOTT_REPO_ROOT" show "${active_sha}:nginx/nginx.conf" > "$FILMOTT_LEGACY_NGINX_FILE" || return 1
  printf 'services:\n  nginx:\n    volumes:\n      - %s:/etc/nginx/conf.d/default.conf:ro\n' \
    "$FILMOTT_LEGACY_NGINX_FILE" > "$FILMOTT_LEGACY_OVERRIDE_FILE" || return 1
  for app in frontend backend; do
    [ "$app" = frontend ] && container="$BOOTSTRAP_LEGACY_FRONTEND" || container="$BOOTSTRAP_LEGACY_BACKEND"
    image="$(docker inspect -f '{{.Image}}' "$container")" || return 1
    docker image tag "$image" "filmott-${app}:blue" || return 1
    docker image tag "$image" "filmott-${app}:${active_sha}" || return 1
    docker image tag "$image" "filmott-${app}:bootstrap-rollback" || return 1
  done
  bootstrap_extract_target_files "$target_sha" || return 1
  bootstrap_source_deploy || return 1
  blue_green_write_upstream "$FILMOTT_CANDIDATE_FILE" blue "$active_sha" blue || return 1
  cp "$FILMOTT_CANDIDATE_FILE" "$FILMOTT_UPSTREAM_FILE" || return 1
  blue_green_compose up -d --no-deps --force-recreate frontend-blue backend-blue || return 1
  BLUE_GREEN_TARGET_SHA="$active_sha"
  export BLUE_GREEN_TARGET_SHA
  blue_green_wait_inactive blue || return 1
  blue_green_test_candidate || return 1
  blue_green_static_smoke capture-static || return 1
  bootstrap_legacy_compose config > /dev/null || return 1
  bootstrap_refresh_target "$target_sha" || return 1
  [ "$(git -C "$FILMOTT_REPO_ROOT" rev-parse HEAD)" = "$active_sha" ] || return 1
  bootstrap_verify_target_files "$target_sha" || return 1
  bootstrap_write_state prepared || return 1
  BOOTSTRAP_PREPARE_STARTED=0
  printf 'Bootstrap prepared: active=%s target=%s\n' "$active_sha" "$target_sha"
}

bootstrap_prepare() {
  local target_sha="$1"
  local active_sha="$2"

  BOOTSTRAP_PREPARE_STARTED=0
  if bootstrap_prepare_run "$target_sha" "$active_sha"; then
    return 0
  fi
  BOOTSTRAP_RECOVERY_STARTED=1
  [ "$BOOTSTRAP_PREPARE_STARTED" -eq 0 ] || bootstrap_prepare_cleanup "$active_sha"
  return 1
}

bootstrap_start_maintenance_probe() {
  rm -f "$FILMOTT_MAINTENANCE_PROBE_LOG" "$FILMOTT_MAINTENANCE_PROBE_READY" \
    "$FILMOTT_MAINTENANCE_PROBE_STOP" "$FILMOTT_MAINTENANCE_PROBE_FAILED" || return 1
  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    FILMOTT_SMOKE_MAX_TIME=5 \
    FILMOTT_SMOKE_READY_FILE="$FILMOTT_MAINTENANCE_PROBE_READY" \
    FILMOTT_SMOKE_STOP_FILE="$FILMOTT_MAINTENANCE_PROBE_STOP" \
    FILMOTT_SMOKE_FAILURE_FILE="$FILMOTT_MAINTENANCE_PROBE_FAILED" \
    bash "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT" probe 180 https://filmott.kr \
    > "$FILMOTT_MAINTENANCE_PROBE_LOG" 2>&1 &
  BOOTSTRAP_PROBE_PID=$!
  export BOOTSTRAP_PROBE_PID
  for _ in $(seq 1 30); do
    [ -e "$FILMOTT_MAINTENANCE_PROBE_READY" ] && return 0
    kill -0 "$BOOTSTRAP_PROBE_PID" 2>/dev/null || return 1
    sleep 1
  done
  return 1
}

bootstrap_finish_maintenance_probe() {
  local status=0

  [ -n "$BOOTSTRAP_PROBE_PID" ] || return 0
  : > "$FILMOTT_MAINTENANCE_PROBE_STOP" || true
  wait "$BOOTSTRAP_PROBE_PID" || status=$?
  BOOTSTRAP_PROBE_PID=''
  cat "$FILMOTT_MAINTENANCE_PROBE_LOG" || true
  if [ "$status" -ne 0 ] || [ -e "$FILMOTT_MAINTENANCE_PROBE_FAILED" ]; then
    bootstrap_error 'Maintenance probe observed an interruption during the approved nginx recreate'
  fi
}

bootstrap_rollback() {
  bootstrap_read_state || return 1
  if [ -e "$FILMOTT_RELEASE_FILE" ]; then
    bootstrap_source_deploy || return 1
    blue_green_read_release || return 1
    [ "$BLUE_GREEN_ACTIVE_SLOT" = blue ] &&
      [ "$BLUE_GREEN_ACTIVE_SHA" = "$BOOTSTRAP_ACTIVE_SHA" ] || {
        bootstrap_error 'Bootstrap rollback is no longer valid for the active release'
        return 1
      }
  else
    [ "$BOOTSTRAP_PHASE" = prepared ] || return 1
  fi
  docker start "$BOOTSTRAP_LEGACY_BACKEND" "$BOOTSTRAP_LEGACY_FRONTEND" > /dev/null || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$BOOTSTRAP_LEGACY_BACKEND")" = true ] || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$BOOTSTRAP_LEGACY_FRONTEND")" = true ] || return 1
  bootstrap_legacy_compose up -d --no-deps --force-recreate nginx || return 1
  bootstrap_wait_legacy_origin || return 1
  git -C "$FILMOTT_REPO_ROOT" reset --hard "$BOOTSTRAP_ACTIVE_SHA" || return 1
  bootstrap_write_state prepared || return 1
  if [ -r "$FILMOTT_RELEASE_FILE" ]; then
    rm -f "$FILMOTT_RELEASE_FILE" || return 1
  fi
  printf 'Bootstrap rolled back to legacy routing: %s\n' "$BOOTSTRAP_ACTIVE_SHA"
}

bootstrap_cutover_run() {
  local target_sha="$1"

  bootstrap_read_state || return 1
  [ "$BOOTSTRAP_PHASE" = prepared ] && [ "$BOOTSTRAP_TARGET_SHA" = "$target_sha" ] || return 1
  bootstrap_refresh_target "$target_sha" || return 1
  [ "$(git -C "$FILMOTT_REPO_ROOT" rev-parse HEAD)" = "$BOOTSTRAP_ACTIVE_SHA" ] || return 1
  [ "$(bootstrap_compose ps -q postgres)" = "$BOOTSTRAP_POSTGRES" ] || return 1
  bootstrap_verify_target_files "$target_sha" || return 1
  bootstrap_source_deploy || return 1
  blue_green_assert_slot blue "$BOOTSTRAP_ACTIVE_SHA" || return 1
  bootstrap_validate_prepared_files || return 1
  blue_green_test_candidate || return 1
  bootstrap_start_maintenance_probe || return 1
  bootstrap_refresh_target "$target_sha" || return 1
  BOOTSTRAP_NGINX_CHANGED=1
  git -C "$FILMOTT_REPO_ROOT" reset --hard "$target_sha" || return 1
  bootstrap_compose up -d --no-deps --force-recreate nginx || return 1
  blue_green_wait_for_identity blue "$BOOTSTRAP_ACTIVE_SHA" || return 1
  blue_green_static_smoke check-static || return 1
  [ "$(bootstrap_origin_status filmott.kr /api/)" = 200 ] || return 1
  bootstrap_finish_maintenance_probe
  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    bash "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT" probe 5 https://filmott.kr || return 1
  blue_green_write_release blue "$BOOTSTRAP_ACTIVE_SHA" || return 1
  blue_green_preflight || return 1
  docker stop "$BOOTSTRAP_LEGACY_BACKEND" "$BOOTSTRAP_LEGACY_FRONTEND" > /dev/null || return 1
  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    bash "$FILMOTT_BOOTSTRAP_SMOKE_SCRIPT" probe 5 https://filmott.kr || return 1
  [ "$(bootstrap_compose ps -q postgres)" = "$BOOTSTRAP_POSTGRES" ] || return 1
  bootstrap_write_state cutover || return 1
  BOOTSTRAP_NGINX_CHANGED=0
  printf 'Bootstrap cutover completed: slot=blue sha=%s target=%s\n' \
    "$BOOTSTRAP_ACTIVE_SHA" "$BOOTSTRAP_TARGET_SHA"
}

bootstrap_cutover() {
  local target_sha="$1"

  BOOTSTRAP_NGINX_CHANGED=0
  if bootstrap_cutover_run "$target_sha"; then
    return 0
  fi
  BOOTSTRAP_RECOVERY_STARTED=1
  bootstrap_finish_maintenance_probe || true
  [ "$BOOTSTRAP_NGINX_CHANGED" -eq 0 ] || bootstrap_rollback || true
  return 1
}

bootstrap_recover_operation() {
  [ "$BOOTSTRAP_RECOVERY_STARTED" -eq 0 ] || return 0
  BOOTSTRAP_RECOVERY_STARTED=1
  case "$BOOTSTRAP_OPERATION" in
    prepare)
      [ "$BOOTSTRAP_PREPARE_STARTED" -eq 0 ] || bootstrap_prepare_cleanup "$BOOTSTRAP_ACTIVE_SHA"
      ;;
    cutover)
      bootstrap_finish_maintenance_probe || true
      [ "$BOOTSTRAP_NGINX_CHANGED" -eq 0 ] || bootstrap_rollback || true
      ;;
  esac
}

bootstrap_on_signal() {
  local status="$1"
  local signal="$2"
  local recovery_log

  trap - EXIT HUP INT TERM
  set +e
  trap '' PIPE
  recovery_log="$(mktemp "${FILMOTT_RECOVERY_LOG_DIR:-/tmp}/filmott-bootstrap-recovery.XXXXXX" 2>/dev/null || true)"
  [ -z "$recovery_log" ] || exec >> "$recovery_log" 2>&1
  bootstrap_error "Bootstrap interrupted by ${signal}"
  [ "$BOOTSTRAP_OPERATION_COMPLETED" -eq 1 ] || bootstrap_recover_operation
  exit "$status"
}

bootstrap_on_exit() {
  local status="$1"

  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$BOOTSTRAP_OPERATION_COMPLETED" -eq 0 ]; then
    bootstrap_recover_operation
  fi
  exit "$status"
}

bootstrap_main() {
  local operation="$1"
  local target_sha="${2:-}"
  local active_sha="${3:-}"
  local lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"

  BOOTSTRAP_OPERATION="$operation"
  BOOTSTRAP_ACTIVE_SHA="$active_sha"
  export BOOTSTRAP_OPERATION BOOTSTRAP_ACTIVE_SHA
  bootstrap_require_files || return 1
  exec 9>"$lock_file" || return 1
  flock -w 900 9 || return 1
  case "$operation" in
    prepare) bootstrap_prepare "$target_sha" "$active_sha" ;;
    cutover) bootstrap_validate_sha "$target_sha" && bootstrap_cutover "$target_sha" ;;
    rollback) bootstrap_rollback ;;
    *) return 64 ;;
  esac
  BOOTSTRAP_OPERATION_COMPLETED=1
  export BOOTSTRAP_OPERATION_COMPLETED
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    prepare) [ "$#" -eq 3 ] || exit 64 ;;
    cutover) [ "$#" -eq 2 ] || exit 64 ;;
    rollback) [ "$#" -eq 1 ] || exit 64 ;;
    *) bootstrap_error 'Usage: bootstrap-blue-green.sh prepare <target SHA> <legacy SHA> | cutover <target SHA> | rollback'; exit 64 ;;
  esac
  trap 'bootstrap_on_exit $?' EXIT
  trap 'bootstrap_on_signal 129 HUP' HUP
  trap 'bootstrap_on_signal 130 INT' INT
  trap 'bootstrap_on_signal 143 TERM' TERM
  bootstrap_main "$@"
fi
