#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/filmott-nginx-dns.XXXXXX")"
test_id="$(basename "$test_root")"
network=''
containers=()
proxy=''
active_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
target_sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$proxy" ]; then
    docker logs --tail 60 "$proxy" >&2 || true
  fi
  for container in "${containers[@]}"; do
    docker rm -f "$container" > /dev/null 2>&1 || true
  done
  [ -z "$network" ] || docker network rm "$network" > /dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT

export FILMOTT_REPO_ROOT="$repo_root"
export FILMOTT_DEPLOY_STATE_DIR="$test_root/runtime"
export FILMOTT_UPSTREAM_FILE="$test_root/runtime/upstreams.conf"
export FILMOTT_RELEASE_FILE="$test_root/runtime/active-release"
export FILMOTT_ROLLBACK_FILE="$test_root/runtime/rollback.conf"
export FILMOTT_UNCERTAIN_FILE="$test_root/runtime/uncertain"
source "$repo_root/scripts/deploy-blue-green.sh"
mkdir -p "$test_root/certs/live/filmott.kr" "$test_root/runtime"
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 1 \
  -subj '/CN=filmott.kr' \
  -keyout "$test_root/certs/live/filmott.kr/privkey.pem" \
  -out "$test_root/certs/live/filmott.kr/fullchain.pem" > /dev/null 2>&1

# 운영 설정 자체를 검증한다. 변이 실행만 명시 override로 지원한다.
proxy_config="${FILMOTT_NGINX_CONFIG_UNDER_TEST:-$repo_root/nginx/nginx.conf}"
# 이전 설정의 single-file mount를 유지한 채 Git checkout까지 실행한다.
export FILMOTT_REPO_ROOT="$test_root/checkout"
mkdir -p "$FILMOTT_REPO_ROOT/nginx"
sed -e 's|proxy_pass http://\$filmott_active_backend;|proxy_pass http://backend;|' \
  -e 's|proxy_pass http://\$filmott_active_frontend;|proxy_pass http://frontend;|' \
  -e '/set \$filmott_active_backend /d' -e '/set \$filmott_active_frontend /d' \
  "$repo_root/nginx/nginx.conf" > "$FILMOTT_REPO_ROOT/nginx/nginx.conf"
cp "$repo_root/nginx/security-headers.conf" "$FILMOTT_REPO_ROOT/nginx/"
git -C "$FILMOTT_REPO_ROOT" init -q
git -C "$FILMOTT_REPO_ROOT" config user.name fixture
git -C "$FILMOTT_REPO_ROOT" config user.email fixture@example.invalid
git -C "$FILMOTT_REPO_ROOT" add nginx
git -C "$FILMOTT_REPO_ROOT" -c commit.gpgsign=false commit -qm old
old_config_sha="$(git -C "$FILMOTT_REPO_ROOT" rev-parse HEAD)"
cp "$proxy_config" "$FILMOTT_REPO_ROOT/nginx/nginx.conf"
git -C "$FILMOTT_REPO_ROOT" add nginx
git -C "$FILMOTT_REPO_ROOT" -c commit.gpgsign=false commit -qm new
new_config_sha="$(git -C "$FILMOTT_REPO_ROOT" rev-parse HEAD)"
git -C "$FILMOTT_REPO_ROOT" reset --hard "$old_config_sha" > /dev/null
network="$(docker network create "$test_id")"

start_fixture() {
  local identity="$1"
  shift
  fixture_id="$(docker create --name "$test_id-$identity" --network "$network" \
    "$@" -e "FIXTURE_ID=$identity" \
    -v "$repo_root/scripts/fixtures/nginx-docker-dns-server.cjs:/fixture.cjs:ro" \
    node:24-alpine node /fixture.cjs)"
  containers+=("$fixture_id")
  docker start "$fixture_id" > /dev/null
  for attempt in $(seq 1 15); do
    if docker exec "$fixture_id" node -e \
      'fetch("http://127.0.0.1:3001/api/", {signal: AbortSignal.timeout(1000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'; then
      return 0
    fi
    sleep 1
  done
  docker logs "$fixture_id" >&2 || true
  return 1
}

start_fixture blue-first --network-alias backend-blue --network-alias frontend-blue
first="$fixture_id"
start_fixture green --network-alias backend-green --network-alias frontend-green

# 운영의 이전 5줄 형식을 고정한 fixture로 새 writer와 독립적으로 확인한다.
printf '%s\n' \
  'map $host $filmott_active_slot { default "blue"; }' \
  "map \$host \$filmott_active_sha { default \"$active_sha\"; }" \
  'map $host $filmott_previous_frontend { default "frontend-blue:3000"; }' \
  'upstream frontend { server frontend-blue:3000; }' \
  'upstream backend { server backend-blue:3001; }' > "$FILMOTT_UPSTREAM_FILE"
cp "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_ROLLBACK_FILE"
blue_green_write_release blue "$active_sha"

proxy="$(docker create --name "$test_id-proxy" --network "$network" \
  -v "$FILMOTT_REPO_ROOT/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$FILMOTT_REPO_ROOT/nginx/security-headers.conf:/etc/nginx/security-headers.conf:ro" \
  -v "$test_root/runtime:/etc/nginx/runtime:ro" \
  -v "$test_root/certs:/etc/letsencrypt:ro" nginx:alpine)"
containers+=("$proxy")
docker start "$proxy" > /dev/null
docker exec "$proxy" nginx -t

