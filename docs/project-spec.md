# filmott - 영화/OTT 커뮤니티 서비스 기획 문서

---

## 기술 스택

| 구분 | 기술 | 포트 | 배포 |
|---|---|---|---|
| 프론트엔드 | Next.js 16 (App Router) | 3000 | Docker |
| 백엔드 | NestJS 11 | 3001 | Docker |
| DB | PostgreSQL 18 + pgvector | 5432 | Docker (커스텀 이미지) |
| AI | OpenAI (gpt-5.4-nano 채팅+의도분석+description, text-embedding-3-small 임베딩) | - | - |
| Auth | NestJS 직접 구현 (JWT + Refresh Token + OAuth2 소셜 로그인) | - | - |
| 외부 API | TMDB, KOBIS, OpenAI | - | - |

---

## 인프라 전략

### 배포 시나리오 (완료)

- 오라클 무료티어 ARM Ampere A1 (4코어 24GB) — IP: 168.107.28.176
- Docker Compose: Nginx + Next.js + NestJS + PostgreSQL 18 + Certbot
- Nginx: 리버스 프록시 (`/api/` → backend, `/internal/` 차단) + Let's Encrypt SSL
- Cloudflare DNS: filmott.kr → 168.107.28.176 (Proxied, Full Strict SSL)
- 경로 방식: `filmott.kr/api` (서브도메인 미사용)

### 비용 목표

- 초기 최소 비용으로 운영, 유저 증가 시 단계적 확장

---

## Auth (소셜 로그인 구현 완료)

- **일반 사용자**: 소셜 로그인만 (Google + Kakao + Naver)
- **관리자(ADMIN)**: `/admin/login` 페이지에서 이메일 로그인 (`POST /auth/login` ADMIN만 허용)
- `POST /auth/signup`: ADMIN 전용 (JwtAuthGuard + RolesGuard)
- User entity: `provider` (enum LOCAL/GOOGLE/KAKAO/NAVER) + `providerId` 복합 유니크
- `email` nullable (카카오는 비즈앱 아니라 이메일 수집 불가)
- `password` nullable (소셜 유저는 비밀번호 없음)
- 소셜 첫 가입 시 닉네임 설정 강제 (유니크 제약)
- ADMIN: 모든 리뷰/댓글 삭제 가능

### 소셜 로그인 플로우
- OAuth2 Authorization Code Flow — `@nestjs/axios` HttpService로 직접 구현
- `GET /auth/{provider}` → state 쿠키 설정 + 소셜 인증 페이지 리다이렉트
- `GET /auth/{provider}/callback` → state 검증 + 토큰 교환 + 프로필 조회 → 기존/신규 여부 판단 후 프론트엔드 리다이렉트
- 기존 유저: 백엔드가 access/refresh 세션 쿠키를 설정하고 `/auth/callback?status=success`로 리다이렉트 → 프론트는 `/users/me`로 세션 확인
- 신규 유저: 5분짜리 social signup JWT를 `filmott_social_signup` HttpOnly 쿠키에 저장하고 `/auth/callback?new=true#signup=...`로 리다이렉트 → 프론트는 hash의 signup token을 sessionStorage에 보관해 쿠키 누락 시 fallback으로 사용 → 닉네임 설정 → `POST /auth/social/complete-signup`
- state 쿠키 CSRF 방지 (httpOnly, sameSite: lax, secure: NODE_ENV 기반 자동, cookie-parser)
- 탈퇴 유저 재가입: deactivate 시 providerId null 초기화 → unique constraint 충돌 방지
- signup cookie 재사용/중복 가입 방지: completeSocialSignup에서 JWT type 검증 + findByProvider 중복 체크
- 에러 처리: 내부 메시지 대신 에러 코드 (suspended/deleted/social_auth_failed) 사용
- 프론트: AuthModal에 소셜 버튼 3개, `/auth/callback` 페이지에서 `status`/`new`/`error` 쿼리로 분기
- 프로덕션 환경변수 규칙: `FRONTEND_URL`은 브라우저가 접근 가능한 공개 도메인만 사용, 서버 간 내부 통신은 `FRONTEND_INTERNAL_URL`로 분리

### 토큰 구조
- **Access Token**: JWT, 15분 만료 (payload: nickname, sub, role)
- **Refresh Token**: opaque (randomBytes(32)), SHA-256 해시 후 DB 저장, 7일 만료
- 브라우저 전달 방식: `HttpOnly` + `SameSite=Lax` 쿠키 (`filmott_access_token`, `filmott_refresh_token`)
- Refresh token rotation: 갱신 시 기존 폐기 + 새 토큰 발급
- Race condition 방지: 트랜잭션 + pessimistic_write lock
- 만료 토큰 크론 정리: 매일 03시 (`@nestjs/schedule`)
- `POST /auth/refresh`: 토큰 갱신 (인증 불필요)
- `POST /auth/logout`: 토큰 폐기 (인증 불필요)

