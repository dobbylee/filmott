<h1 align="center">
  <img src="frontend/public/icons/pwa/icon-128x128.png" alt="filmott logo" width="128"><br>
  filmott
</h1>

filmott는 영화와 TV/OTT 작품을 탐색하고, 감상 기록과 리뷰를 남기며,
대화형 AI 추천으로 다음 작품을 찾는 서비스입니다.

국내 박스오피스와 글로벌 트렌드, 작품·인물 정보, OTT 제공처를 한곳에서
확인할 수 있습니다. 로그인한 사용자는 자신의 감상 이력과 구독 OTT를 바탕으로
개인화된 추천을 받을 수 있습니다.

## 서비스 이용

### 작품 발견

[filmott](https://filmott.kr)에서 국내 일간·주간 박스오피스와 TMDB 트렌드를
확인할 수 있습니다. 제목 검색과 영화·TV, 장르, OTT, 연도별 필터 탐색도
지원합니다.

작품 상세에서는 줄거리, 출연진, 제작 정보, 국내 OTT 제공처, 관련 작품과
사용자 리뷰를 함께 제공합니다. 인물 페이지에서는 기본 정보와 참여 작품을
확인할 수 있습니다.

### AI 추천

홈의 채팅에서 자연어로 원하는 작품을 요청할 수 있습니다. filmott는 질문의
의도를 구조화한 뒤 콘텐츠 메타데이터, 랭킹, 벡터 유사도, 사용자의 감상 이력과
구독 OTT를 조합해 후보를 검색합니다.

응답은 Server-Sent Events로 스트리밍되며, 추천 카드는 AI가 임의로 만든 작품이
아니라 서버가 검색하고 검증한 후보만 사용합니다.

### 기록과 공유

Google, Kakao, Naver 계정으로 로그인할 수 있습니다. 작품을 `보고 싶어요` 또는
`봤어요`로 기록하고, 감상일과 별점, 리뷰를 남길 수 있습니다. 리뷰에는 좋아요와
댓글을 지원하며, 공개 프로필에서 다른 사용자의 감상 기록을 둘러볼 수 있습니다.

## 주요 기능

- KOBIS 국내 박스오피스와 TMDB 글로벌 트렌드 제공
- 제목 검색과 장르·OTT·연도·콘텐츠 유형별 탐색
- 영화·TV 상세 정보, 인물 필모그래피, 관련 작품 제공
- OpenAI Structured Outputs와 pgvector를 활용한 대화형 추천
- 사용자 선호·감상 이력·구독 OTT 기반 개인화
- 감상 상태, 감상일, 별점, 리뷰, 댓글, 좋아요 기록
- Google·Kakao·Naver OAuth 로그인과 공개 프로필
- 반응형 웹, PWA, 검색 엔진용 메타데이터·사이트맵 지원
- 관리자용 사용자·성인 콘텐츠·랭킹 데이터 관리

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4 |
| Backend | NestJS 11, TypeORM 0.3, Node.js 24 |
| Database | PostgreSQL 18, pgvector 0.8 |
| AI/Search | OpenAI, Structured Outputs, SSE, PostgreSQL filter search, vector similarity |
| External services | TMDB, KOBIS, Google·Kakao·Naver OAuth, Cloudflare R2 |
| Infrastructure | Docker Compose, Nginx, Cloudflare, blue-green deployment |
| Observability | Sentry, Google Analytics |
| Testing | Jest, Vitest, Testing Library, MSW, Playwright |
| CI/CD | GitHub Actions, exact-SHA CI and deployment verification |

## 시스템 구성

```text
Browser / Search crawler
        |
        v
Cloudflare
        |
        v
Nginx
  ├── /api/* ───────────────> NestJS backend
  │                              ├── PostgreSQL + pgvector
  │                              └── TMDB / KOBIS / OpenAI / R2
  │
  └── pages / static assets ─> Next.js frontend
                                 └── server-side API fetch
                                       └── Nginx /api/*
```

프로덕션에서는 frontend와 backend를 각각 blue/green 슬롯으로 운영합니다. CI를
통과한 정확한 `main` 커밋만 배포 대상으로 사용하며, Nginx의 active upstream을
전환한 뒤 외부 HTTP 응답과 배포 SHA를 검증합니다.

## 프로젝트 구조

```text
filmott/
├── frontend/              # Next.js App Router와 사용자 인터페이스
├── backend/               # NestJS API와 도메인 로직
│   └── src/migrations/    # 순서가 보장된 TypeORM migration
├── postgres/              # PostgreSQL + pgvector 이미지
├── nginx/                 # 공개 라우팅, TLS, 캐시와 보안 헤더
├── scripts/               # blue-green 배포, smoke, 백업과 운영 검증
├── .github/workflows/     # CI와 exact-SHA 배포 workflow
├── docker-compose.yml     # 로컬 PostgreSQL
└── docker-compose.prod.yml
```

## 더 보기

- [filmott 서비스](https://filmott.kr)
- [개인정보처리방침](https://filmott.kr/privacy)
- [이용약관](https://filmott.kr/terms)
- [Frontend](frontend)
- [Backend](backend)

## 라이선스

이 저장소는 현재 별도의 오픈소스 라이선스로 배포되지 않습니다.
