#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_id="$$"
network="filmott-nginx-dns-${test_id}"
backend_first="filmott-nginx-dns-backend-first-${test_id}"
backend_second="filmott-nginx-dns-backend-second-${test_id}"
proxy="filmott-nginx-dns-proxy-${test_id}"

cleanup() {
  docker rm -f "$proxy" "$backend_first" "$backend_second" > /dev/null 2>&1 || true
  docker network rm "$network" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" > /dev/null
docker run -d --name "$backend_first" --network "$network" \
  --network-alias backend-blue nginx:alpine > /dev/null
docker run -d --name "$proxy" --network "$network" \
  -v "$repo_root/scripts/fixtures/nginx-docker-dns.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine > /dev/null

wait_for_proxy() {
  for attempt in 1 2 3 4 5; do
    if docker exec "$proxy" wget -q -O /dev/null http://127.0.0.1:8080/; then
      return 0
    fi
    sleep 1
  done
  return 1
}

first_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$backend_first")"
[ -n "$first_ip" ] || { echo '첫 backend IP를 확인하지 못했습니다.' >&2; exit 1; }
wait_for_proxy || { echo '첫 backend 연결을 확인하지 못했습니다.' >&2; exit 1; }

docker rm -f "$backend_first" > /dev/null
docker run -d --name "$backend_second" --network "$network" \
  --network-alias backend-blue nginx:alpine > /dev/null
second_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$backend_second")"
[ -n "$second_ip" ] || { echo '재시작 backend IP를 확인하지 못했습니다.' >&2; exit 1; }
[ "$first_ip" != "$second_ip" ] || {
  echo '검증 환경에서 backend IP가 바뀌지 않았습니다.' >&2
  exit 1
}

if wait_for_proxy; then
  printf 'Nginx Docker DNS 재해석 검증 통과: %s -> %s\n' "$first_ip" "$second_ip"
  exit 0
fi

echo 'Nginx가 재시작된 backend의 새 Docker IP로 연결하지 못했습니다.' >&2
exit 1
