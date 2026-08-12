#!/usr/bin/env bash

set -Eeuo pipefail

FILMOTT_REPO_ROOT="${FILMOTT_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FILMOTT_DEPLOY_STATE_DIR="${FILMOTT_DEPLOY_STATE_DIR:-${FILMOTT_REPO_ROOT}/.deploy-state}"
FILMOTT_RELEASE_FILE="${FILMOTT_RELEASE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/active-release}"
FILMOTT_UNCERTAIN_FILE="${FILMOTT_UNCERTAIN_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/deployment-uncertain}"
FILMOTT_UPSTREAM_FILE="${FILMOTT_UPSTREAM_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/nginx/upstreams.conf}"
FILMOTT_CANDIDATE_FILE="${FILMOTT_CANDIDATE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/nginx/candidate.conf}"
FILMOTT_ROLLBACK_FILE="${FILMOTT_ROLLBACK_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/nginx/rollback.conf}"
FILMOTT_STATIC_ASSET_FILE="${FILMOTT_STATIC_ASSET_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/previous-static-assets}"
FILMOTT_PROBE_LOG_FILE="${FILMOTT_PROBE_LOG_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/availability-probe.log}"
FILMOTT_PROBE_READY_FILE="${FILMOTT_PROBE_READY_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/availability-probe.ready}"
FILMOTT_PROBE_STOP_FILE="${FILMOTT_PROBE_STOP_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/availability-probe.stop}"
FILMOTT_PROBE_FAILURE_FILE="${FILMOTT_PROBE_FAILURE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/availability-probe.failed}"
FILMOTT_SSE_READY_FILE="${FILMOTT_SSE_READY_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/sse-smoke.ready}"
FILMOTT_SSE_CUTOVER_FILE="${FILMOTT_SSE_CUTOVER_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/sse-smoke.cutover}"
FILMOTT_SSE_SUCCESS_FILE="${FILMOTT_SSE_SUCCESS_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/sse-smoke.success}"
FILMOTT_SSE_FAILURE_FILE="${FILMOTT_SSE_FAILURE_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/sse-smoke.failed}"
FILMOTT_SSE_LOG_FILE="${FILMOTT_SSE_LOG_FILE:-${FILMOTT_DEPLOY_STATE_DIR}/sse-smoke.log}"
FILMOTT_COMPOSE_FILE="${FILMOTT_COMPOSE_FILE:-${FILMOTT_REPO_ROOT}/docker-compose.prod.yml}"
FILMOTT_NGINX_CONFIG_FILE="${FILMOTT_NGINX_CONFIG_FILE:-${FILMOTT_REPO_ROOT}/nginx/nginx.conf}"
FILMOTT_SECURITY_HEADERS_FILE="${FILMOTT_SECURITY_HEADERS_FILE:-${FILMOTT_REPO_ROOT}/nginx/security-headers.conf}"
FILMOTT_SMOKE_SCRIPT="${FILMOTT_SMOKE_SCRIPT:-${FILMOTT_REPO_ROOT}/scripts/blue-green-smoke.sh}"

blue_green_error() {
  echo "$1" >&2
}

blue_green_validate_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
    blue_green_error "Invalid deploy SHA: $1"
    return 1
  }
}

blue_green_other_slot() {
  case "$1" in
    blue) printf '%s\n' green ;;
    green) printf '%s\n' blue ;;
    *) return 1 ;;
  esac
}

blue_green_write_release() {
  local slot="$1"
  local sha="$2"
  local destination="${3:-$FILMOTT_RELEASE_FILE}"
  local temporary="${destination}.tmp"

  blue_green_other_slot "$slot" > /dev/null || return 1
  blue_green_validate_sha "$sha" || return 1
  mkdir -p "$(dirname "$destination")" || return 1
  printf 'slot=%s\nsha=%s\n' "$slot" "$sha" > "$temporary" || return 1
  mv "$temporary" "$destination" || return 1
}