### 프론트엔드 인증
- AuthModal: 소셜 로그인 버튼 3개 (Google/Kakao/Naver 브랜드 UI)
- Axios 인스턴스는 `withCredentials: true`로 세션 쿠키를 전송
- 앱 시작 시 `/users/me`로 세션 복원 시도, 401이면 `/auth/refresh` 후 재조회
- 401 응답 시 별도 `refreshApi` 인스턴스로 자동 갱신 시도
- 동시 401 처리: `isRefreshing` + `failedQueue` 큐잉 (refresh 1회만 수행)
- 갱신 실패 시 `AUTH_REQUIRED_EVENT` → 레거시 auth localStorage 정리 + 모달 자동 오픈
- 로그아웃: 서버에 토큰 폐기 요청 (fire-and-forget) + React auth 상태 초기화 + 레거시 auth localStorage 정리

### 기타
- 닉네임 제한: 한글 8자/영문 16자 (바이트 기반), 허용문자(한글/영문/숫자/_), 예약어 차단 — 공통 유틸(`utils/nickname.ts`)
- 닉네임 실시간 중복 체크 API
- Rate limiting: 인증 엔드포인트 60초당 5회, refresh/logout 60초당 10회 (`@nestjs/throttler`)
- Rankings refresh: ADMIN 전용 (`JwtAuthGuard` + `RolesGuard`)

---

## 메인화면 (구현 완료)

```
메인화면
├── AI 채팅 추천 (ChatSection — Client Component)
│   ├── 대화 없을 때: 환영 메시지 + 예시 질문 + 입력창 (60vh 고정)
│   └── 대화 있을 때: 메시지 영역 (60vh 고정, 내부 스크롤) + 입력창
├── 국내 박스오피스 (KOBIS 일간/주간 탭)
├── 지금 뜨는 작품 (trending-all 일간/주간 탭)
└── 최근 리뷰
    ├── 포스터 + 제목(링크) + 유저/별점 + 코멘트
    └── 상대시간 표시 (TimeAgo 클라이언트 컴포넌트)
```

- 비로그인 채팅 가능 (OptionalJwtAuthGuard, 비로그인 IP 기반 60초 5회 Rate Limit)
- 대화 localStorage 영구 저장 (최근 50개 제한, 새 대화 시 removeItem 초기화, 로그인 전후 연속 사용 유지)
- 인증 상태는 쿠키로 관리하고, localStorage는 채팅 히스토리 저장에만 사용
- 랭킹/트렌드 카드: 순위 배지 + 별점 + 제목 + 연도 + 영화/시리즈 + 첫 번째 장르
- 트렌딩 배치: trending-all-day, trending-all-week만 저장 (movie/tv 개별 미사용)

### AI 채팅 추천 구조
- `POST /api/chat/messages` SSE 응답으로 텍스트와 추천 카드를 전달
- 요청: 사용자 메시지 + 최근 히스토리 + assistant 추천 메타데이터(`recommendations`)를 함께 전송
- 백엔드 흐름: 의도 분석 → SQL 메타데이터 필터/벡터 검색/참조 작품 임베딩 검색 → OpenAI 구조화 응답 생성 → 런타임 검증 → Markdown 렌더링 → SSE 전송
- OpenAI 채팅 응답은 JSON Schema 기반 `{ intro, recommendations, outro }` 구조를 source-of-truth로 사용
- 추천 카드는 `recommendations[]`의 `tmdbId`/`contentType`이 후보 작품과 매칭되는 경우에만 생성
- Markdown의 굵은 글씨(`**제목**`)는 표시용일 뿐 추천 카드 생성 기준으로 사용하지 않음
- 후보 외 추천작은 텍스트에는 표시될 수 있지만 즉시 카드로 만들지 않으며, 필요 시 비동기 TMDB 캐싱 대상으로만 처리
- SSE는 검증 완료된 Markdown 텍스트를 서버에서 작은 chunk로 나눠 출력하는 방식이며, OpenAI 토큰 단위 스트리밍은 아님

---

## 작품 탐색 (구현 완료)

- 영화 / TV / 인물 구분
- 필터: 장르별, OTT별 (한국에서 볼 수 있는 작품만: `watch_region=KR`)
- 정렬: 인기순 / 최신순 / 평점순 / 수익순
- 인물 검색 + 필모그래피 (출연/연출 분리, 더보기)
- 전체 데이터 TMDB 기반

---

## 작품 상세페이지 (구현 완료)

```
작품 상세페이지
├── 기본 정보 (TMDB)
│   ├── 백드롭 (h-[40vh] md:h-[55vh]) + 포스터, 제목, 줄거리, 장르 태그
│   ├── 개봉일, 러닝타임, TMDB 평점 (호버 시 출처 툴팁)
│   ├── OTT 플랫폼 로고 (호버 시 이름 툴팁)
│   └── 기록하기 버튼 (감상한 작품 / 감상할 작품 드롭다운)
├── 출연진 (CastCarousel, 최대 20명)
└── 리뷰 섹션
    ├── 평균 별점 + 리뷰 수 (리뷰 없으면 0점 0개 표시)
    ├── 내 리뷰 (뱃지 + 별점 + 댓글 아이콘/수 + 좋아요 + 코멘트 + 수정/삭제)
    └── 전체 리뷰 목록 (아바타 + 닉네임 + 별점 + 댓글 아이콘/수 + 좋아요)
```

