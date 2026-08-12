#!/usr/bin/env bash

set -Eeuo pipefail

blue_green_smoke_error() {
  echo "$1" >&2
}

blue_green_smoke_curl() {
  curl "$@"
}

blue_green_smoke_args() {
  BLUE_GREEN_SMOKE_CURL_ARGS=(
    --silent --show-error --connect-timeout 5 --max-time "${FILMOTT_SMOKE_MAX_TIME:-15}"
  )
  if [ -n "${FILMOTT_SMOKE_RESOLVE:-}" ]; then
    BLUE_GREEN_SMOKE_CURL_ARGS+=(--resolve "$FILMOTT_SMOKE_RESOLVE")
  fi
}

blue_green_smoke_probe() (
  local duration="$1"
  local base_url="$2"
  local deadline
  local failures=0
  local checks=0
  local path
  local result
  local status
  local elapsed
  local max_elapsed=0
  local ready_written=0
  local cycle_started
  local cycle_elapsed
  local probe_root
  local index
  local -a paths=(/ /api/)
  local -a probe_pids=()

  [[ "$duration" =~ ^[1-9][0-9]*$ ]] || return 1
  blue_green_smoke_args || return 1
  probe_root="$(mktemp -d "${TMPDIR:-/tmp}/filmott-availability-probe.XXXXXX")" || return 1
  trap 'rm -f "${probe_root}"/* 2>/dev/null || true; rmdir "$probe_root" 2>/dev/null || true' EXIT
  deadline=$((SECONDS + duration))
  while [ "$SECONDS" -lt "$deadline" ] &&
    { [ -z "${FILMOTT_SMOKE_STOP_FILE:-}" ] || [ ! -e "$FILMOTT_SMOKE_STOP_FILE" ]; }; do
    cycle_started=$SECONDS
    probe_pids=()
    for index in 0 1; do
      path="${paths[$index]}"
      (
        if ! result="$(blue_green_smoke_curl "${BLUE_GREEN_SMOKE_CURL_ARGS[@]}" \
          -o /dev/null -w '%{http_code} %{time_total}' "${base_url}${path}")"; then
          result='000 0'
        fi
        printf '%s\n' "$result" > "${probe_root}/${index}"
      ) &
      probe_pids+=("$!")
    done
    for index in 0 1; do
      wait "${probe_pids[$index]}" || return 1
      result="$(<"${probe_root}/${index}")"
      read -r status elapsed <<< "$result"
      if [[ ! "$status" =~ ^[0-9]{3}$ ]] || [[ ! "$elapsed" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        status=000
        elapsed=0
      fi
      checks=$((checks + 1))
      if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
        failures=$((failures + 1))
        blue_green_smoke_error "probe failed: path=${paths[$index]} status=${status}"
        if [ -n "${FILMOTT_SMOKE_FAILURE_FILE:-}" ]; then
          : > "$FILMOTT_SMOKE_FAILURE_FILE" || return 1
        fi
      fi
      max_elapsed="$(awk -v current="$elapsed" -v maximum="$max_elapsed" \
        'BEGIN { print (current > maximum ? current : maximum) }')" || return 1
    done
    if [ "$ready_written" -eq 0 ] && [ "$failures" -eq 0 ] &&
      [ -n "${FILMOTT_SMOKE_READY_FILE:-}" ]; then
      : > "$FILMOTT_SMOKE_READY_FILE" || return 1
      ready_written=1
    fi
    cycle_elapsed=$((SECONDS - cycle_started))
    if [ "$SECONDS" -lt "$deadline" ] && [ "$cycle_elapsed" -lt 1 ]; then
      sleep 1 || return 1
    fi
  done
  printf 'probe summary: checks=%s failures=%s max_seconds=%s\n' \
    "$checks" "$failures" "$max_elapsed"
  [ "$checks" -gt 0 ] && [ "$failures" -eq 0 ]
)

blue_green_smoke_capture_static() {
  local output="$1"
  local base_url="$2"
  local temporary="${output}.tmp"

  blue_green_smoke_args || return 1
  mkdir -p "$(dirname "$output")" || return 1
  if ! blue_green_smoke_curl "${BLUE_GREEN_SMOKE_CURL_ARGS[@]}" "${base_url}/" |
    grep -oE '/_next/static/[^"'"'"' <\\]+' | sort -u > "$temporary"; then
    rm -f "$temporary"
    blue_green_smoke_error 'Failed to capture Next.js static assets'
    return 1
  fi
  [ -s "$temporary" ] || {
    rm -f "$temporary"
    blue_green_smoke_error 'No Next.js static asset was found in the active HTML'
    return 1
  }
  mv "$temporary" "$output" || return 1
}

blue_green_smoke_check_static() {
  local input="$1"
  local base_url="$2"
  local path
  local status

  [ -s "$input" ] || return 1
  blue_green_smoke_args || return 1
  while IFS= read -r path; do
    if ! status="$(blue_green_smoke_curl "${BLUE_GREEN_SMOKE_CURL_ARGS[@]}" \
      -o /dev/null -w '%{http_code}' "${base_url}${path}")"; then
      status=000
    fi
    [ "$status" = 200 ] || {
      blue_green_smoke_error "static asset failed: path=${path} status=${status}"
      return 1
    }
  done < "$input"
}

blue_green_smoke_sse() (
  local base_url="$1"
  local temporary
  local headers
  local body
  local curl_pid=''
  local ready_file="${FILMOTT_SSE_READY_FILE:-}"
  local cutover_file="${FILMOTT_SSE_CUTOVER_FILE:-}"
  local success_file="${FILMOTT_SSE_SUCCESS_FILE:-}"
  local failure_file="${FILMOTT_SSE_FAILURE_FILE:-}"
  local sse_attempt="${FILMOTT_SSE_ATTEMPT:-}"
  local coordinated=0
  local attempt
  local observed_slot
  local succeeded=0

  temporary="$(mktemp -d "${TMPDIR:-/tmp}/filmott-sse-smoke.XXXXXX")" || return 1
  headers="${temporary}/headers"
  body="${temporary}/body"
  cleanup_sse() {
    if [ -n "$curl_pid" ]; then
      kill "$curl_pid" 2>/dev/null || true
      wait "$curl_pid" 2>/dev/null || true
    fi
    if [ "$coordinated" -eq 1 ] && [ "$succeeded" -eq 0 ]; then
      printf 'attempt=%s\n' "$sse_attempt" > "$failure_file" 2>/dev/null || true
    fi
    rm -f "$headers" "$body" 2>/dev/null || true
    rmdir "$temporary" 2>/dev/null || true
  }
  trap cleanup_sse EXIT
  if [ -n "$ready_file" ] || [ -n "$cutover_file" ] ||
    [ -n "$success_file" ] || [ -n "$failure_file" ]; then
    [ -n "$ready_file" ] && [ -n "$cutover_file" ] &&
      [ -n "$success_file" ] && [ -n "$failure_file" ] || return 1
    [[ "$sse_attempt" =~ ^[0-9a-f]{32}$ ]] || return 1
    coordinated=1
    mkdir -p "$(dirname "$ready_file")" || return 1
    rm -f "$ready_file" "$cutover_file" "$success_file" "$failure_file" || return 1
  fi
  FILMOTT_SMOKE_MAX_TIME="${FILMOTT_SMOKE_MAX_TIME:-300}" blue_green_smoke_args || return 1
  blue_green_smoke_curl "${BLUE_GREEN_SMOKE_CURL_ARGS[@]}" --no-buffer \
    -D "$headers" -o "$body" -H 'Content-Type: application/json' \
    --data '{"content":"배포 중 SSE 연결 유지 확인을 위해 영화 한 편을 간단히 추천해줘","history":[]}' \
    "${base_url}/api/chat/messages" &
  curl_pid=$!

  for attempt in $(seq 1 100); do
    if [ -s "$headers" ] &&
      tr -d '\r' < "$headers" | grep -qi '^content-type: text/event-stream'; then
      break
    fi
    kill -0 "$curl_pid" 2>/dev/null || return 1
    [ "$attempt" -eq 100 ] || sleep 0.1 || return 1
  done
  tr -d '\r' < "$headers" | grep -qi '^content-type: text/event-stream' || return 1
  if [ -n "${FILMOTT_EXPECTED_SLOT:-}" ]; then
    tr -d '\r' < "$headers" |
      grep -qi "^x-filmott-slot: ${FILMOTT_EXPECTED_SLOT}$" || return 1
  fi
  if [ "$coordinated" -eq 1 ]; then
    observed_slot="$(tr -d '\r' < "$headers" |
      sed -n 's/^x-filmott-slot: //Ip' | head -1)" || return 1
    [[ "$observed_slot" =~ ^(blue|green)$ ]] || return 1
    printf 'attempt=%s\nslot=%s\n' "$sse_attempt" "$observed_slot" > "$ready_file" || return 1
    while [ ! -r "$cutover_file" ] ||
      [ "$(<"$cutover_file")" != "attempt=${sse_attempt}" ]; do
      if [ -r "$failure_file" ] &&
        [ "$(<"$failure_file")" = "attempt=${sse_attempt}" ]; then
        return 1
      fi
      if grep -q '^event: done$' "$body" 2>/dev/null; then
        blue_green_smoke_error 'SSE completed before cutover'
        return 1
      fi
      kill -0 "$curl_pid" 2>/dev/null || return 1
      sleep 0.1 || return 1
    done
  fi
  wait "$curl_pid" || return 1
  curl_pid=''
  tr -d '\r' < "$headers" |
    grep -Eq '^HTTP/(1\.1|2) (200|201)([[:space:]].*)?$' || return 1
  tr -d '\r' < "$headers" | grep -qi '^content-type: text/event-stream' || return 1
  if grep -q '^event: error$' "$body"; then
    return 1
  fi
  grep -q '^event: done$' "$body" || return 1
  if [ "$coordinated" -eq 1 ]; then
    printf 'attempt=%s\n' "$sse_attempt" > "$success_file" || return 1
  fi
  succeeded=1
  printf 'SSE smoke completed%s\n' \
    "${FILMOTT_EXPECTED_SLOT:+: slot=${FILMOTT_EXPECTED_SLOT}}"
)

blue_green_wait_probe_ready() {
  local attempt

  for attempt in $(seq 1 30); do
    [ ! -e "$FILMOTT_PROBE_FAILURE_FILE" ] || return 1
    [ ! -e "$FILMOTT_PROBE_READY_FILE" ] || return 0
    kill -0 "$BLUE_GREEN_PROBE_PID" 2>/dev/null || return 1
    [ "$attempt" -eq 30 ] || sleep 1 || return 1
  done
  return 1
}

blue_green_start_probe() {
  rm -f "$FILMOTT_PROBE_LOG_FILE" "$FILMOTT_PROBE_READY_FILE" "$FILMOTT_PROBE_STOP_FILE" \
    "$FILMOTT_PROBE_FAILURE_FILE" || return 1
  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    FILMOTT_SMOKE_MAX_TIME=5 \
    FILMOTT_SMOKE_READY_FILE="$FILMOTT_PROBE_READY_FILE" \
    FILMOTT_SMOKE_STOP_FILE="$FILMOTT_PROBE_STOP_FILE" \
    FILMOTT_SMOKE_FAILURE_FILE="$FILMOTT_PROBE_FAILURE_FILE" \
    bash "${FILMOTT_REPO_ROOT}/scripts/blue-green-smoke.sh" \
    probe "$BLUE_GREEN_PROBE_SECONDS" https://filmott.kr \
    > "$FILMOTT_PROBE_LOG_FILE" 2>&1 &
  BLUE_GREEN_PROBE_PID=$!
  export BLUE_GREEN_PROBE_PID
  blue_green_wait_probe_ready
}

blue_green_wait_drain() {
  local elapsed=0

  while [ "$elapsed" -lt "$BLUE_GREEN_DRAIN_SECONDS" ]; do
    [ ! -e "$FILMOTT_PROBE_FAILURE_FILE" ] || return 1
    if [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ]; then
      ! blue_green_sse_marker_matches "$FILMOTT_SSE_FAILURE_FILE" || return 1
    fi
    kill -0 "$BLUE_GREEN_PROBE_PID" 2>/dev/null || return 1
    sleep 1 || return 1
    elapsed=$((elapsed + 1))
  done
}

blue_green_finish_probe() {
  local status=0

  : > "$FILMOTT_PROBE_STOP_FILE" || return 1
  if ! wait "$BLUE_GREEN_PROBE_PID"; then
    status=1
  fi
  BLUE_GREEN_PROBE_PID=''
  export BLUE_GREEN_PROBE_PID
  cat "$FILMOTT_PROBE_LOG_FILE" || status=1
  rm -f "$FILMOTT_PROBE_READY_FILE" "$FILMOTT_PROBE_STOP_FILE" \
    "$FILMOTT_PROBE_FAILURE_FILE" || status=1
  return "$status"
}

blue_green_abort_probe() {
  [ -n "${BLUE_GREEN_PROBE_PID:-}" ] || return 0
  : > "$FILMOTT_PROBE_STOP_FILE" 2>/dev/null || true
  wait "$BLUE_GREEN_PROBE_PID" 2>/dev/null || true
  cat "$FILMOTT_PROBE_LOG_FILE" >&2 2>/dev/null || true
  rm -f "$FILMOTT_PROBE_READY_FILE" "$FILMOTT_PROBE_STOP_FILE" 2>/dev/null || true
  BLUE_GREEN_PROBE_PID=''
  export BLUE_GREEN_PROBE_PID
}

blue_green_signal_sse_cutover() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  printf 'attempt=%s\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_CUTOVER_FILE" || return 1
}