blue_green_read_release() {
  local slot
  local sha
  local expected

  [ -r "$FILMOTT_RELEASE_FILE" ] || {
    blue_green_error "Active release state is missing: ${FILMOTT_RELEASE_FILE}"
    return 1
  }
  slot="$(sed -n '1s/^slot=//p' "$FILMOTT_RELEASE_FILE")" || return 1
  sha="$(sed -n '2s/^sha=//p' "$FILMOTT_RELEASE_FILE")" || return 1
  expected="$(mktemp "${FILMOTT_DEPLOY_STATE_DIR}/release-check.XXXXXX")" || return 1
  blue_green_write_release "$slot" "$sha" "$expected" || {
    rm -f "$expected"
    return 1
  }
  if ! cmp -s "$expected" "$FILMOTT_RELEASE_FILE"; then
    rm -f "$expected"
    blue_green_error "Invalid active release state: ${FILMOTT_RELEASE_FILE}"
    return 1
  fi
  rm -f "$expected" || return 1
  BLUE_GREEN_ACTIVE_SLOT="$slot"
  BLUE_GREEN_ACTIVE_SHA="$sha"
  export BLUE_GREEN_ACTIVE_SLOT BLUE_GREEN_ACTIVE_SHA
}

blue_green_write_upstream() {
  local destination="$1"
  local slot="$2"
  local sha="$3"
  local previous_slot="${4:-$slot}"
  local temporary="${destination}.tmp"

  blue_green_other_slot "$slot" > /dev/null || return 1
  blue_green_other_slot "$previous_slot" > /dev/null || return 1
  blue_green_validate_sha "$sha" || return 1
  mkdir -p "$(dirname "$destination")" || return 1
  {
    printf 'map $host $filmott_active_slot { default "%s"; }\n' "$slot"
    printf 'map $host $filmott_active_sha { default "%s"; }\n' "$sha"
    printf 'map $host $filmott_previous_frontend { default "frontend-%s:3000"; }\n' "$previous_slot"
    printf 'upstream frontend { server frontend-%s:3000; }\n' "$slot"
    printf 'upstream backend { server backend-%s:3001; }\n' "$slot"
  } > "$temporary" || return 1
  mv "$temporary" "$destination" || return 1
}

blue_green_compose() {
  (
    cd "$FILMOTT_REPO_ROOT" || exit 1
    docker compose --project-directory "$FILMOTT_REPO_ROOT" \
      --env-file "${FILMOTT_REPO_ROOT}/.env" -f "$FILMOTT_COMPOSE_FILE" "$@" || exit 1
  )
}

blue_green_origin_headers() {
  curl -sS --connect-timeout 5 --max-time 15 \
    --resolve filmott.kr:443:127.0.0.1 -D - -o /dev/null https://filmott.kr
}

blue_green_wait_for_identity() {
  local slot="$1"
  local sha="$2"
  local attempts="${3:-24}"
  local headers
  local attempt

  for attempt in $(seq 1 "$attempts"); do
    headers="$({ blue_green_origin_headers 2>/dev/null || true; printf '__END__'; } |
      tr -d '\r' | tr '[:upper:]' '[:lower:]')"
    if [[ "$headers" == *$'http/2 200'* || "$headers" == *$'http/1.1 200'* ]] &&
      [[ "$headers" == *$'x-filmott-slot: '"${slot}"$'\n'* ]] &&
      [[ "$headers" == *$'x-filmott-sha: '"${sha}"$'\n'* ]]; then
      return 0
    fi
    [ "$attempt" -eq "$attempts" ] || sleep 1
  done
  blue_green_error "Origin did not confirm slot=${slot} sha=${sha}"
  return 1
}

blue_green_assert_slot() {
  local slot="$1"
  local sha="$2"
  local app
  local service
  local container
  local expected_image

  for app in frontend backend; do
    service="${app}-${slot}"
    container="$(blue_green_compose ps -q "$service")" || return 1
    [ -n "$container" ] || return 1
    [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = true ] || return 1
    [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container" 2>/dev/null)" = "$service" ] || return 1
    expected_image="$(docker image inspect -f '{{.Id}}' "filmott-${app}:${sha}")" || return 1
    [ "$(docker inspect -f '{{.Image}}' "$container")" = "$expected_image" ] || return 1
  done
}

blue_green_preflight() {
  local expected

  [ ! -e "$FILMOTT_UNCERTAIN_FILE" ] || {
    blue_green_error "Previous deployment is uncertain: ${FILMOTT_UNCERTAIN_FILE}"
    return 1
  }
  blue_green_read_release || return 1
  expected="$(mktemp "${FILMOTT_DEPLOY_STATE_DIR}/upstream-check.XXXXXX")" || return 1
  blue_green_write_upstream "$expected" "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SHA" || {
    rm -f "$expected"
    return 1
  }
  if ! cmp -s "$expected" "$FILMOTT_UPSTREAM_FILE"; then
    rm -f "$expected"
    blue_green_error 'Release state and nginx upstream do not match'
    return 1
  fi
  rm -f "$expected" || return 1
  blue_green_assert_slot "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SHA" || return 1
  blue_green_wait_for_identity "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SHA" 1 || return 1
}

