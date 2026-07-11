#!/usr/bin/env bash

set -Eeuo pipefail

lock_file="${FILMOTT_OPS_LOCK_FILE:-/var/lock/filmott-ops.lock}"
exec 9>"$lock_file"
if ! flock -w 900 9; then
  echo "[$(date)] 다른 운영 작업이 실행 중이어서 Docker 정리를 중단합니다: ${lock_file}"
  exit 1
fi

# 데이터 복구용 컨테이너와 볼륨은 건드리지 않고 오래된 이미지와 빌드 캐시만 정리한다.
docker image prune -af --filter 'until=168h'
docker builder prune -af --filter 'until=168h'

echo "[$(date)] Docker 이미지와 빌드 캐시 정리 완료"