### 리뷰/감상 기록 정책
- 1작품 1평가 (1유저 중복 불가)
- 별점 필수, 코멘트 선택 (500자)
- 상세 페이지의 `감상한 작품` 선택과 `리뷰 작성` 버튼은 같은 `ReviewFormModal`을 사용
- `감상할 작품`은 드롭다운에서 즉시 저장하고, `감상한 작품`은 `watchedAt` + 별점 + 코멘트를 한 번에 입력
- 리뷰 작성 시 watched 기록이 없으면 같은 트랜잭션에서 watched 기록 자동 생성
- 이미 watched 기록이 있으면 리뷰 작성 시 전달된 `watchedAt`으로 감상일을 유지/갱신
- 리뷰 수정 시에도 `watchedAt`을 함께 저장해 내 기록의 감상일과 리뷰 내용을 같은 모달에서 수정
- 신규 작성 모달의 기본 감상일은 한국 날짜(`Asia/Seoul`) 기준 오늘로 설정
- 수정 가능, rating 또는 comment 변경 시 좋아요 초기화 (버튼 왼편 인라인 경고 표시)
- `watchedAt`만 변경하는 수정은 좋아요를 유지하고 좋아요 초기화 경고도 표시하지 않음
- `감상한 작품` 기록 제거 시 리뷰가 있으면 리뷰도 함께 삭제된다는 확인 모달을 거친 뒤 워치리스트와 리뷰를 함께 삭제
- 리뷰가 남아 있는 작품은 `감상할 작품`으로 등록할 수 없도록 백엔드에서 차단
- `watchlist-updated` 이벤트로 상세 페이지의 기록하기 버튼과 내 리뷰 영역을 즉시 재조회
- 삭제 가능 (인라인 확인)
- 댓글: 말풍선 아이콘 + 댓글 수 클릭 → 댓글 모달
- 공개 리뷰/댓글 응답의 user 정보는 `id`, `nickname`, `profileImage`, `status`만 노출

---

## 워치리스트 (구현 완료)

```
워치리스트
├── 감상한 작품
│   ├── 연도 드롭다운 필터 + 연도별 개수 표시
│   ├── 월별 그룹핑 (일(day) 숫자 + 연필 아이콘 + 구분선 + 포스터)
│   ├── 리뷰 있는 카드: 별점 + 댓글 + 좋아요 + 코멘트
│   └── 리뷰 없는 카드: 리뷰 작성 버튼 (dashed border 스타일)
├── 감상할 작품
│   └── 포스터 그리드 (5열, 컴팩트)
└── 탭 카운트: 총 개수 표시 (me/counts API)
```

- 헤더 네비에 "내 기록" 직접 링크 (로그인 시, 프로필 거치지 않고 1클릭 접근)
- 상세페이지: "기록하기" 버튼 → `감상할 작품`은 즉시 저장, `감상한 작품`은 공유 `ReviewFormModal`로 기록
- `감상한 작품` 기록은 감상일, 별점, 코멘트를 한 화면에서 입력하며 별점은 필수
- 기존에 리뷰 없이 watched만 남은 데이터는 유지하고, 카드의 `리뷰 작성` 버튼에서 기존 `watchedAt`을 기본값으로 사용
- 내 기록 카드의 날짜 영역은 기존 위치와 형태를 유지하되, 공유 `ReviewFormModal`로 날짜/별점/코멘트를 함께 수정
- 리뷰가 있는 카드에서 좋아요를 누른 직후 수정해도 최신 좋아요 수 기준으로 초기화 경고 표시
- `감상한 작품` 제거는 리뷰/댓글/좋아요를 함께 삭제하고, `감상할 작품` 제거는 워치리스트만 삭제
- 리뷰만 삭제하는 경우에는 watched 기록을 남기는 정책 유지

---

## 프로필 (구현 완료)

- 아바타 (그라데이션 + 이니셜), 인라인 닉네임 수정
- 워치리스트 통계 (감상한/감상할 카운트)
- 로그아웃 / 회원 탈퇴 (익명화, 리뷰는 익명으로 유지)
- 헤더: 아바타 클릭 → 프로필 페이지로 이동

---

## Google Analytics 이벤트 추적

| 이벤트 | 발생 시점 | 파라미터 | 용도 |
|---|---|---|---|
| `page_view` | 페이지 이동 (자동) | - | 트래픽 분석 |
| `chat_message_sent` | 채팅 메시지 전송 | `message_count` (n번째 메시지) | 채팅 이용률 분석 |
| `chat_example_clicked` | 예시 질문 클릭 | `question` (질문 텍스트) | 어떤 예시가 인기인지 확인 |
| `content_detail_view` | 작품 상세 페이지 진입 | `tmdb_id`, `title`, `content_type` | 인기 콘텐츠 분석 |
| `review_created` | 리뷰 작성 완료 | `content_id` | 리뷰 전환율 |
| `social_login_started` | 소셜 로그인 클릭 | `provider` | 소셜 채널 선호도 |
| `signup_completed` | 회원가입 완료 | `provider` | 가입 퍼널 전환율 |
| `watchlist_added` | 기록하기 추가 | `status`, `content_type` | 콘텐츠 관심도 |

---

## 콘텐츠 캐싱 전략

