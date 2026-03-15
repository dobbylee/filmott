#!/bin/bash
# SSL 인증서 자동 갱신 스크립트
# crontab 등록: 0 0 1,15 * * cd /home/ubuntu/filmott && ./scripts/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1

set -e

echo "$(date): SSL 인증서 갱신 시작"

docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "$(date): SSL 인증서 갱신 완료"
