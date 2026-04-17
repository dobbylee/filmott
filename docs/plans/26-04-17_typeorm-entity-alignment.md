# TypeORM 엔티티-마이그레이션 정합성 개선 계획

> 작성일: 2026-04-17
> 범위: backend TypeORM 엔티티와 이미 적용된 DB 스키마의 정합성 회복
> 목표: 엔티티를 현재 스키마의 기준 문서로 만들고, raw SQL은 데이터 이전/DB 특화 작업에만 제한

---

## 배경

현재 backend는 TypeORM 엔티티와 수동 작성한 migration을 함께 사용하고 있다. 기능 개발 과정에서 raw SQL migration이 빠르게 늘었고, 그 결과 현재 스키마 중 일부가 엔티티에 반영되지 않은 상태다.

이 상태의 문제는 다음과 같다.

- 엔티티만 읽어서는 실제 인덱스/제약/관계 동작을 완전히 알 수 없다.
- migration을 열어보지 않으면 현재 스키마를 오해할 수 있다.
- `migration:generate`를 다시 쓰기 시작할 때 불필요한 diff가 생길 수 있다.
- 관계 옵션(`onDelete`)이나 특수 컬럼 타입(`vector`)이 엔티티와 실제 DB에서 다르게 표현돼 유지보수성이 떨어진다.

이번 정리는 과거 migration을 전면 재작성하는 작업이 아니다. 이미 적용된 migration 이력은 유지하고, **현재 스키마를 엔티티에 최대한 반영**하는 것을 1차 목표로 둔다.

---

## 원칙

### 1. 엔티티를 현재 스키마의 기준으로 삼는다

- 컬럼 타입
- nullable / default
- unique
- 일반 index
- partial index
- relation + `onDelete`

위 항목은 가능한 한 엔티티에 반영한다.

### 2. raw SQL은 예외 상황에만 사용한다

아래 항목은 앞으로도 수동 migration이 더 적절하다.

- 기존 데이터 backfill / 정규화 / 정리
- enum type 생성/변경
- extension 설치 (`pgvector`)
- HNSW / IVFFlat 같은 DB 특화 인덱스
- 제거된 테이블/제약 처리
- 기존 constraint 이름 탐색 후 삭제하는 방어적 migration

### 3. 과거 migration을 갈아엎지 않는다

- 이미 실행된 migration은 가능한 한 수정하지 않는다.
- 정합성 회복은 현재 엔티티 수정 + 필요한 후속 migration 추가로 해결한다.

---

## 현재 확인된 불일치

### P0. 실제 스키마와 엔티티 표현이 어긋난 항목

#### 1. `content_metadata.embedding` 타입 불일치

- DB migration: `vector(1536)`
- 현재 엔티티: `varchar`
- 관련 파일:
  - `backend/src/chat/entities/content-metadata.entity.ts`
  - `backend/src/migrations/1774000000000-CreateContentMetadata.ts`

영향:
- 엔티티만 보면 pgvector 사용 여부를 알기 어렵다.
- 스키마 생성/비교 시 잘못된 diff를 유발할 수 있다.

조치:
- 엔티티 컬럼 타입을 `vector`로 맞춘다.
- 차원 길이 `1536`도 엔티티에 명시한다.
- 애플리케이션 코드에서 현재처럼 string/raw query를 쓰더라도, 스키마 타입은 정확히 표현한다.

#### 2. `content_metadata.content` relation의 `onDelete: 'CASCADE'` 누락

- DB migration에는 `REFERENCES "contents"("id") ON DELETE CASCADE`
- 엔티티에는 relation 옵션 없음

조치:
- `@ManyToOne(() => Content, { onDelete: 'CASCADE' })`로 수정

#### 3. `watchlist.user`, `watchlist.content` relation의 `onDelete: 'CASCADE'` 누락

- DB migration에는 두 FK 모두 `ON DELETE CASCADE`
- 엔티티에는 relation 옵션 없음

조치:
- `Watchlist` 엔티티의 두 relation에 `onDelete: 'CASCADE'` 추가

---

### P1. DB에 존재하지만 엔티티에서 표현하지 않는 인덱스

