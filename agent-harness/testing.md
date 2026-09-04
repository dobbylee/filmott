# 검증 실행 안내

명령의 실행 내용은 각 package.json과 CI가 정의한다. 아래는 작업별로 필요한 gate의 원본이다. 저장소 루트에서 실행한다.

## 기본·커밋·릴리즈 gate

| 적용 조건 | 명령 | 범위 |
| --- | --- | --- |
| backend 기본 | `npm run check:backend` | lint policy·lint·unit·HTTP boundary·build |
| frontend 기본 | `npm run check:frontend` | lint·typecheck·unit/MSW·runner 검사·격리 build |
| 두 앱 기본 | `npm run check` | 위 두 기본 검사. DB/e2e/인프라 완료를 뜻하지 않음 |
| 모든 backend 변경의 커밋 전 | 기본 + `npm --prefix backend run test:e2e` | 전체 Nest 앱·격리 PostgreSQL |
| schema/migration/relation/raw SQL·검색·랭킹·리뷰/감상기록 | 위 검사 + `npm --prefix backend run test:integration` | 실제 DB 정책·저장·query |
| frontend API client·인증·리뷰 변경 | frontend 기본의 MSW 결과 확인 | 성공/실패·refresh 재시도·payload |
| 주요 사용자 여정·릴리즈 | `npm --prefix frontend run test:e2e` | fixture 기반 standalone Playwright |
| ops/배포 설정 | `bash scripts/ops-safety.test.sh` | mock 기반 backup·blue-green·smoke 안전 회귀 |
| backend 전체 자동 gate | `npm run check:backend:full` | 기본 + e2e + integration, TEST_DB 설정 필요 |
| frontend 전체 자동 gate | `npm run check:frontend:full` | 기본 + Playwright |
| 릴리즈 자동 gate | `npm run check:release` | 하네스 + 두 앱 전체 + ops. 실제 Compose/Nginx·ARM64·운영 배포 검증은 아래 조건에 따라 별도 |

- lint는 검사 전용이고 자동 수정은 각 앱의 lint:fix에만 있다. Jest/Vitest는 각 앱 package의 test script로 호출한다.
- focused 테스트는 backend에서 `npm --prefix backend test -- --runInBand 파일패턴`, frontend에서 `npm --prefix frontend test -- 파일경로`로 실행한다.
- 전체 gate와 focused 결과의 재사용 조건은 [workflow](workflow.md)를 따른다. 같은 입력을 다시 검사하는 자동 반복을 추가하지 않는다.

## DB 검사

- `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`을 현재 프로세스에 주입한다. `.env*`를 수정하지 않는다.
- 기존 사용자 DB와 격리된 테스트 DB만 사용한다. 이름에는 test/integration이 있어야 하며 pgvector가 필요하다. 테스트는 데이터를 초기화한다.
- DB 설정이 없으면 필수 e2e/integration은 실패해야 한다. 선택 실행용 test:integration:optional을 필수 gate 대신 사용하지 않는다.
- 테스트 전용 container를 만들었다면 이름·port·image를 기록하고 종료 뒤 그 container만 정리한다. 사용자 container·volume은 변경하지 않는다.

## 브라우저·서버

- Playwright가 소유하는 fixture/app 서버만 테스트 시작·종료에 맞춰 관리한다. 기존 개발 서버를 재사용하거나 포트를 비우려고 종료하지 않는다.
- 기본 포트는 3200(app)/3201(fixture)이다. E2E_FRONTEND_PORT/E2E_FIXTURE_BACKEND_PORT로 바꿀 수 있다. URL override도 사용하는 경우 해당 포트와 일치시킨다.
- build:check와 Playwright app은 frontend/.harness의 고유 source snapshot에서 빌드한다. .next·next-env.d.ts·tsconfig 생성 변경은 snapshot에만 남고 종료 시 정리한다. node_modules는 설치된 의존성을 연결해 사용한다.
- 격리 빌드는 .env 파일을 복사하지 않는다. 빌드에 필요한 값은 실행 환경으로 명시한다. `npm --prefix frontend run build`는 기존 배포용 명령이며 개발 .next를 쓸 수 있으므로 개발 서버와 동시에 실행하지 않는다.
- fixture API 테스트는 실제 backend/DB/OpenAI 검증을 대신하지 않는다. 실제 SSE/OpenAI smoke는 비용이 드는 명시적 opt-in이다.
- 일반 빌드와 fixture API 환경의 빌드는 다른 검증이다. 환경이 다른 산출물을 재사용해 통과시키지 않는다.

## 인프라·배포

- Compose 개발/운영 config, Nginx `nginx -t`, image ARM64 build, migration 로컬 실행을 변경 조건에 맞게 수행한다.
- CI는 main push에서 앱 기본 검사, backend DB e2e/integration, frontend Playwright, production config/ops를 실행한다.
- Deploy는 exact SHA CI 이후 검증된 blue-green script로 전환한다. script의 reload/drain/rollback 순서를 우회해 임의 Nginx 재시작을 추가하지 않는다.
- 실제 배포 결과는 CI와 별도로 active SHA/slot, HTTP/API·필요 UI/SSE와 오류 상태를 확인한다. 상세 운영 명령은 scripts와 해당 작업 계획을 참조한다.

## 문서·하네스

- `npm run check:harness`로 공통 문서 링크·명령 존재와 검사기의 negative control을 검증한다. 로컬 자료는 `node scripts/check-harness.mjs docs/current-task.md docs/TESTING.md`처럼 이번 대상만 추가한다.
- reviewer 설정과 출력 계약, 의도한 파일 목록도 확인한다. 읽기 전용 문서 수정만으로 앱 전체 gate를 강제하지 않는다.
- tracked 공통 안내에 로컬 ignored 문서의 존재를 필수 조건으로 만들지 않는다. 로컬 문서는 활성 작업에 지정된 파일만 검사한다.
- 하네스 동작 변경은 실제 금지 사례가 실패하는 negative control을 포함한다. 모든 과거 사건을 영구 규칙이나 snapshot assertion으로 고정하지 않는다.