blue_green_build_inactive() {
  local slot="$1"
  local app

  blue_green_compose build "frontend-${slot}" "backend-${slot}" || return 1
  for app in frontend backend; do
    docker image tag "filmott-${app}:${slot}" "filmott-${app}:${BLUE_GREEN_TARGET_SHA}" || return 1
    printf 'Built image: app=%s slot=%s sha=%s image=%s\n' \
      "$app" "$slot" "$BLUE_GREEN_TARGET_SHA" \
      "$(docker image inspect -f '{{.Id}}' "filmott-${app}:${slot}")" || return 1
  done
}

blue_green_start_inactive() {
  local slot="$1"

  blue_green_compose rm -sf "frontend-${slot}" "backend-${slot}" || return 1
  blue_green_compose up -d --no-deps --force-recreate \
    "frontend-${slot}" "backend-${slot}" || return 1
}

blue_green_wait_service() {
  local service="$1"
  local url="$2"
  local container
  local attempt

  for attempt in $(seq 1 24); do
    container="$(blue_green_compose ps -q "$service")" || return 1
    if [ -n "$container" ] &&
      [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = true ] &&
      blue_green_compose exec -T "$service" node -e \
        "fetch('${url}', { cache: 'no-store' }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      return 0
    fi
    [ "$attempt" -eq 24 ] || sleep 5
  done
  return 1
}

blue_green_wait_inactive() {
  local slot="$1"

  blue_green_wait_service "backend-${slot}" http://127.0.0.1:3001/api/ || return 1
  blue_green_wait_service "frontend-${slot}" http://127.0.0.1:3000/robots.txt || return 1
  blue_green_assert_slot "$slot" "$BLUE_GREEN_TARGET_SHA" || return 1
}

blue_green_test_candidate() {
  local nginx_container
  local nginx_image
  local network

  nginx_container="$(blue_green_compose ps -q nginx)" || return 1
  nginx_image="$(docker inspect -f '{{.Config.Image}}' "$nginx_container")" || return 1
  network="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$nginx_container" | head -1)" || return 1
  [ -n "$network" ] || return 1
  docker run --rm --network "$network" \
    -v "${FILMOTT_NGINX_CONFIG_FILE}:/etc/nginx/conf.d/default.conf:ro" \
    -v "${FILMOTT_SECURITY_HEADERS_FILE}:/etc/nginx/security-headers.conf:ro" \
    -v "${FILMOTT_CANDIDATE_FILE}:/etc/nginx/runtime/upstreams.conf:ro" \
    -v "${FILMOTT_REPO_ROOT}/certbot/conf:/etc/letsencrypt:ro" \
    "$nginx_image" nginx -t || return 1
}

blue_green_reload_nginx() {
  blue_green_compose exec -T nginx nginx -t || return 1
  blue_green_compose exec -T nginx nginx -s reload || return 1
}

blue_green_finalize_upstream() {
  local temporary="${FILMOTT_UPSTREAM_FILE}.final"

  blue_green_write_upstream "$FILMOTT_CANDIDATE_FILE" \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" \
    "$BLUE_GREEN_INACTIVE_SLOT" || return 1
  cp "$FILMOTT_CANDIDATE_FILE" "$temporary" || return 1
  mv "$temporary" "$FILMOTT_UPSTREAM_FILE" || return 1
  blue_green_reload_nginx || return 1
  blue_green_wait_for_identity "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" || return 1
}

blue_green_revalidate() {
  local slot="$1"
  local secret

  secret="$(grep '^REVALIDATE_SECRET=' "${FILMOTT_REPO_ROOT}/.env" | cut -d= -f2-)" || return 1
  [ -n "$secret" ] || return 0
  blue_green_compose exec -T -e REVALIDATE_SECRET="$secret" "frontend-${slot}" \
    node -e "fetch('http://127.0.0.1:3000/internal/revalidate', {
      method:'POST', headers:{'Authorization':'Bearer '+process.env.REVALIDATE_SECRET,
      'Content-Type':'application/json'}, body:JSON.stringify({path:'/',tags:['rankings','recent-reviews']})
    }).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || return 1
}

blue_green_static_smoke() {
  local command="$1"

  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    bash "$FILMOTT_SMOKE_SCRIPT" \
    "$command" "$FILMOTT_STATIC_ASSET_FILE" https://filmott.kr
}