#### 1. `watchlist` 목록 조회용 인덱스

- migration: `IDX_watchlist_user_status (user_id, status)`
- 현재 엔티티: 없음

조치:
- `Watchlist` 엔티티에 `@Index('IDX_watchlist_user_status', ['userId', 'status'])` 추가

#### 2. `refresh_tokens` 보조 인덱스 일부 누락

- migration:
  - `IDX_refresh_tokens_token`
  - `IDX_refresh_tokens_user`
  - `IDX_refresh_tokens_expires`
- 현재 엔티티:
  - `token`만 `@Index()` 존재
  - `userId`, `expiresAt` 인덱스 없음

조치:
- `RefreshToken` 엔티티에 명시적 이름의 `@Index` 추가
- `token` 인덱스도 이름을 migration과 맞추는 방향 검토

#### 3. `contents` 검색 보조 인덱스 누락

- migration:
  - `idx_contents_content_type`
  - `idx_contents_release_date`
  - `idx_contents_origin_country`
  - `idx_contents_vote_count`
- 현재 엔티티: 없음

조치:
- `Content` 엔티티에 일반 인덱스를 추가

주의:
- `vote_count DESC` 인덱스는 TypeORM 데코레이터만으로 정렬 방향을 완전히 표현하기 어렵다.
- 이 항목은 엔티티에 단순 인덱스를 표시할지, 수동 migration 전용으로 남길지 선택이 필요하다.

권장:
- `content_type`, `release_date`, `origin_country`는 엔티티에 올린다.
- `vote_count DESC`는 수동 migration 유지 후 엔티티에는 주석/문서로 남긴다.

#### 4. `rankings` 보조 인덱스 누락

- migration: `idx_rankings_content_source (content_id, source)`
- 현재 엔티티: 없음

조치:
- `Ranking` 엔티티에 `@Index('idx_rankings_content_source', ['contentId', 'source'])` 추가

---

### P1. partial index 표현 정리

#### 1. `contents.adult` 관련 인덱스 설계 재점검 필요

현재 migration 이력:

- `1774500000000-AddContentAdult.ts`
  - `idx_contents_adult` on `("adult") WHERE "adult" = true`
- `1774975764322-AddAdultPartialIndex.ts`
  - `idx_contents_adult` on `("tmdb_id", "content_type") WHERE adult = true`

문제:
- 같은 이름 `idx_contents_adult`를 서로 다른 정의로 사용하고 있다.
- 두 번째 migration은 `IF NOT EXISTS`라서 기존 인덱스가 있으면 실제로는 새 인덱스가 생성되지 않았을 가능성이 있다.
- 현재 이름만 봐서는 어떤 인덱스가 실제로 존재하는지 알기 어렵다.

조치:
- 실제 DB 인덱스 상태를 먼저 확인한다.
- 의도한 인덱스를 하나로 정리할지, 역할별로 두 개로 분리할지 결정한다.
- 이름도 용도에 맞게 분리한다. 예:
  - `idx_contents_adult_flag`
  - `idx_contents_adult_lookup`

권장:
- `adult = true` 필터링 목적과 `(tmdb_id, content_type)` 조회 목적이 다르면 별도 이름으로 분리한다.
- partial index 자체는 엔티티 `@Index(..., { where: ... })`로 표현 가능하지만, 이미 이름 충돌 이력이 있으므로 후속 migration으로 명시 정리하는 것이 안전하다.

---

## 유지해야 할 raw SQL migration

아래는 엔티티로 대체하려 하지 않는다.

### 데이터 이전 / backfill

- `1773500000000-AddRankingTargetDate.ts`
- `1773600000000-AddUserStatusAndRole.ts`
- `1774977300000-AlignReviewAndDefaultColumns.ts`

### 제약/상태를 방어적으로 다루는 migration

- `1774977100000-DropUserEmailUnique.ts`
- `1774977000000-MakeUserEmailNullable.ts` down
- `1774977200000-MakeUserPasswordNullable.ts` down

### DB 특화 기능

- `1773950000000-EnablePgvector.ts`
- `1774000000000-CreateContentMetadata.ts`
- `1774300000000-SwitchToHnswIndex.ts`