- **온디맨드 캐싱**: 최초 조회 시 TMDB에서 fetch → contents 테이블 저장
- **상세페이지 TTL 72시간 + 백그라운드 갱신**: `getContentDetail`에서 TTL 이내 캐시 반환, 초과 시 캐시 즉시 반환 + 백그라운드 비동기 TMDB 갱신 (refreshingIds Set으로 중복 방지)
- **상세 조회 보호**: 공개 상세 API는 Rate Limit 적용, `tmdbId` 정수 범위 검증 후 DB/TMDB 조회, TMDB 미존재/실패 응답은 5분 negative cache로 반복 호출 억제
- **인물 상세/credits 72시간 인메모리 캐시**: `getPersonDetail`, `getPersonCredits`에서 Map 기반 TTL 캐시. 크롤러 반복 요청 시 TMDB API 호출 없이 즉시 응답. 만료 엔트리 6시간마다 Cron 정리.
- **blockedIds 5분 인메모리 캐시**: `getBlockedTmdbIds()` 결과를 5분 TTL로 캐시. admin 차단/해제 시 즉시 무효화.
- **랭킹/트렌딩 배치**: `findOrFetchByTmdbId`로 캐싱 (업데이트는 상세페이지 진입 시)
- **장르명 정규화**: 백엔드 `GENRE_NAME_MAP`으로 TMDB 장르를 한글 통일 (DB 저장 시 매핑)
- 콘텐츠 데이터는 삭제 정리하지 않음. 별도 TTL 배치 불필요 — 인기/트렌드 작품은 자연스럽게 최신화

---

## DB 핵심 테이블 설계

```sql
users
- id, email (nullable), nickname, password (nullable), profile_image, status (ACTIVE/SUSPENDED/DELETED), role (USER/ADMIN), provider (LOCAL/GOOGLE/KAKAO/NAVER), provider_id (nullable), created_at
-- UQ: provider + provider_id

refresh_tokens
- id, token (varchar(64), SHA-256 해시, unique), user_id (FK CASCADE), expires_at, created_at

contents
- id, tmdb_id, content_type (movie/tv), title, original_title
- poster_url, backdrop_url, overview, release_date, vote_average, vote_count, genres (jsonb, 한글 정규화), runtime
- director (varchar, nullable), origin_country (varchar, nullable)
- watch_providers (jsonb, nullable), credits (jsonb, cast, nullable)
- adult (boolean, default false)
-- TMDB 작품 상세 정보는 온디맨드 캐싱 (최초 조회 시 저장, 상세페이지 진입 시 업데이트)
-- UQ: tmdb_id + content_type

content_metadata
- id, content_id (FK contents, unique), description (text), embedding (vector 1536)
- created_at, updated_at
-- LLM(gpt-5.4-nano) 생성 description + OpenAI 임베딩 벡터
-- HNSW 인덱스 (m=16, ef_construction=64)
-- AI 추천 시 벡터 유사도 검색용

rankings
- id, source (kobis/tmdb), category (daily-box-office/weekly-box-office/trending-all-day/trending-all-week)
- rank, title, poster_url, content_id, audience_count, target_date, fetched_at
-- 배치로 주기적 갱신 (KOBIS 매일 00:05+12:00, TMDB 트렌딩 매일 6시)

reviews
- id, user_id, content_id
- rating (smallint, 1~10)
- comment (nullable, text, 500자)
- likes_count (default 0)
- updated_at, created_at
-- UQ: user_id + content_id
-- comments relation (OneToMany → commentsCount 서브쿼리 제공)

review_likes
- id, review_id, user_id, created_at

review_comments
- id, review_id, user_id, content, created_at

watchlist
- id, user_id, content_id, status (watched/want_to_watch), watched_at, created_at, updated_at
-- UQ: user_id + content_id
```

---

## 외부 API 활용 계획

| API | 용도 | 호출 주체 |
|---|---|---|
| TMDB | 영화/드라마 메타데이터, OTT 제공 여부(Watch Providers), 인기순/트렌딩, 인물 검색/필모그래피 | 백엔드 직접 HTTP |
| KOBIS | 국내 박스오피스 순위 (일간/주간) | 백엔드 직접 HTTP |
| OpenAI | AI 채팅 응답 + 의도 분석 + description 생성 (gpt-5.4-nano), 벡터 임베딩 (text-embedding-3-small) | 백엔드 직접 HTTP |

외부 API 오류는 로그/Sentry 전송 전에 provider, endpoint, status, code, message 중심으로 요약하고 요청 헤더/토큰/원본 응답 전문은 기록하지 않는다.

> MCP 서버(`mcp/`)는 Claude 개발 보조용 전용. 서비스 런타임에서는 사용하지 않음.

### 이미지
- **TMDB 이미지**: `TmdbImage` 래퍼 컴포넌트 (`unoptimized={true}`) — TMDB CDN 직접 로드, Next.js 최적화 프록시 우회
  - 사이즈별 TMDB CDN 활용: 로고 `w92`, 썸네일 `w154`, 캐스트 `w185`, 포스터/카드 `w342`, 백드롭 `w1280`
  - `replaceTmdbSize(url, size)` 유틸로 백엔드 저장 URL의 사이즈를 프론트에서 런타임 교체
- **프로필 이미지**: Cloudflare R2 + `next/image` 최적화 유지 (UserAvatar, ProfileImageUploader)

---

## 구현 완료 목록