blue_green_sse_marker_matches() {
  [ -r "$1" ] && [ "$(<"$1")" = "attempt=${FILMOTT_SSE_ATTEMPT}" ]
}

blue_green_wait_sse_ready() {
  local attempt
  local expected_ready

  expected_ready="$(printf 'attempt=%s\nslot=%s\n' \
    "$FILMOTT_SSE_ATTEMPT" "$BLUE_GREEN_ACTIVE_SLOT")" || return 1
  for attempt in $(seq 1 30); do
    ! blue_green_sse_marker_matches "$FILMOTT_SSE_FAILURE_FILE" || return 1
    if [ -r "$FILMOTT_SSE_READY_FILE" ] &&
      [ "$(<"$FILMOTT_SSE_READY_FILE")" = "$expected_ready" ]; then
      return 0
    fi
    [ "$attempt" -eq 30 ] || sleep 1 || return 1
  done
  return 1
}

blue_green_start_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  FILMOTT_SSE_ATTEMPT="$(openssl rand -hex 16)" || return 1
  [[ "$FILMOTT_SSE_ATTEMPT" =~ ^[0-9a-f]{32}$ ]] || return 1
  rm -f "$FILMOTT_SSE_READY_FILE" "$FILMOTT_SSE_CUTOVER_FILE" \
    "$FILMOTT_SSE_SUCCESS_FILE" "$FILMOTT_SSE_FAILURE_FILE" \
    "$FILMOTT_SSE_LOG_FILE" || return 1
  FILMOTT_SMOKE_RESOLVE=filmott.kr:443:127.0.0.1 \
    FILMOTT_EXPECTED_SLOT="$BLUE_GREEN_ACTIVE_SLOT" \
    FILMOTT_SSE_ATTEMPT="$FILMOTT_SSE_ATTEMPT" \
    FILMOTT_SSE_READY_FILE="$FILMOTT_SSE_READY_FILE" \
    FILMOTT_SSE_CUTOVER_FILE="$FILMOTT_SSE_CUTOVER_FILE" \
    FILMOTT_SSE_SUCCESS_FILE="$FILMOTT_SSE_SUCCESS_FILE" \
    FILMOTT_SSE_FAILURE_FILE="$FILMOTT_SSE_FAILURE_FILE" \
    bash "${FILMOTT_REPO_ROOT}/scripts/blue-green-smoke.sh" sse https://filmott.kr \
    > "$FILMOTT_SSE_LOG_FILE" 2>&1 &
  BLUE_GREEN_SSE_PID=$!
  export FILMOTT_SSE_ATTEMPT BLUE_GREEN_SSE_PID
  blue_green_wait_sse_ready || {
    blue_green_abort_sse_smoke || true
    return 1
  }
}