# checkout 전 signal에는 관측 child가 아직 없으며, helper 로드가 이 함수를 덮어쓴다.
blue_green_abort_probe() { return 0; }
blue_green_abort_sse_smoke() { return 0; }

blue_green_load_smoke_helpers() {
  declare -F blue_green_start_probe > /dev/null ||
    source "$FILMOTT_SMOKE_SCRIPT"
}

blue_green_mark_uncertain() {
  local temporary="${FILMOTT_UNCERTAIN_FILE}.tmp"

  printf 'from=%s\nto=%s\nsha=%s\n' \
    "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" \
    > "$temporary" || return 1
  mv "$temporary" "$FILMOTT_UNCERTAIN_FILE" || return 1
}

blue_green_rollback() {
  local temporary="${FILMOTT_UPSTREAM_FILE}.rollback"

  cp "$FILMOTT_ROLLBACK_FILE" "$temporary" || return 1
  mv "$temporary" "$FILMOTT_UPSTREAM_FILE" || return 1
  blue_green_reload_nginx || return 1
  blue_green_wait_for_identity "$BLUE_GREEN_ACTIVE_SLOT" "$BLUE_GREEN_ACTIVE_SHA" || return 1
  rm -f "$FILMOTT_UNCERTAIN_FILE" || return 1
  blue_green_compose rm -sf \
    "frontend-${BLUE_GREEN_INACTIVE_SLOT}" "backend-${BLUE_GREEN_INACTIVE_SLOT}" || return 1
}

blue_green_fail_after_cutover() {
  blue_green_error "$1"
  blue_green_abort_probe || true
  blue_green_abort_sse_smoke || true
  if ! blue_green_rollback; then
    blue_green_error 'Rollback failed; preserving both slots and uncertainty marker'
  fi
  return 1
}

blue_green_fail_before_cutover() {
  blue_green_error "$1"
  blue_green_abort_probe || true
  blue_green_abort_sse_smoke || true
  if [ "${BLUE_GREEN_INACTIVE_STARTED:-0}" = 1 ]; then
    blue_green_compose rm -sf \
      "frontend-${BLUE_GREEN_INACTIVE_SLOT}" "backend-${BLUE_GREEN_INACTIVE_SLOT}" || true
  fi
  return 1
}

blue_green_on_signal() {
  local status="$1"
  local signal="$2"
  local recovery_log

  trap - HUP INT TERM
  set +e
  trap '' PIPE
  recovery_log="$(mktemp "${FILMOTT_RECOVERY_LOG_DIR:-/tmp}/filmott-blue-green-recovery.XXXXXX" 2>/dev/null || true)"
  [ -z "$recovery_log" ] || exec >> "$recovery_log" 2>&1
  blue_green_error "Deploy interrupted by ${signal}"
  blue_green_abort_probe || true
  blue_green_abort_sse_smoke || true
  if [ "${BLUE_GREEN_CUTOVER_STARTED:-0}" = 1 ] && [ "${BLUE_GREEN_COMMITTED:-0}" = 0 ]; then
    blue_green_rollback || true
  elif [ "${BLUE_GREEN_INACTIVE_STARTED:-0}" = 1 ] && [ "${BLUE_GREEN_CUTOVER_STARTED:-0}" = 0 ]; then
    blue_green_compose rm -sf \
      "frontend-${BLUE_GREEN_INACTIVE_SLOT}" "backend-${BLUE_GREEN_INACTIVE_SLOT}" || true
  fi
  exit "$status"
}