- [x] 인증 모달 + 로그인/회원가입 진입 페이지
- [x] 닉네임 제한/중복체크 + 프로필 관리
- [x] 작품 탐색 (영화/TV/인물) + 필터/정렬
- [x] 인물 검색 + 필모그래피
- [x] 작품 상세페이지 (백드롭, OTT, 출연진, 기록하기 버튼)
- [x] 리뷰 (별점 + 코멘트 + 좋아요 + 댓글)
- [x] 메인화면 (박스오피스 + 지금 뜨는 작품 + 실시간 리뷰)
- [x] 리뷰 UI 전면 개편 (댓글 아이콘, TimeAgo, 좋아요 버그 수정)
- [x] 유저 상태/역할 리팩토링 (status enum + role enum + ADMIN guard)
- [x] 워치리스트 (감상한/감상할 + 월별 그룹핑 + 연도 필터 + 포스터 그리드)
- [x] 프로필 리뉴얼 (아바타, 닉네임 수정, 워치리스트 통계, 회원 탈퇴)
- [x] 헤더에 "내 기록" 직접 링크 추가
- [x] 장르명 한글 정규화 (백엔드 GENRE_NAME_MAP + DB 일괄 업데이트)
- [x] 랭킹/트렌드 카드에 영화/시리즈 + 장르 정보 추가
- [x] 미사용 트렌딩 카테고리 제거 (trending-movie/tv → trending-all만 유지)
- [x] 코드 리뷰 1차~3차 전체 반영
- [x] UX 리뷰 대규모 수정 (21개 이슈)
- [x] 리프레시 토큰 (access 15분 + refresh 7일, rotation, SHA-256 해시 저장, 크론 정리)
- [x] 워치리스트/리뷰 UX 개선 (모바일 인지성, 좋아요 초기화 확장, 동기화)
- [x] 감상 기록과 리뷰 작성 플로우 통합 (`감상한 작품` 선택 + 리뷰 작성/수정 모달 공유, `watchedAt` 동기화, 날짜만 수정 시 좋아요 유지)
- [x] 소셜 로그인 (Google + Kakao + Naver) + 이메일 로그인 ADMIN 전용 전환
- [x] 관리자 로그인 페이지 (/admin/login) + ADMIN 리뷰/댓글 삭제
- [x] 커스텀 404 페이지
- [x] hasSpoiler 컬럼 제거
- [x] PostgreSQL 15 → 18 업그레이드
- [x] 관리자 대시보드 (/admin — 유저 관리 테이블 + 정지/해제 + 랭킹 수동 갱신)
- [x] 관리자 시드 스크립트 (npm run seed:admin, .env에서 ADMIN 정보 읽기)
- [x] 코드 리뷰 4차 반영 (P0: secure 환경변수화, URL 토큰 노출 제거, DELETED 재가입 충돌 방지 / P1: ILIKE 이스케이프, 에러 코드화, signup 세션 재사용 방지)
- [x] 개인정보처리방침 (/privacy) + 이용약관 (/terms) 페이지
- [x] Footer 리뉴얼 (개인정보처리방침/이용약관 링크 + TMDB/KOBIS 출처 + Email 연락처)
- [x] SEO: favicon + apple-touch-icon + OG 메타태그 (글로벌 + 동적) + title template
- [x] SEO: robots.txt + sitemap.xml (정적 + DB 동적 콘텐츠)
- [x] Google Analytics GA4 (NEXT_PUBLIC_GA_ID 환경변수 기반) + 커스텀 이벤트 추적
- [x] 메인 최근 리뷰 댓글 수 표시 + 상세페이지 #reviews 앵커 링크
- [x] KOBIS 크론 00:05 + 12:00 두 번 갱신
- [x] PWA (manifest.json + Service Worker 직접 구현 + 오프라인 페이지)
- [x] 모바일 헤더 아이콘 변경 (Film/Tv/Layers)
- [x] Docker 구성 (Nginx + frontend + backend + postgres + certbot)
- [x] 오라클 무료티어 배포 + Let's Encrypt SSL + 관리자 시드
- [x] Cloudflare DNS 연결 (filmott.kr)
- [x] SSL 자동 갱신 크론 등록
- [x] 오라클 ARM 2코어 12GB 이전 (AMD 1GB → ARM 12GB)
- [x] 댓글 수 실시간 반영 (모달 닫힐 때 commentsCount 갱신)
- [x] On-Demand Revalidation (배치 완료 + admin 수동 갱신 시 메인 캐시 즉시 갱신)
- [x] revalidate 보안 강화 (Nginx /internal/ 차단, Referer 인증 제거, Bearer 토큰 + path allowlist 적용)
- [x] 코드 리뷰 5차 반영 (revalidate 보안, 데드 코드, path 화이트리스트)
- [x] KOBIS 크론 00:10으로 변경 (00:05에서 데이터 미준비 이슈) → 00:05로 복원 (ARM 서버 이전 후 정상)
- [x] description '시네마틱' 제거
- [x] Google Search Console + 네이버 서치어드바이저 등록 + 사이트맵 제출
- [x] admin 랭킹 포스터 수동 설정 (TMDB 미매칭 작품에 posterUrl 직접 입력)
- [x] RankingCard posterUrl fallback + "상세정보 준비 중" 안내
- [x] 외부 https 이미지 전체 허용 (next.config.ts remotePatterns)
- [x] 프로필 이미지 업로드/삭제 (Cloudflare R2 + sharp 200x200 webp 리사이즈)
- [x] 다른 유저 공개 프로필 페이지 (/profile/:userId + 닉네임/아바타 프로필 링크)
- [x] 리뷰 정렬 UI (최신순/인기순 탭, 메인 페이지 pill 스타일 통일)
- [x] 헤더 아바타 프로필 이미지 반영 (UserAvatar 컴포넌트 교체)
- [x] 댓글에서 프로필 보기 링크 추가
- [x] 공개 프로필 리뷰 페이징 (더보기 버튼 + findByUser limit 파라미터)
- [x] 코드 리뷰 6차 반영 (Multer 크기 제한, user.email 노출 제거, Rate Limit, 탈퇴 시 R2 삭제 등 12건)
- [x] CI/CD: GitHub Actions (ci.yml 자동 테스트 + deploy.yml 자동 배포)
- [x] Sentry 에러 모니터링 (백엔드 @sentry/nestjs + 프론트 @sentry/nextjs instrumentation 기반 초기화)
- [x] 오라클 ARM 4코어 24GB 인스턴스 재생성
- [x] Cloudflare Proxy ON + Full (Strict) SSL
- [x] TMDB 미존재 콘텐츠 500 → 404 에러 핸들링 수정
- [x] 사이트맵 URL 50000개 제한
- [x] Sentry profiling 제거 (배포 시 백엔드 hang 원인)
- [x] CI 시간대 차이 테스트 수정 (Asia/Seoul 기준)
- [x] OTT 구독 정보 (User subscribedOtts + 온보딩 2단계 + 프로필 변경)
- [x] AI 채팅 추천 Phase 1-1 (ChatModule + SSE + 구조화 추천 응답)
- [x] 채팅 UI (마크다운 렌더링, 세션 관리, 추천 메타데이터 기반 카드, 스크롤 화살표)
- [x] 채팅 보안 (Rate Limit, 토큰 자동 갱신, 에러 시 메시지 롤백)
- [x] AI 추천 구조 재설계 (Anthropic→OpenAI, tool use→pgvector 임베딩 검색, 세션 DB→localStorage)
- [x] Content entity 확장 (director, originCountry, voteCount)
- [x] 임베딩 description 메타데이터 포함 (OTT, 국가, 감독, 평점, 러닝타임, 연도)
- [x] HNSW 벡터 인덱스 + 후보 내 매칭 카드 + 후보 외 비동기 캐싱
- [x] TMDB Discover 벌크 수집 스크립트 (movie + tv)
- [x] 하이브리드 검색 (LLM 의도 분석 + SQL 메타데이터 필터 + 벡터 검색)
- [x] SQL 전체 contents 검색 → content_metadata 기준 검색으로 전환 (900k 풀스캔 제거, 2단계 우선순위)
- [x] 유저 데이터 기반 개인화 검색 (리뷰/워치리스트/구독OTT 선호 반영)
- [x] 한국 작품 임베딩 캐싱 4,010개 (병렬 배치 + 한국 작품 모드)
- [x] 상세 페이지 백그라운드 갱신 (TTL 72시간, 초과 시 비동기 갱신)
- [x] SQL 전체 검색용 인덱스 5개 (TypeORM 마이그레이션)
- [x] 성인물 차단 (Content adult 컬럼 + TMDB adult OR 연산 자동 반영 + 관리자 수동 차단 API + 검색/추천/탐색/인물 필모그래피 필터 + admin 탭 구조(페이징) + 상세 페이지 차단 버튼 + 인물 일괄 차단)
- [x] 테스트 품질 개선 (컨트롤러 거울 테스트 제거, QueryBuilder 구현 결합 제거, 차단 필터링 테스트 추가)
- [x] AI 추천 품질 개선 (참조 작품 임베딩 직접 활용 + LLM 후보 거부 권한 + 비로그인 AI 추천 노출)
- [x] 메인 페이지 AI 채팅 중심 재설계 (ChatSection 최상단 배치 + 비로그인 채팅 + localStorage + /chat 삭제)
- [x] AI 모델 gpt-5.4-nano 전환 (의도분석 none, description/채팅 low) + 중복 추천 방지 + 존댓말 강제
- [x] 벡터 검색 OTT 없는 외국 작품 필터 + 의도 분석 "드라마" contentType 매핑 개선
- [x] 서비스 정체성 개선 (푸터 태그라인, AuthModal 메시지, 메타태그 통일)
- [x] GA 커스텀 이벤트 추적 (chat_message_sent, chat_example_clicked, content_detail_view, review_created, social_login_started, signup_completed, watchlist_added)
- [x] 카카오톡 오픈채팅 링크 (푸터)
- [x] SSE 스트리밍 에러 방어 (safeSend 통합 + res.destroyed 체크)
- [x] SEO 성인 콘텐츠 제외 (사이트맵 adult 필터 + 상세 페이지 noindex)
- [x] 배치 후 revalidation 30초 딜레이 (SSR 재생성 병목 방지)
- [x] ISR 주기 완화 (작품 상세 10분→1시간, 인물 1시간→6시간)
- [x] 테스트 품질 개선 (safeSend 방어 로직 테스트, 거울 테스트 개선, noindex 메타태그 테스트)
- [x] 배치 성능 개선 (TypeORM 커넥션 풀 10→50, PostgreSQL 튜닝 24GB 서버 최적화, 배치 revalidation 중복 제거 + sleep 제거)
- [x] PostgreSQL 튜닝 (shared_buffers 6GB, work_mem 32MB, max_connections 150, random_page_cost 1.1, SSD 최적화) — docker-compose command -c 플래그 방식
- [x] contents adult partial index 추가 (getBlockedTmdbIds 풀스캔 해소, 4초→42ms)
- [x] 벡터 검색 CTE를 content_metadata 기준으로 전환 (900k 풀스캔 제거, 3순위→2순위 구조)
- [x] 의도 분석 confidence 필드 추가 (high: 필터 우선, low: 벡터 유사도 + 유저 선호 우선)
- [x] 유사도 점수 출력 LLM 전달 (유사도 % 표시 + 내림차순 정렬)
- [x] 의도 분석 멀티턴 (최근 대화 맥락을 의도 분석에 반영)
- [x] 부정적 피드백 활용 (싫어하는 장르/감독 2회 이상 등장 시 검색에서 제외)
- [x] EmbeddingModule 독립 분리 (ChatModule, ContentsModule 순환 의존 해소)
- [x] AI 채팅 구조화 출력 전환 (JSON Schema 기반 recommendations source-of-truth + 굵은 글씨 제목 추출 제거 + SSE chunk 출력)
- [x] metadata 배치 캐싱 (KOBIS/트렌딩 배치 후 자동 + 한국TV Discover 매일 07:00 KST 수집+캐싱)
- [x] 이미지 최적화 (TmdbImage `unoptimized` 래퍼로 TMDB CDN 직접 로드 + 사이즈 다운: 로고 w92, 포스터 w342, 백드롭 w1280)
- [x] 메인 페이지 ISR 전환 (fetchRecentReviews `no-store` → `revalidate: 21600` + 리뷰 CRUD 시 On-Demand Revalidation)
- [x] RevalidateService 공용 서비스 추출 (Rankings/Reviews 등에서 공통 사용)
- [x] Sentry 이중 초기화 제거 (SentryInit.tsx 삭제, instrumentation.ts 기반 runtime 로딩 정리)
- [x] DB 일일 자동 백업 (매일 04:00 KST, 7일 보관) + Docker 주간 정리 (매주 일 04:30 KST)
- [x] Dockerfile .next/cache 권한 수정 (ISR 캐시 정상화)
- [x] 인물 상세/credits + blockedIds 인메모리 캐시 (TMDB API 호출 제거 + 슬로우 쿼리 제거)
- [x] 배포 후 ISR revalidation 자동화 (deploy.yml, frontend node fetch)
- [x] 인물 페이지 credits ISR 6시간 전환 + 프로필 페이지 ISR 5분 추가
- [x] 인메모리 캐시 만료 엔트리 6시간마다 Cron 정리
- [x] GA 커스텀 이벤트 5종 추가 (content_detail_view, review_created, social_login_started, signup_completed, watchlist_added)
- [x] nginx client_max_body_size 6m 추가 (프로필 이미지 업로드 413 해결)
- [x] SEO: canonical URL 전체 적용 + JSON-LD 구조화 데이터 (작품 상세) + robots.txt /search 차단
- [x] OpenAI API timeout 추가 (채팅 구조화 응답 30초, 의도분석/임베딩 10초)
- [x] Cron 배치 실패 시 Sentry 알림 연동
- [x] Sentry tracesSampleRate 10% → 1% (span 한도 절감)
- [x] 공개 리뷰/댓글 응답 사용자 정보 최소화
- [x] 콘텐츠 상세 조회 보호 (Rate Limit, tmdbId 검증, 5분 negative cache)
- [x] 외부 API 오류 로그 민감정보 제거
- [x] 백엔드 HTTP/e2e 검증 보강
- [x] 임베딩 수동 재캐싱 스크립트 제거 (필요 시 운영 상황에 맞춘 일회성 배치 작성)