### 제거/정리 작업

- `1774100000000-DropChatTables.ts`

---

## 실행 계획

## Phase 1. 엔티티를 현재 스키마에 맞추기

### 변경 대상

- `backend/src/watchlist/watchlist.entity.ts`
- `backend/src/auth/entities/refresh-token.entity.ts`
- `backend/src/contents/content.entity.ts`
- `backend/src/rankings/ranking.entity.ts`
- `backend/src/chat/entities/content-metadata.entity.ts`

### 작업 목록

1. `Watchlist`에 조회용 복합 인덱스 추가
2. `Watchlist` relation에 `onDelete: 'CASCADE'` 반영
3. `RefreshToken`의 `userId`, `expiresAt` 인덱스 반영
4. `Content`의 일반 검색 인덱스 반영
5. `Ranking`의 `contentId + source` 인덱스 반영
6. `ContentMetadata.embedding`을 `vector(1536)`로 수정
7. `ContentMetadata.content` relation에 `onDelete: 'CASCADE'` 반영

산출물:
- 엔티티만 읽어도 현재 스키마 핵심 구조를 이해할 수 있는 상태

---

## Phase 2. `adult` 인덱스 구조 정리

### 선행 확인

로컬/프로덕션에서 다음 확인이 필요하다.

- 현재 `contents` 테이블에 실제로 존재하는 `idx_contents_adult` 정의
- 쿼리 패턴:
  - `WHERE adult = true`
  - `WHERE adult = true AND tmdb_id = ? AND content_type = ?`

### 작업 목록

1. 실제 사용 쿼리 기준으로 필요한 인덱스 형태 확정
2. 이름 충돌 없는 새 인덱스명 설계
3. 후속 migration으로 인덱스 정리
4. 가능하면 엔티티 `@Index(..., { where: ... })`에도 반영

주의:
- 이미 배포된 migration 이름/정의 충돌을 억지로 수정하지 않는다.
- 후속 migration으로 새 인덱스를 만들고, 구 인덱스를 안전하게 제거한다.

---

## Phase 3. 문서/운영 규칙 정리

### 문서화할 내용

- 엔티티에 반영된 스키마와 raw SQL 전용 항목의 경계
- pgvector/HNSW는 엔티티 + 수동 migration 혼합 관리 대상이라는 점
- 향후 스키마 변경 절차

### 권장 개발 절차

1. 엔티티를 먼저 수정한다.
2. `migration:generate`로 초안을 만든다.
3. 생성된 migration을 검토한다.
4. 아래 항목만 수동으로 보강한다.
   - rename
   - backfill
   - extension
   - partial index
   - custom operator class / index method
   - seed / data fix

---

## 검증 계획

엔티티 정리 후 아래를 수행한다.

### backend 검증

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build`

### 스키마 검증

- 엔티티 수정 후 `migration:generate` 결과를 확인해 예상 밖 diff가 생기지 않는지 검토
- 특히 아래를 중점 확인
  - `vector(1536)` 타입 인식
  - relation `onDelete`
  - partial index / named index 동작

---

## 결정 사항

### 이번 작업에서 하지 않을 것

- 과거 migration 파일 전면 재작성
- 초기 migration을 엔티티 자동 생성 스타일로 교체
- 데이터 backfill migration을 decorator만으로 대체

### 이번 작업에서 반드시 할 것

- 현재 스키마와 어긋나는 엔티티 표현 수정
- 누락된 핵심 인덱스/관계 옵션을 엔티티에 반영
- `adult` 인덱스 충돌 가능성 조사 및 후속 정리 계획 수립

---

## 우선순위 요약

### 바로 수정

1. `content_metadata.embedding` 타입
2. `watchlist` / `content_metadata` relation `onDelete`
3. `watchlist`, `refresh_tokens`, `rankings` 인덱스 누락
4. `contents` 일반 검색 인덱스 반영

### 조사 후 수정

1. `contents.adult` 인덱스 구조
2. `vote_count DESC` 인덱스를 엔티티에 어디까지 반영할지

### raw SQL 유지

1. backfill / seed / enum / extension / HNSW