blue_green_verify_observers() {
  local expected_ready

  [ ! -e "$FILMOTT_PROBE_FAILURE_FILE" ] || return 1
  [ -e "$FILMOTT_PROBE_READY_FILE" ] || return 1
  kill -0 "$BLUE_GREEN_PROBE_PID" 2>/dev/null || return 1
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  ! blue_green_sse_marker_matches "$FILMOTT_SSE_FAILURE_FILE" || return 1
  expected_ready="$(printf 'attempt=%s\nslot=%s\n' \
    "$FILMOTT_SSE_ATTEMPT" "$BLUE_GREEN_ACTIVE_SLOT")" || return 1
  [ -r "$FILMOTT_SSE_READY_FILE" ] &&
    [ "$(<"$FILMOTT_SSE_READY_FILE")" = "$expected_ready" ] || return 1
  kill -0 "$BLUE_GREEN_SSE_PID" 2>/dev/null || return 1
}

blue_green_finish_sse_smoke() {
  local status=0

  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  if ! wait "$BLUE_GREEN_SSE_PID"; then
    status=1
  fi
  BLUE_GREEN_SSE_PID=''
  export BLUE_GREEN_SSE_PID
  cat "$FILMOTT_SSE_LOG_FILE" || status=1
  ! blue_green_sse_marker_matches "$FILMOTT_SSE_FAILURE_FILE" || return 1
  blue_green_sse_marker_matches "$FILMOTT_SSE_SUCCESS_FILE" || status=1
  return "$status"
}