---

## 배포 전 작업 (우선순위순)

1. ~~**소셜 로그인**~~ ✅ 완료
2. ~~**개인정보처리방침 + 이용약관 + Footer 리뉴얼**~~ ✅ 완료
3. ~~**SEO + Analytics**~~ ✅ 완료
4. ~~**PWA 구현 및 테스트**~~ ✅ 완료
5. ~~**Docker 구성 + 배포**~~ ✅ 완료 (ARM 4코어 24GB)

### 배포 시 코드 변경 (적용 완료)
- `page.tsx` 랭킹 fetch: `next: { revalidate: 21600 }` (6시간, 배치 후 On-Demand Revalidation으로 즉시 갱신)
- 최근 리뷰: `next: { revalidate: 21600 }` (ISR 6시간 + 리뷰 CRUD 시 On-Demand Revalidation으로 즉시 갱신)
- 인물 페이지 credits: `next: { revalidate: 21600 }` (6시간 ISR)
- 프로필 페이지: `next: { revalidate: 300 }` (5분 ISR, 리뷰 목록은 `no-store` 유지)
- 상세페이지 리뷰/stats: `cache: 'no-store'` 유지
- Dockerfile: `.next/cache` 디렉토리 `nextjs:nodejs` 소유 설정 (ISR 캐시 쓰기 권한)
- deploy.yml: 배포 후 ISR revalidation 자동 호출 (frontend 컨테이너 내 Node.js fetch)