request() {
  docker exec "$proxy" curl --http1.1 -ksS --max-time 3 \
    --resolve filmott.kr:443:127.0.0.1 -D - "$@"
}
expect_response() {
  local identity="$1" path="$2" slot="$3" sha="$4"
  local output='' headers=''
  local port=3000
  [[ "$path" != /api/* ]] || port=3001
  for attempt in $(seq 1 20); do
    output="$(request "https://filmott.kr$path" 2>&1)" || true
    headers="$(printf '%s\n' "$output" | sed '/^\r$/q' | tr '[:upper:]' '[:lower:]')"
    if [[ "$output" == *'200 OK'* && "$output" == *"\"identity\":\"$identity\""* && "$output" == *"\"port\":$port"* &&
          "$headers" == *"x-filmott-slot: $slot"* && "$headers" == *"x-filmott-sha: $sha"* ]]; then
      return 0
    fi
    sleep 1
  done
  printf '기대 응답 실패: %s %s %s\n%s\n' "$identity" "$path" "$slot" "$output" >&2
  return 1
}

# 실제 reload·identity·rollback을 사용하고 Compose 대상만 격리 컨테이너로 치환한다.
blue_green_compose() {
  if [ "$1" = exec ] && [ "$2" = -T ] && [ "$3" = nginx ]; then
    shift 3
    docker exec "$proxy" "$@"
  elif [ "$*" = 'rm -sf frontend-green backend-green' ]; then
    : # rollback 순서 검사는 blue-green-deploy.test.sh가 담당한다.
  else
    echo "허용하지 않은 검증용 Compose 호출: $*" >&2
    return 1
  fi
}
blue_green_origin_headers() { request https://filmott.kr/; }
# image label/SHA tag 계약은 별도 상태 전이 검사에서 검증한다.
blue_green_assert_slot() { [ "$1" = blue ] && [ "$2" = "$active_sha" ]; }

expect_response blue-first /api/ blue "$active_sha"
blue_green_preflight
blue_green_assert_nginx_config_mounts
cmp -s "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_ROLLBACK_FILE"
blue_green_checkout_target "$new_config_sha"
blue_green_assert_nginx_config_mounts
blue_green_write_upstream "$FILMOTT_UPSTREAM_FILE" green "$target_sha" blue
blue_green_reload_nginx
expect_response green /api/ green "$target_sha"
fallback="$(request 'https://filmott.kr/_next/static/old.js?v=1')"
[[ "$fallback" == *'200 OK'* && "$fallback" == *'"identity":"blue-first"'* && "$fallback" == *'"port":3000'* &&
   "$fallback" == *'"url":"/_next/static/old.js?v=1"'* ]] || {
  echo '이전 슬롯 정적 자산 fallback이 깨졌습니다.' >&2; exit 1;
}
BLUE_GREEN_ACTIVE_SLOT=blue
BLUE_GREEN_ACTIVE_SHA="$active_sha"
BLUE_GREEN_INACTIVE_SLOT=green
blue_green_rollback
expect_response blue-first /api/ blue "$active_sha"
cmp -s "$FILMOTT_UPSTREAM_FILE" "$FILMOTT_ROLLBACK_FILE"
blue_green_preflight
blue_green_write_upstream "$FILMOTT_UPSTREAM_FILE" blue "$active_sha"
blue_green_reload_nginx
expect_response blue-first /api/ blue "$active_sha"
blue_green_preflight

for path in '/api/echo?q=a%2Fb&n=2' '/api/chat/messages?q=a%2Fb&n=2' '/discover?q=a%2Fb&n=2'; do
  port=3000
  [[ "$path" != /api/* ]] || port=3001
  output="$(request -X POST -H 'Cookie: fixture=yes' -H 'Authorization: Bearer fixture' \
    --data 'fixture-body' "https://filmott.kr$path")"
  for fragment in '"identity":"blue-first"' "\"port\":$port" "\"url\":\"$path\"" '"method":"POST"' \
    '"cookie":"fixture=yes"' '"authorization":"Bearer fixture"' '"host":"filmott.kr"' '"body":"fixture-body"'; do
    [[ "$output" == *"$fragment"* ]] || { echo "경로/헤더/본문 전달 실패: $path $fragment" >&2; exit 1; }
  done
  if [[ "$path" == /api/chat/* ]]; then
    [[ "$output" == *'text/event-stream'* && "$output" == *'event: done'* ]]
  fi
done
output="$(request https://filmott.kr/internal/revalidate)"
[[ "$output" == *'403 Forbidden'* ]] || { echo '내부 경로 외부 차단 실패' >&2; exit 1; }

# 기존 컨테이너가 IP를 보유한 동안 교체 대상을 준비해 IP 차이를 보장한다.
# 응답 식별값까지 검사하므로 예전 IP에서200이 돌아와도 통과하지 않는다.
start_fixture blue-second --network-alias backend-blue --network-alias frontend-blue
second="$fixture_id"
first_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$first")"
second_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$second")"
[ -n "$first_ip" ] && [ -n "$second_ip" ] && [ "$first_ip" != "$second_ip" ]
docker network disconnect "$network" "$first"

# 여기부터 proxy reload/restart 없이 실제10초 TTL의 DNS 갱신을 확인한다.
expect_response blue-second /api/ blue "$active_sha"
expect_response blue-second /api/chat/messages blue "$active_sha"
expect_response blue-second / blue "$active_sha"
output="$(request 'https://filmott.kr/_next/static/new.js?v=2')"
[[ "$output" == *'200 OK'* && "$output" == *'"identity":"blue-second"'* && "$output" == *'"port":3000'* &&
   "$output" == *'"url":"/_next/static/new.js?v=2"'* ]]
printf '운영 Nginx 구/신 형식·rollback·API/SSE·frontend 새IP 검증 통과: %s -> %s\n' "$first_ip" "$second_ip"
