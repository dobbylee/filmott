#!/bin/bash
# SSL 인증서 초기 발급 스크립트
# 사용법: ./scripts/init-ssl.sh filmott.kr admin@filmott.kr

set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "사용법: $0 <domain> <email>"
  echo "예시: $0 filmott.kr admin@filmott.kr"
  exit 1
fi

echo "=== SSL 초기 설정 시작: $DOMAIN ==="

# 1. 더미 인증서 생성 (Nginx가 기동할 수 있도록)
echo "1. 더미 인증서 생성 중..."
mkdir -p ./certbot/conf/live/$DOMAIN ./certbot/www
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout ./certbot/conf/live/$DOMAIN/privkey.pem \
  -out ./certbot/conf/live/$DOMAIN/fullchain.pem \
  -subj "/CN=$DOMAIN" 2>/dev/null

# 2. Nginx + 앱 기동
echo "2. 서비스 기동 중..."
docker compose -f docker-compose.prod.yml up -d

# 3. 더미 인증서 제거
echo "3. 더미 인증서 제거 중..."
rm -rf ./certbot/conf/live/$DOMAIN

# 4. certbot으로 실제 인증서 발급
echo "4. Let's Encrypt 인증서 발급 중..."
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d $DOMAIN -d www.$DOMAIN \
  --email $EMAIL --agree-tos --no-eff-email

# 5. Nginx 재시작 (새 인증서 적용)
echo "5. Nginx 재시작 중..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "=== SSL 설정 완료! ==="