blue_green_deploy() {
  local temporary="${FILMOTT_UPSTREAM_FILE}.tmp"

  if [ "$BLUE_GREEN_TARGET_SHA" = "$BLUE_GREEN_ACTIVE_SHA" ]; then
    printf 'Deploy target is already active: %s\n' "$BLUE_GREEN_TARGET_SHA"
    return 0
  fi
  blue_green_load_smoke_helpers || return 1
  BLUE_GREEN_DRAIN_SECONDS="${FILMOTT_BLUE_GREEN_DRAIN_SECONDS:-300}"
  [[ "$BLUE_GREEN_DRAIN_SECONDS" =~ ^[0-9]+$ ]] || return 1
  BLUE_GREEN_PROBE_SECONDS="${FILMOTT_BLUE_GREEN_PROBE_SECONDS:-$((BLUE_GREEN_DRAIN_SECONDS + 120))}"
  [[ "$BLUE_GREEN_PROBE_SECONDS" =~ ^[1-9][0-9]*$ ]] || return 1
  [ "$BLUE_GREEN_PROBE_SECONDS" -gt "$BLUE_GREEN_DRAIN_SECONDS" ] || return 1
  BLUE_GREEN_INACTIVE_SLOT="$(blue_green_other_slot "$BLUE_GREEN_ACTIVE_SLOT")" || return 1
  BLUE_GREEN_INACTIVE_STARTED=0
  BLUE_GREEN_CUTOVER_STARTED=0
  BLUE_GREEN_COMMITTED=0
  BLUE_GREEN_PROBE_PID=''
  BLUE_GREEN_SSE_PID=''
  export BLUE_GREEN_INACTIVE_SLOT BLUE_GREEN_INACTIVE_STARTED \
    BLUE_GREEN_CUTOVER_STARTED BLUE_GREEN_COMMITTED BLUE_GREEN_DRAIN_SECONDS \
    BLUE_GREEN_PROBE_SECONDS BLUE_GREEN_PROBE_PID BLUE_GREEN_SSE_PID

  blue_green_build_inactive "$BLUE_GREEN_INACTIVE_SLOT" || return 1
  BLUE_GREEN_INACTIVE_STARTED=1
  export BLUE_GREEN_INACTIVE_STARTED
  blue_green_start_inactive "$BLUE_GREEN_INACTIVE_SLOT" || {
    blue_green_fail_before_cutover 'Inactive slot start failed'
    return 1
  }
  blue_green_wait_inactive "$BLUE_GREEN_INACTIVE_SLOT" || {
    blue_green_fail_before_cutover 'Inactive slot readiness failed'
    return 1
  }

  git -C "$FILMOTT_REPO_ROOT" fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main || {
    blue_green_fail_before_cutover 'Cannot refresh origin/main after build'
    return 1
  }
  [ "$(git -C "$FILMOTT_REPO_ROOT" rev-parse origin/main)" = "$BLUE_GREEN_TARGET_SHA" ] || {
    blue_green_fail_before_cutover 'Deploy target became stale during build'
    return 1
  }
  blue_green_write_upstream "$FILMOTT_CANDIDATE_FILE" \
    "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" \
    "$BLUE_GREEN_ACTIVE_SLOT" || {
      blue_green_fail_before_cutover 'Candidate upstream rendering failed'
      return 1
    }
  blue_green_test_candidate || {
    blue_green_fail_before_cutover 'Candidate nginx validation failed'
    return 1
  }
  blue_green_static_smoke capture-static || {
    blue_green_fail_before_cutover 'Current static asset capture failed'
    return 1
  }
  cp "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_ROLLBACK_FILE" || {
    blue_green_fail_before_cutover 'Current upstream snapshot failed'
    return 1
  }
  cmp -s "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_ROLLBACK_FILE" || {
    blue_green_fail_before_cutover 'Current upstream snapshot verification failed'
    return 1
  }
  blue_green_start_probe || {
    blue_green_fail_before_cutover 'Availability probe start failed'
    return 1
  }
  blue_green_start_sse_smoke || {
    blue_green_fail_before_cutover 'SSE smoke did not confirm the active slot'
    return 1
  }
  blue_green_verify_observers || {
    blue_green_fail_before_cutover 'Availability observer failed before cutover'
    return 1
  }
  blue_green_mark_uncertain || {
    blue_green_fail_before_cutover 'Uncertainty marker creation failed'
    return 1
  }
  BLUE_GREEN_CUTOVER_STARTED=1
  export BLUE_GREEN_CUTOVER_STARTED

  cp "$FILMOTT_CANDIDATE_FILE" "$temporary" || {
    blue_green_fail_after_cutover 'Candidate upstream staging failed'
    return 1
  }
  mv "$temporary" "$FILMOTT_UPSTREAM_FILE" || {
    blue_green_fail_after_cutover 'Candidate upstream activation failed'
    return 1
  }
  blue_green_reload_nginx || { blue_green_fail_after_cutover 'Nginx reload failed'; return 1; }
  blue_green_signal_sse_cutover || {
    blue_green_fail_after_cutover 'SSE cutover signal failed'
    return 1
  }
  blue_green_wait_for_identity "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" || {
    blue_green_fail_after_cutover 'New slot identity check failed'
    return 1
  }
  blue_green_static_smoke check-static || {
    blue_green_fail_after_cutover 'Previous static asset check failed'
    return 1
  }
  blue_green_revalidate "$BLUE_GREEN_INACTIVE_SLOT" || {
    blue_green_fail_after_cutover 'ISR revalidation failed'
    return 1
  }
  printf 'Draining previous slot for up to %s seconds\n' \
    "$BLUE_GREEN_DRAIN_SECONDS" >&2
  blue_green_wait_drain || {
    blue_green_fail_after_cutover 'Availability probe failed during drain'
    return 1
  }
  blue_green_finalize_upstream || {
    blue_green_fail_after_cutover 'Previous static fallback cleanup failed'
    return 1
  }
  blue_green_finish_probe || {
    blue_green_fail_after_cutover 'Availability probe did not complete cleanly'
    return 1
  }
  blue_green_finish_sse_smoke || {
    blue_green_fail_after_cutover 'SSE smoke did not complete across cutover'
    return 1
  }

  # 이 시점부터 signal은 검증된 새 routing과 양쪽 slot을 보존한다.
  BLUE_GREEN_COMMITTED=1
  export BLUE_GREEN_COMMITTED
  blue_green_write_release "$BLUE_GREEN_INACTIVE_SLOT" "$BLUE_GREEN_TARGET_SHA" || {
    BLUE_GREEN_COMMITTED=0
    export BLUE_GREEN_COMMITTED
    blue_green_fail_after_cutover 'Release state commit failed'
    return 1
  }
  rm -f "$FILMOTT_UNCERTAIN_FILE" || return 1
  blue_green_cleanup_sse_smoke || return 1

  blue_green_compose stop \
    "backend-${BLUE_GREEN_ACTIVE_SLOT}" "frontend-${BLUE_GREEN_ACTIVE_SLOT}" || return 1
}

