FROM postgres:18-alpine
# pgvector 버전: 0.8.0 (alpine 패키지 버전은 apk에 따라 다를 수 있음)
# 정확한 alpine 패키지 버전을 확인하려면: docker run --rm postgres:18-alpine apk list pgvector
RUN apk add --no-cache pgvector~=0.8
