# FilmOTT

OTT 콘텐츠 탐색, 감상 기록, 리뷰와 AI 추천 채팅을 제공하는 웹 애플리케이션이다.

## 구성

- `frontend`: Next.js 16, React 19
- `backend`: NestJS 11, TypeORM
- `postgres`: PostgreSQL 18 + pgvector 이미지
- `nginx`: 운영 reverse proxy와 SSE 설정
- `scripts`: 인증서, DB 백업/복원 검증, 운영 정리 스크립트

Node.js 24와 npm을 기준으로 한다.

## 로컬 실행

각 앱의 의존성을 설치한다.

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

백엔드 환경변수는 `backend/.env`에 준비하고 앱을 각각 실행한다.

```bash
npm --prefix backend run start:dev
npm --prefix frontend run dev
```

로컬 PostgreSQL은 루트의 `docker-compose.yml`로 실행할 수 있다. `.env*` 파일과 운영 비밀 값은 저장소에 커밋하지 않는다.

## 검증

```bash
# 단위 테스트, lint, build
npm run check

# PostgreSQL 통합 테스트
npm --prefix backend run test:integration

# 브라우저 smoke (fixture API + standalone 프론트 서버 자동 실행)
npm --prefix frontend run test:e2e
```

PostgreSQL 통합 테스트에는 `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`을 전달한다. 테스트 DB 이름에는 `test` 또는 `integration`이 포함되어야 한다.

## DB 변경

현재 스키마는 가능한 한 TypeORM 엔티티에 먼저 반영하고 migration 초안을 생성해 검토한다. 데이터 backfill, enum/extension, pgvector 인덱스처럼 구조화 API로 정확히 표현하기 어려운 작업만 raw SQL을 사용한다.

```bash
npm --prefix backend run migration:generate -- src/migrations/변경이름
npm --prefix backend run migration:run
```

`synchronize: false`를 유지하며, 이미 적용된 migration은 수정하지 않고 후속 migration으로 정합성을 맞춘다.

## CI/CD와 운영

`main` push에서 backend, PostgreSQL integration, frontend/Playwright, production config 검증을 병렬 실행한다. 모든 CI가 성공한 정확한 커밋만 운영 서버에 배포한다.

운영 작업은 `/var/lock/filmott-ops.lock`을 공유한다. DB는 매일 custom-format dump와 SHA-256 체크섬을 만들고, 주 1회 임시 DB에 실제 복원해 검증한다. 원격 보관은 서버의 `/home/ubuntu/.config/filmott-backup.env`에서 `BACKUP_REMOTE`를 rclone 대상 경로로 설정하면 활성화된다.