blue_green_require_files() {
  local file
  local variable

  for file in "${FILMOTT_REPO_ROOT}/.env" "${FILMOTT_REPO_ROOT}/backend/.env.production"; do
    [ -f "$file" ] || return 1
  done
  for variable in DB_NAME DB_USERNAME DB_PASSWORD REVALIDATE_SECRET; do
    grep -q "^${variable}=" "${FILMOTT_REPO_ROOT}/.env" || return 1
  done
}

blue_green_main() {
  local target_sha="$1"
  local latest_sha
  local lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"

  blue_green_validate_sha "$target_sha" || return 1
  blue_green_require_files || return 1
  exec 9>"$lock_file" || return 1
  flock -w 900 9 || return 1
  git -C "$FILMOTT_REPO_ROOT" fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main || return 1
  git -C "$FILMOTT_REPO_ROOT" cat-file -e "${target_sha}^{commit}" || return 1
  latest_sha="$(git -C "$FILMOTT_REPO_ROOT" rev-parse origin/main)" || return 1
  if [ "$target_sha" != "$latest_sha" ]; then
    if [ "${FILMOTT_REQUIRE_CUTOVER:-0}" = 1 ]; then
      blue_green_error "Manual cutover target is stale: target=${target_sha} origin=${latest_sha}"
      return 1
    fi
    printf 'Skipping stale deploy target %s; origin/main is %s\n' "$target_sha" "$latest_sha"
    return 0
  fi

  blue_green_preflight || return 1
  if [ "${FILMOTT_REQUIRE_CUTOVER:-0}" = 1 ] &&
    [ "$target_sha" = "$BLUE_GREEN_ACTIVE_SHA" ]; then
    blue_green_error "Manual cutover target is already active: ${target_sha}"
    return 1
  fi
  BLUE_GREEN_TARGET_SHA="$target_sha"
  export BLUE_GREEN_TARGET_SHA
  trap 'blue_green_on_signal 129 HUP' HUP
  trap 'blue_green_on_signal 130 INT' INT
  trap 'blue_green_on_signal 143 TERM' TERM

  # Checkout은 빌드 입력일 뿐 active release 상태가 아니다. 실패 시 실행 중 슬롯은 유지한다.
  git -C "$FILMOTT_REPO_ROOT" reset --hard "$target_sha" || return 1
  blue_green_compose config > /dev/null || return 1
  blue_green_deploy || return 1
  if [ "${FILMOTT_REQUIRE_CUTOVER:-0}" = 1 ]; then
    blue_green_read_release || return 1
    [ "$BLUE_GREEN_ACTIVE_SHA" = "$target_sha" ] || {
      blue_green_error "Manual cutover did not activate target: ${target_sha}"
      return 1
    }
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "${1:-}" = deploy ] && [ "$#" -eq 2 ] || {
    blue_green_error 'Usage: deploy-blue-green.sh deploy <40-character SHA>'
    exit 64
  }
  blue_green_main "$2"
fi
