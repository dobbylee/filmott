#!/usr/bin/env bash
# SSL 인증서 자동 갱신 스크립트
# crontab 등록: 0 0 1,15 * * cd /home/ubuntu/filmott && ./scripts/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1

set -Eeuo pipefail

lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"
exec 9>"$lock_file"
if ! flock -w 900 9; then
  echo "$(date): 다른 운영 작업이 실행 중이어서 인증서 갱신을 중단합니다: ${lock_file}"
  exit 1
fi

echo "$(date): SSL 인증서 갱신 시작"

docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "$(date): SSL 인증서 갱신 완료"