### 배포 시 소셜 로그인 환경변수 변경
```
# backend/.env — 콜백 URL을 프로덕션 도메인으로 변경
GOOGLE_CALLBACK_URL=https://filmott.kr/api/auth/google/callback
KAKAO_CALLBACK_URL=https://filmott.kr/api/auth/kakao/callback
NAVER_CALLBACK_URL=https://filmott.kr/api/auth/naver/callback
FRONTEND_URL=https://filmott.kr
FRONTEND_INTERNAL_URL=http://frontend:3000

# frontend — API URL 변경
NEXT_PUBLIC_API_URL=https://filmott.kr/api
```

### 배포 시 소셜 앱 설정 변경
- **Google Cloud Console**: 승인된 리디렉션 URI에 `https://filmott.kr/api/auth/google/callback` 추가
- **Kakao Developers**: 플랫폼 웹 도메인 + Redirect URI를 `https://filmott.kr/api/auth/kakao/callback`으로 변경
- **Naver Developers**: 서비스 URL + Callback URL을 `https://filmott.kr/api/auth/naver/callback`으로 변경
- `setStateCookie`의 `secure`는 NODE_ENV=production이면 자동으로 true (수동 변경 불필요)
- localhost 개발용 URI는 유지하되, 프로덕션 URI를 추가 등록

