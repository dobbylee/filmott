# filmott 작업 규칙

## 필요한 컨텍스트만 읽는다

- 이 파일이 현재 지침에 포함돼 있으면 다시 읽지 않는다. 작업 중 파일이 바뀌었을 때만 갱신한다.
- 읽기 전용 조사: 요청한 파일·직접 의존만 확인한다. 구현 절차·전체 계획을 자동으로 읽지 않는다.
- 구현: [workflow](agent-harness/workflow.md)와 [검증 안내](agent-harness/testing.md)를 읽고, 로컬 `docs/current-task.md`가 있으면 현재 작업과 관련 Phase만 확인한다. 없으면 사용자 요청을 기준으로 진행한다.
- 독립 리뷰: [리뷰 프롬프트](agent-harness/prompts/implementation-review.md)와 전달받은 범위를 사용한다. 전체 계획·과거 작업·workflow를 반복 로딩하지 않는다.
- 영구 규칙 추가: 그때만 [승격 기준](agent-harness/promotion.md)을 적용한다. 같은 규칙을 여러 문서에 복사하지 않는다.

## 범위와 계획

- 기존 코드 패턴·사용자 변경을 먼저 확인하고 보존한다. 요청 밖 추상화·리팩터링·포맷 변경은 하지 않는다.
- 구현 전 성공 조건과 변경하지 않을 범위를 정한다. 기본 구현은 단일 agent이며 독립 reviewer의 적용·완료 기준은 workflow를 따른다.
- 기능 추가·구조 변경·여러 파일 또는 위험한 수정은 계획 문서가 필요한지 먼저 확인한다. 사용자가 구체 추천안 전체 진행을 이미 승인했으면 해당 내용을 실행 계획으로 기록하고 진행한다.
- 계획만 요청·승인한 경우 새 `docs/plans/YYYY-MM-DD_제목.md`에 목표·현재 구조·Phase별 파일/검증/리스크를 작성하고 확인 단계에서 멈춘다. 작은 오타·문구 수정은 생략할 수 있다.
- 기존 계획을 대체할 때 새 문서로 만들고 활성 작업 기록을 갱신한다. 진행 중 계획 보완은 같은 활성 문서에 이유를 기록한다. 구현 범위 확대 승인이 필요하면 해당 작업 전에 확인한다.

## 코드 계약

- 프로덕션에 `any`를 추가하지 않는다. JSON/API/cookie/request/raw SQL 입력은 `unknown`에서 타입을 좁힌다.
- TypeORM `getRawOne`, `getRawMany`, `queryRunner.query` 결과 타입을 명시한다. lint 규칙 완화 대신 구조를 수정하고 필요한 예외는 테스트 파일에만 둔다.
- 테스트 설명은 한국어로 쓴다. 검사와 자동 수정을 구분하고 명령·필수 gate는 검증 안내를 따른다.
- UX를 우선하며 주요 버튼은 `from-fuchsia-700 to-indigo-600` 그라데이션을 우선 사용한다.
- Pagination 마지막 페이지 버튼은 API 10000건 제한 정책에 따라 표시하지 않는다.

## 승인·데이터 경계

- `.env*`는 명시 요청 없이 수정하지 않는다. 사용자 작업을 되돌리거나 다른 변경을 staging하지 않는다.
- push, 파괴적 초기화·삭제는 명시 승인 범위에서만 수행한다. 이미 push한 커밋에 amend하지 않는다.
- ignored 문서는 기본적으로 로컬에 둔다. ignored 파일의 커밋을 명시 요청받은 경우에만 force add한다.
- DB `synchronize: false`를 유지한다. schema 변경은 migration/구조화 QueryRunner API를 우선하며 필요한 raw SQL의 이유·변환/롤백 영향을 기록한다.
- CASCADE 삭제는 영향 테이블을 제시하고 승인받는다. 백업 dump는 복원 확인 전에 삭제하지 않는다. 운영 DB 변경은 backup/restore 상태를 먼저 확인한다.

## 서버·배포 경계

- 사용자 개발 서버를 시작·종료·재시작하지 않는다. 별도 수동 테스트 서버를 방치하지 않는다.
- 검증 안내에 정의한 테스트 러너 소유의 격리 서버/DB는 허용한다. 충돌하면 기존 프로세스를 종료하거나 재사용하지 않고 실패한다. 테스트가 만든 프로세스·임시 자원만 정리한다.
- Docker image 변경은 push 전 `docker build --platform linux/arm64`, migration은 로컬 `npm run migration:run` 성공을 확인한다.
- 운영 전환은 검증된 blue-green script의 reload·복구 순서를 따른다. 컨테이너 재생성으로 upstream 갱신이 필요하면 해당 운영 절차의 Nginx 검증·reload 또는 재시작을 수행한다.
- 배포는 exact SHA의 CI/Deploy·active slot과 외부 `https://filmott.kr` HTTP 200을 확인한다. 필요한 API/UI/SSE·오류 확인을 함께 보고한다.