blue_green_cleanup_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  rm -f "$FILMOTT_SSE_READY_FILE" "$FILMOTT_SSE_CUTOVER_FILE" \
    "$FILMOTT_SSE_SUCCESS_FILE" "$FILMOTT_SSE_FAILURE_FILE" \
    "$FILMOTT_SSE_LOG_FILE"
}

blue_green_abort_sse_smoke() {
  [ "${FILMOTT_REQUIRE_SSE_SMOKE:-0}" = 1 ] || return 0
  [[ "${FILMOTT_SSE_ATTEMPT:-}" =~ ^[0-9a-f]{32}$ ]] || return 0
  printf 'attempt=%s\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_FAILURE_FILE"
  if [ -n "${BLUE_GREEN_SSE_PID:-}" ]; then
    kill "$BLUE_GREEN_SSE_PID" 2>/dev/null || true
    wait "$BLUE_GREEN_SSE_PID" 2>/dev/null || true
    BLUE_GREEN_SSE_PID=''
    export BLUE_GREEN_SSE_PID
  fi
  cat "$FILMOTT_SSE_LOG_FILE" >&2 2>/dev/null || true
}

blue_green_smoke_main() {
  local command="${1:-}"
  local base_url="${3:-${FILMOTT_SMOKE_BASE_URL:-https://filmott.kr}}"

  case "$command" in
    probe)
      [ "$#" -le 3 ] || return 64
      blue_green_smoke_probe "${2:-330}" "${3:-${FILMOTT_SMOKE_BASE_URL:-https://filmott.kr}}"
      ;;
    capture-static)
      [ "$#" -ge 2 ] && [ "$#" -le 3 ] || return 64
      blue_green_smoke_capture_static "$2" "$base_url"
      ;;
    check-static)
      [ "$#" -ge 2 ] && [ "$#" -le 3 ] || return 64
      blue_green_smoke_check_static "$2" "$base_url"
      ;;
    sse)
      [ "$#" -le 2 ] || return 64
      blue_green_smoke_sse "${2:-${FILMOTT_SMOKE_BASE_URL:-https://filmott.kr}}"
      ;;
    *) return 64 ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  blue_green_smoke_main "$@" || {
    status=$?
    if [ "$status" -eq 64 ]; then
      blue_green_smoke_error 'Usage: blue-green-smoke.sh probe [seconds] [base-url] | capture-static <file> [base-url] | check-static <file> [base-url] | sse [base-url]'
    fi
    exit "$status"
  }
fi