---

## 배포 후 확장

> 상세 로드맵: `docs/development-plan-spec.md` 참조

### Phase 0-0: 기존 과제 마무리 ✅ 완료
- [x] 프로필 이미지 업로드 (Cloudflare R2)
- [x] 다른 유저 프로필 보기
- [x] 리뷰 정렬 UI

### CI/CD + Sentry ✅ 완료
- [x] GitHub Actions (CI: 자동 테스트, CD: 자동 배포)
- [x] Sentry 에러 모니터링 (백엔드 + 프론트)

### Phase 1: AI 큐레이터
- [x] OTT 구독 정보 (온보딩 2단계 + 프로필 변경)
- [x] AI 채팅 추천 v1 (구조화 응답 + SSE chunk 출력)
- [x] AI 추천 구조 재설계 ✅
  - OpenAI SDK (gpt-5.4-nano 채팅+의도분석+description + text-embedding-3-small)
  - pgvector 임베딩 검색 (HNSW 인덱스, 유사도 상위 10개)
  - 세션 localStorage 영구 저장 (최근 50개 제한)
  - 초기 5000개 캐싱은 운영 상황에 맞춘 일회성 배치로 수행
- [x] 추천 카드 source-of-truth 구조화 ✅
  - OpenAI JSON Schema 응답 `{ intro, recommendations, outro }`
  - `recommendations[].tmdbId/contentType`이 후보와 매칭된 작품만 카드 생성
  - Markdown 굵은 글씨/제목 재추출 기반 카드 생성 제거
  - 검증 완료된 Markdown을 SSE `text` chunk로 출력하고 `recommendations` 이벤트로 카드 데이터 전달
- [x] 하이브리드 검색 ✅ (의도 분석 + SQL 필터 + 벡터 검색)
  - IntentAnalyzerService: LLM 의도 분석 (OTT/국가/인물/연도/타입/장르 + confidence + 멀티턴 맥락)
  - ContentSearchService: content_metadata 기준 검색 (9,633건, 2단계 우선순위) + KOBIS fallback
  - confidence 기반 검색 분기 (high: SQL 필터 우선, low: 벡터 유사도 + 유저 선호)
  - 유사도 점수 출력 LLM 전달 (추천 판단력 향상)
  - 유저 데이터 기반 개인화 (리뷰/워치리스트/구독OTT 선호 + 부정적 피드백 제외)
  - 임베딩 캐싱 ~8,783개 + 후보 외 구조화 추천 시 비동기 캐싱 (cacheUnmatchedTitles)
  - metadata 배치 캐싱 (KOBIS/트렌딩 배치 후 자동 + 한국TV Discover 매일 07:00 KST)
  - 수동 재캐싱용 상시 CLI는 유지하지 않고 필요 시 목적에 맞는 일회성 스크립트 작성
  - 상세 페이지 백그라운드 갱신 (TTL 72시간)
- [x] 성인물 차단 기능
- [ ] 취향 프로필 카드 (AI 분석 + 이미지 공유)
- [ ] 리뷰 인사이트 (AI 리뷰 요약)

### Phase 2: 소셜 레이어
- [ ] 친구 시스템 + 취향 매칭 + 같이 볼 영화 추천
- [ ] 워치파티 투표

### 후순위
- [ ] CSV 임포트 (레터박스드/왓챠피디아)
- [ ] Phase 3: 한국 특화 (OTT 이탈 알림, 극장 연동, 독립영화 DB)

---

## 홍보 전략

- 에펨코리아, 더쿠, 디시인사이드 영화/OTT 갤러리
- 트위터/X (영화 덕후 커뮤니티 활발)
- 인스타그램 릴스/카드뉴스 + 자동 업로드 검토 (Instagram Graph API / Meta Business Suite)

### 차별점 포지셔닝
> "한국판 Letterboxd인데 드라마/OTT까지 된다"
- 국내 OTT 특화 (왓챠, 티빙, 웨이브)
- 드라마 지원
- KOBIS 국내 박스오피스
- 한국어 커뮤니티
