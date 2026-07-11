#!/usr/bin/env bash
# SSL 인증서 초기 발급 스크립트
# 사용법: ./scripts/init-ssl.sh filmott.kr admin@filmott.kr

set -Eeuo pipefail

domain="${1:-}"
email="${2:-}"

if [ -z "$domain" ] || [ -z "$email" ]; then
  echo "사용법: $0 <domain> <email>"
  echo "예시: $0 filmott.kr admin@filmott.kr"
  exit 1
fi

if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "올바르지 않은 domain 형식입니다: ${domain}" >&2
  exit 1
fi

cert_dir="./certbot/conf/live/${domain}"
archive_dir="./certbot/conf/archive/${domain}"
renewal_file="./certbot/conf/renewal/${domain}.conf"
if [ -e "${cert_dir}/fullchain.pem" ] ||
  [ -e "${cert_dir}/privkey.pem" ] ||
  [ -d "$archive_dir" ] ||
  [ -e "$renewal_file" ]; then
  echo "기존 인증서가 있어 초기 발급을 중단합니다: ${domain}" >&2
  echo "갱신은 scripts/renew-ssl.sh를 사용하세요." >&2
  exit 1
fi

lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"
exec 9>"$lock_file"
if ! flock -w 900 9; then
  echo "다른 운영 작업이 실행 중이어서 SSL 초기 설정을 중단합니다: ${lock_file}" >&2
  exit 1
fi

dummy_dir="$(mktemp -d)"
certificate_issued=0
cleanup() {
  if [ "$certificate_issued" = "0" ]; then
    mkdir -p "$cert_dir"
    [ -e "${cert_dir}/privkey.pem" ] ||
      cp "${dummy_dir}/privkey.pem" "${cert_dir}/privkey.pem"
    [ -e "${cert_dir}/fullchain.pem" ] ||
      cp "${dummy_dir}/fullchain.pem" "${cert_dir}/fullchain.pem"
  fi
  rm -f "${dummy_dir}/privkey.pem" "${dummy_dir}/fullchain.pem"
  rmdir "$dummy_dir" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== SSL 초기 설정 시작: ${domain} ==="

# 1. 더미 인증서 생성 (Nginx가 기동할 수 있도록)
echo "1. 더미 인증서 생성 중..."
mkdir -p "$cert_dir" ./certbot/www
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "${dummy_dir}/privkey.pem" \
  -out "${dummy_dir}/fullchain.pem" \
  -subj "/CN=${domain}" 2>/dev/null
cp "${dummy_dir}/privkey.pem" "${cert_dir}/privkey.pem"
cp "${dummy_dir}/fullchain.pem" "${cert_dir}/fullchain.pem"

# 2. Nginx + 앱 기동
echo "2. 서비스 기동 중..."
docker compose -f docker-compose.prod.yml up -d

# 3. 더미 인증서 제거
echo "3. 더미 인증서 제거 중..."
rm -f "${cert_dir}/privkey.pem" "${cert_dir}/fullchain.pem"
rmdir "$cert_dir"

# 4. certbot으로 실제 인증서 발급
echo "4. Let's Encrypt 인증서 발급 중..."
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d "$domain" -d "www.${domain}" \
  --email "$email" --agree-tos --no-eff-email
certificate_issued=1

# 5. Nginx 재시작 (새 인증서 적용)
echo "5. Nginx 재시작 중..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "=== SSL 설정 완료! ==="
