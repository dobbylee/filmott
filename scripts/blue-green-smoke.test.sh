#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
assets_file="${test_root}/assets"

cleanup() {
  rm -f "${test_root}"/* 2>/dev/null || true
  rmdir "$test_root" 2>/dev/null || true
}
trap cleanup EXIT

# shellcheck source=scripts/blue-green-smoke.sh
source "${repo_root}/scripts/blue-green-smoke.sh"

assert_status() {
  if [ "$1" -ne "$2" ]; then
    echo "$3: expected status $1, got $2" >&2
    exit 1
  fi
}

blue_green_smoke_curl() {
  local headers=''
  local body=''
  local write_format=''
  local url="${!#}"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      -D) headers="$2"; shift 2 ;;
      -o) body="$2"; shift 2 ;;
      -w) write_format="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  case "${MOCK_MODE:-}" in
    capture)
      printf '<script src="/_next/static/chunks/app.js"></script><script>\"/_next/static/css/app.css\\\"</script>'
      ;;
    probe)
      if [ "${FAIL_API:-0}" = 1 ] && [[ "$url" == */api/ ]]; then
        printf '503 0.250'
      else
        printf '200 0.125'
      fi
      ;;
    static)
      if [ "${FAIL_STATIC:-0}" = 1 ] && [[ "$url" == *app.js ]]; then
        printf 404
      else
        printf 200
      fi
      ;;
    sse)
      printf 'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nX-Filmott-Slot: blue\r\n\r\n' > "$headers"
      if [ "${FAIL_SSE:-0}" = 1 ]; then
        printf 'event: error\ndata: {}\n\n' > "$body"
      elif [ "${MOCK_COORDINATED_SSE:-0}" = 1 ]; then
        while [ ! -e "$FILMOTT_SSE_CUTOVER_FILE" ]; do
          sleep 0.05
        done
        printf 'event: text\ndata: {}\n\nevent: done\ndata: {}\n\n' > "$body"
      else
        printf 'event: text\ndata: {}\n\nevent: done\ndata: {}\n\n' > "$body"
      fi
      ;;
    *)
      echo "unexpected curl mock: format=${write_format} url=${url}" >&2
      return 1
      ;;
  esac
}

MOCK_MODE=capture
blue_green_smoke_capture_static "$assets_file" https://filmott.kr
[ "$(wc -l < "$assets_file" | tr -d '[:space:]')" -eq 2 ]
grep -qx '/_next/static/chunks/app.js' "$assets_file"
grep -qx '/_next/static/css/app.css' "$assets_file"

MOCK_MODE=static
blue_green_smoke_check_static "$assets_file" https://filmott.kr
FAIL_STATIC=1
set +e
blue_green_smoke_check_static "$assets_file" https://filmott.kr > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'static fallback failure'
unset FAIL_STATIC

MOCK_MODE=probe
summary="$(blue_green_smoke_probe 1 https://filmott.kr)"
[[ "$summary" == *'checks=2 failures=0 max_seconds=0.125'* ]]
FILMOTT_SMOKE_READY_FILE="${test_root}/probe.ready"
blue_green_smoke_probe 1 https://filmott.kr > /dev/null
[ -e "$FILMOTT_SMOKE_READY_FILE" ]
rm -f "$FILMOTT_SMOKE_READY_FILE"
unset FILMOTT_SMOKE_READY_FILE
FAIL_API=1
FILMOTT_SMOKE_FAILURE_FILE="${test_root}/probe.failed"
set +e
blue_green_smoke_probe 1 https://filmott.kr > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'continuous probe failure'
[ -e "$FILMOTT_SMOKE_FAILURE_FILE" ]
rm -f "$FILMOTT_SMOKE_FAILURE_FILE"
unset FILMOTT_SMOKE_FAILURE_FILE
unset FAIL_API

MOCK_MODE=sse
FILMOTT_EXPECTED_SLOT=blue blue_green_smoke_sse https://filmott.kr > /dev/null
export FILMOTT_SSE_READY_FILE="${test_root}/sse.ready"
export FILMOTT_SSE_CUTOVER_FILE="${test_root}/sse.cutover"
export FILMOTT_SSE_SUCCESS_FILE="${test_root}/sse.success"
export FILMOTT_SSE_FAILURE_FILE="${test_root}/sse.failed"
export FILMOTT_SSE_ATTEMPT=0123456789abcdef0123456789abcdef
MOCK_COORDINATED_SSE=1 blue_green_smoke_sse https://filmott.kr > /dev/null &
sse_pid=$!
for _ in $(seq 1 100); do
  [ ! -e "$FILMOTT_SSE_READY_FILE" ] || break
  sleep 0.05
done
[ -e "$FILMOTT_SSE_READY_FILE" ]
[ "$(<"$FILMOTT_SSE_READY_FILE")" = $'attempt=0123456789abcdef0123456789abcdef\nslot=blue' ]
printf 'attempt=%s\n' "$FILMOTT_SSE_ATTEMPT" > "$FILMOTT_SSE_CUTOVER_FILE"
wait "$sse_pid"
[ -e "$FILMOTT_SSE_SUCCESS_FILE" ] && [ ! -e "$FILMOTT_SSE_FAILURE_FILE" ]
[ "$(<"$FILMOTT_SSE_SUCCESS_FILE")" = 'attempt=0123456789abcdef0123456789abcdef' ]
rm -f "$FILMOTT_SSE_READY_FILE" "$FILMOTT_SSE_CUTOVER_FILE" "$FILMOTT_SSE_SUCCESS_FILE"

export FILMOTT_SSE_READY_FILE="${test_root}/sse.ready"
export FILMOTT_SSE_CUTOVER_FILE="${test_root}/sse.cutover"
export FILMOTT_SSE_SUCCESS_FILE="${test_root}/sse.success"
export FILMOTT_SSE_FAILURE_FILE="${test_root}/sse.failed"
export FILMOTT_SSE_ATTEMPT=0123456789abcdef0123456789abcdef
set +e
FAIL_SSE=1 blue_green_smoke_sse https://filmott.kr > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'coordinated SSE failure marker'
[ -e "$FILMOTT_SSE_FAILURE_FILE" ] && [ ! -e "$FILMOTT_SSE_SUCCESS_FILE" ]
[ "$(<"$FILMOTT_SSE_FAILURE_FILE")" = 'attempt=0123456789abcdef0123456789abcdef' ]
rm -f "$FILMOTT_SSE_READY_FILE" "$FILMOTT_SSE_CUTOVER_FILE" "$FILMOTT_SSE_FAILURE_FILE"
unset FILMOTT_SSE_READY_FILE FILMOTT_SSE_CUTOVER_FILE \
  FILMOTT_SSE_SUCCESS_FILE FILMOTT_SSE_FAILURE_FILE FILMOTT_SSE_ATTEMPT
FAIL_SSE=1
set +e
FILMOTT_EXPECTED_SLOT=blue blue_green_smoke_sse https://filmott.kr > /dev/null 2>&1
status=$?
set -e
assert_status 1 "$status" 'SSE error event'
unset FAIL_SSE

set +e
bash "${repo_root}/scripts/blue-green-smoke.sh" invalid > /dev/null 2>&1
status=$?
set -e
assert_status 64 "$status" 'direct execution guard'

echo 'Blue-green 연속 가용성 smoke 검증 통과'
