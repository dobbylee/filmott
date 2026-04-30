# filmott 아키텍처 가이드

> 프로젝트의 모든 구조, 흐름, 패턴을 학습용으로 정리한 문서.
> 각 섹션 끝에 추가 학습 리소스를 포함.

---

## 1. 프로젝트 전체 아키텍처

### 1.1 서비스 구성도

```
[브라우저] → [Cloudflare DNS/Proxy] → [Nginx :80/:443]
                                            │
                                    ┌───────┴───────┐
                                    │               │
                              /api/* 요청      그 외 요청
                                    │               │
                              [Backend :3001]  [Frontend :3000]
                                    │               │
                              [PostgreSQL :5432]     │
                                    │               │
                              [TMDB/KOBIS/OpenAI]   │
                                                    │
                                              ISR Cache (.next/cache)
```

### 1.2 요청 흐름

**페이지 요청** (예: `https://filmott.kr/contents/movie/12345`)
```
1. 브라우저 → Cloudflare (DNS + CDN + SSL 종단)
2. Cloudflare → Nginx :443 (리버스 프록시)
3. Nginx → Frontend :3000 (Next.js)
4. Frontend → ISR 캐시 HIT → 즉시 반환
        또는 → ISR 캐시 MISS → SSR 렌더링
              → fetchApi('https://filmott.kr/api/contents/movie/12345')
              → Cloudflare → Nginx → Backend → DB/TMDB
              → HTML 생성 + 캐시 저장 → 반환
```

**API 요청** (예: 클라이언트 `POST /api/reviews`)
```
1. 브라우저 (Axios) → Cloudflare → Nginx :443
2. Nginx location /api/ → Backend :3001
3. Backend: Guard(JWT 검증) → Pipe(DTO 검증) → Controller → Service → DB
4. 응답 → Nginx → Cloudflare → 브라우저
```

### 1.3 디렉토리 구조

```
filmott/
├── frontend/                  # Next.js 16 App Router
│   ├── src/
│   │   ├── app/               # 라우트 (페이지, 레이아웃, API)
│   │   ├── components/        # UI 컴포넌트
│   │   ├── contexts/          # React Context (AuthContext)
│   │   ├── lib/               # 유틸리티 (api.ts, fetcher.ts, ga.ts)
│   │   ├── types/             # TypeScript 타입 정의
│   │   └── __tests__/         # 테스트
│   ├── public/                # 정적 파일 (favicon, manifest, sw.js)
│   └── Dockerfile
│
├── backend/                   # NestJS 11
│   ├── src/
│   │   ├── auth/              # 인증 (JWT, OAuth2, Guard)
│   │   ├── users/             # 사용자 관리
│   │   ├── contents/          # 콘텐츠 (TMDB 캐싱, 인물)
│   │   ├── rankings/          # 랭킹 (KOBIS/TMDB 배치)
│   │   ├── reviews/           # 리뷰/댓글/좋아요
│   │   ├── watchlist/         # 감상 기록
│   │   ├── chat/              # AI 추천 (의도 분석, 벡터/SQL 검색, 구조화 응답, SSE)
│   │   ├── tmdb/              # TMDB API 래퍼
│   │   ├── kobis/             # KOBIS API 래퍼
│   │   ├── common/            # 공용 (R2 스토리지, Revalidation)
│   │   └── migrations/        # DB 마이그레이션 (16개)
│   └── Dockerfile
│
├── postgres/                  # PostgreSQL 18 + pgvector
│   └── Dockerfile
│
├── nginx/                     # 리버스 프록시
│   ├── nginx.conf
│   └── security-headers.conf
│
├── .github/workflows/         # CI/CD
│   ├── ci.yml                 # 테스트
│   └── deploy.yml             # 배포
│
├── docker-compose.yml         # 개발용 (postgres만)
├── docker-compose.prod.yml    # 프로덕션 (전체)
└── scripts/                   # SSL 관련 스크립트
```

### 추가 학습
- [Next.js App Router 공식 문서](https://nextjs.org/docs/app)
- [NestJS 공식 문서](https://docs.nestjs.com)
- [Docker 멀티스테이지 빌드](https://docs.docker.com/build/building/multi-stage/)

---

## 2. 백엔드 (NestJS)

### 2.1 모듈 시스템 — Spring과 대응

| NestJS | Spring | 역할 |
|--------|--------|------|
| `@Module()` | `@Configuration` | 의존성 등록 컨테이너 |
| `@Controller()` | `@RestController` | HTTP 요청 핸들러 |
| `@Injectable()` | `@Service` / `@Component` | DI 대상 서비스 |
| `@InjectRepository()` | `@Autowired Repository<T>` | 리포지토리 주입 |
| `@UseGuards()` | `@PreAuthorize` / Filter | 인증/인가 |
| `ValidationPipe` | `@Valid` + Validator | DTO 검증 |
| `@Cron()` | `@Scheduled` | 스케줄링 |

### 2.2 모듈 의존성 그래프

```
AppModule
├── ConfigModule.forRoot({ isGlobal: true })
├── TypeOrmModule.forRootAsync(...)
├── ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])
├── SentryModule.forRoot()
│
├── AuthModule ──→ UsersModule, PassportModule, JwtModule
├── UsersModule ──→ CommonModule (R2Storage)
├── ContentsModule ──→ TmdbModule, CommonModule
├── RankingsModule ──→ KobisModule, TmdbModule, ContentsModule,
│                      EmbeddingModule, CommonModule, ScheduleModule
├── ReviewsModule ──→ WatchlistModule, CommonModule (Revalidation)
├── WatchlistModule ──→ ContentsModule
└── ChatModule ──→ ContentsModule, EmbeddingModule, ConfigModule
```

### 2.3 DI와 데코레이터

**서비스 주입**
```typescript
// Spring의 @Autowired + @Service에 해당
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)           // Spring의 @Autowired Repository<Review>
    private readonly reviewRepo: Repository<Review>,
    private readonly watchlistService: WatchlistService,  // 타입 기반 자동 주입
    private readonly revalidateService: RevalidateService,
  ) {}
}
```

**커스텀 데코레이터**
```typescript
// @CurrentUser — Spring의 @AuthenticationPrincipal에 해당
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;  // JwtStrategy가 주입한 유저 정보
  },
);

// @Roles — Spring의 @RolesAllowed에 해당
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// 사용
@Post('signup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
async register(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {}
```

### 2.4 TypeORM — JPA와 대응

| TypeORM | JPA/Hibernate | 역할 |
|---------|---------------|------|
| `@Entity()` | `@Entity` | 테이블 매핑 |
| `@Column()` | `@Column` | 컬럼 매핑 |
| `@PrimaryGeneratedColumn()` | `@Id @GeneratedValue` | PK |
| `@ManyToOne()` | `@ManyToOne` | 관계 |
| `@CreateDateColumn()` | `@CreatedDate` | 생성일 자동 |
| `Repository<T>` | `JpaRepository<T, ID>` | CRUD |
| `createQueryBuilder()` | JPQL / Criteria API | 동적 쿼리 |
| Migration | Flyway / Liquibase | 스키마 버전 관리 |

**핵심 설정** (app.module.ts)
```typescript
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    synchronize: false,     // 직접 마이그레이션 관리 (Spring의 ddl-auto: none)
    migrationsRun: true,    // 앱 시작 시 자동 실행 (Flyway 자동 마이그레이션)
    autoLoadEntities: true, // 모듈에 등록된 Entity 자동 감지
    extra: {
      max: 50,              // 커넥션 풀 (Spring HikariCP의 maximumPoolSize)
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  }),
})
```

**Entity 예시** (Review)
```typescript
@Entity('reviews')
@Unique(['userId', 'contentId'])   // JPA의 @Table(uniqueConstraints)
export class Review {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ name: 'likes_count', default: 0 })
  likesCount!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Exclude()                        // 직렬화 제외 (Jackson의 @JsonIgnore)
  @Column({ nullable: true })
  password!: string | null;
}
```

### 2.5 가드/인터셉터/파이프 — Spring Filter/Interceptor와 대응

```
요청 흐름 (NestJS):
Guard → Interceptor(before) → Pipe → Controller → Service → Interceptor(after)

Spring 대응:
Filter → HandlerInterceptor(pre) → @Valid → Controller → Service → HandlerInterceptor(post)
```

**가드 (Guard = Spring Security Filter)**

| 가드 | 역할 | 적용 방식 |
|------|------|---------|
| `JwtAuthGuard` | JWT 토큰 검증 (401) | `@UseGuards(JwtAuthGuard)` |
| `OptionalJwtAuthGuard` | JWT 선택적 검증 (자격증명 없으면 guest, 무효/만료 토큰은 401) | 비로그인 허용 엔드포인트 |
| `RolesGuard` | 역할 기반 인가 (403) | `@Roles(UserRole.ADMIN)` |
| `ThrottlerGuard` | Rate Limiting | 컨트롤러 레벨 (`@UseGuards(ThrottlerGuard)`) |
| `ChatThrottlerGuard` | 채팅 Rate Limiting (비로그인 5회/로그인 10회) | 채팅 엔드포인트 |

**파이프 (Pipe = @Valid)**
```typescript
// 글로벌 ValidationPipe (main.ts)
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // DTO에 없는 속성 제거
  forbidNonWhitelisted: true, // 없는 속성이면 400 에러
  transform: true,            // 자동 타입 변환
}));
```

### 2.6 인증 흐름

**JWT + Refresh Token Rotation**
```
로그인/소셜 로그인 성공
  → Access Token (JWT, 15분) + Refresh Token (opaque, 7일)
  → 둘 다 HttpOnly 쿠키로 브라우저에 설정
  → Refresh Token은 SHA-256 해시 후 DB 저장

API 요청
  → 브라우저가 세션 쿠키 자동 전송 (withCredentials)
  → JwtStrategy가 access cookie를 우선 읽고, 필요 시 Bearer 헤더 fallback

토큰 만료 (401)
  → POST /auth/refresh
  → refresh cookie를 우선 사용, 필요 시 body refresh_token fallback
  → 트랜잭션 + pessimistic_write lock (동시성 제어)
  → 기존 토큰 삭제 → 새 토큰 쌍 발급 (Rotation)
  → 새 access/refresh 쿠키로 교체

로그아웃
  → 서버: Refresh Token DB에서 삭제 + 세션 쿠키 제거
  → 클라이언트: user 상태 초기화 + 레거시 auth storage 정리
```

**OAuth2 소셜 로그인** (Google/Kakao/Naver)
```
1. GET /auth/google
   → state 쿠키 설정 (CSRF 방지)
   → Google 인증 페이지 리다이렉트

2. GET /auth/google/callback?code=...&state=...
   → state 쿠키 검증
   → code → access_token 교환
   → 프로필 조회

3. 기존 유저
   → 백엔드가 access/refresh 쿠키 설정
   → /auth/callback?status=success 로 리다이렉트
   → 프론트가 /users/me 로 세션 확인 후 로그인 상태 반영

4. 신규 유저
   → 5분짜리 social_signup JWT를 filmott_social_signup 쿠키에 저장
   → /auth/callback?new=true#signup=... 로 리다이렉트
   → 프론트가 hash signup token을 sessionStorage에 저장 (쿠키 누락 fallback)
   → 닉네임 설정 후 POST /auth/social/complete-signup
   → 회원가입 완료 시 세션 쿠키 설정
```

### 2.7 스케줄링 (@Cron)

| 스케줄 (KST) | 서비스 | 작업 |
|-------------|--------|------|
| 매일 00:05 | RankingsService | KOBIS 일별 박스오피스 |
| 매일 12:00 | RankingsService | KOBIS 일별 보정 반영 |
| 매주 월 10:00 | RankingsService | KOBIS 주간 박스오피스 |
| 매일 06:00 | RankingsService | TMDB 트렌딩 (일간/주간) |
| 매일 07:00 | RankingsService | 한국TV Discover 수집 + 메타데이터 캐싱 |
| 매일 03:00 | AuthService | 만료 Refresh Token 정리 |
| 매 6시간 | ContentsService | 인물 캐시 만료 엔트리 정리 |

### 2.8 비동기 처리 패턴

**1. Promise.all — 독립 작업 병렬 처리**
```typescript
// 검색: person + movie + tv 동시 호출
const [personResult, movieResult, tvResult] = await Promise.all([
  this.tmdbService.searchByType(query, 'person', 1),
  this.tmdbService.searchByType(query, 'movie', page),
  this.tmdbService.searchByType(query, 'tv', page),
]);
```

**2. 백그라운드 갱신 (Stale-While-Revalidate)**
```typescript
// TTL 초과: 캐시 즉시 반환 + 백그라운드 갱신 (await 안 함)
this.refreshInBackground(tmdbId, type);  // fire-and-forget
return cached;

private refreshInBackground(tmdbId: number, type: string): void {
  const key = `${type}:${tmdbId}`;
  if (this.refreshingIds.has(key)) return; // 중복 방지
  this.refreshingIds.add(key);
  this.fetchAndSave(tmdbId, type)
    .catch((err) => this.logger.warn(`갱신 실패: ${err}`))
    .finally(() => this.refreshingIds.delete(key));
}
```

**3. SSE (Server-Sent Events) — AI 채팅 chunk 출력**
```typescript
// Controller: 응답 헤더 설정
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('X-Accel-Buffering', 'no');  // Nginx 버퍼링 비활성화
res.flushHeaders();

// 연결 끊김 감지
const abortController = new AbortController();
res.on('close', () => abortController.abort());

// safeSend 패턴 (res.destroyed 체크)
const safeSend = (event: string, data: unknown) => {
  if (!abortController.signal.aborted && !res.destroyed) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
};
```

AI 채팅은 OpenAI 토큰을 그대로 스트리밍하지 않는다. 백엔드가 먼저 JSON Schema 구조화 응답을 완성하고 런타임 검증을 통과한 뒤, 렌더링된 Markdown을 `text` 이벤트 chunk로 나눠 보낸다.

SSE 이벤트:
- `text`: 검증 완료된 Markdown 답변 chunk
- `recommendations`: 구조화 응답의 `recommendations[]` 중 후보 작품과 `tmdbId/contentType`이 매칭된 카드 데이터
- `done`: 정상 종료
- `error`: 실패 메시지

추천 카드 생성 규칙:
- source-of-truth는 Markdown 텍스트가 아니라 구조화 응답의 `recommendations[]`
- `**굵은 글씨**`나 제목 문자열 재추출은 카드 생성에 사용하지 않음
- 후보 외 추천작은 텍스트에만 남기고, 즉시 카드로 만들지 않음

**4. RxJS → Promise (firstValueFrom)**
```typescript
// NestJS HttpService는 Observable 반환 → Promise로 변환
const { data } = await firstValueFrom(
  this.httpService.get<TmdbItem>(`/${type}/${tmdbId}`, { params }),
);
```

**5. 트랜잭션 (pessimistic lock)**
```typescript
// Refresh Token Rotation: 동시성 제어
return this.dataSource.transaction(async (manager) => {
  const token = await manager.findOne(RefreshToken, {
    where: { token: hashedInput },
    lock: { mode: 'pessimistic_write' },  // SELECT ... FOR UPDATE
  });
  await manager.remove(token);
  // ... 새 토큰 발급
});
```

### 2.9 외부 API 호출

| API | BaseURL | Timeout | Rate Limit 방어 |
|-----|---------|---------|----------------|
| TMDB | `https://api.themoviedb.org/3` | 10초 | 250ms sleep |
| KOBIS | `https://www.kobis.or.kr/kobisopenapi/webservice/rest` | 15초 | 순차 처리 |
| OpenAI | SDK 사용 | - | max_completion_tokens |

### 2.10 AI 채팅 추천 파이프라인

```
ChatSection
  → sendChatMessage(content, history)
  → POST /api/chat/messages (SSE)
  → ChatController safeSend
  → ChatService
      1. OptionalJwtAuthGuard + IP/user rate limit
      2. IntentAnalyzerService: 최근 대화 맥락 포함 의도 분석
      3. ContentSearchService: SQL 메타데이터 필터 + 벡터 검색 + 개인화 신호 반영
      4. OpenAI Chat Completions: response_format json_schema
      5. structured-chat-response.ts: unknown JSON 런타임 검증
      6. Markdown 렌더링 + 텍스트 chunk SSE 출력
      7. recommendations 이벤트: 후보와 매칭된 추천 카드만 전송
```

구조화 응답 스키마:
```typescript
interface StructuredChatResponse {
  intro: string | null;
  recommendations: {
    tmdbId: number | null;
    contentType: 'movie' | 'tv' | null;
    title: string;
    englishTitle: string | null;
    reason: string;
  }[];
  outro: string | null;
}
```

이 구조의 목적은 추천 카드와 텍스트 렌더링을 분리하지 않는 것이다. LLM이 최종 선택한 `recommendations[]`를 카드 생성 기준으로 사용하므로, 장르/키워드 설명에 포함된 굵은 글씨가 포스터 카드로 오인되는 문제가 없다.

### 2.11 CORS 설정

```typescript
// main.ts
app.enableCors({
  origin: corsOrigin,     // 개발: http://localhost:3000
  credentials: true,      // 프로덕션: https://filmott.kr
});
```

### 추가 학습
- [NestJS Fundamentals](https://docs.nestjs.com/fundamentals/custom-providers) — DI 심화
- [NestJS Guards](https://docs.nestjs.com/guards) — 인증/인가 패턴
- [TypeORM Migration Guide](https://typeorm.io/migrations) — 마이그레이션
- [Passport.js JWT Strategy](https://docs.nestjs.com/recipes/passport) — JWT 인증
- [NestJS Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events) — SSE
- [RxJS firstValueFrom](https://rxjs.dev/api/index/function/firstValueFrom) — Observable→Promise

---

## 3. 프론트엔드 (Next.js App Router)

### 3.1 렌더링 전략

| 전략 | 설정 | 사용 시점 | 예시 |
|------|------|---------|------|
| **ISR** | `{ next: { revalidate: N } }` | 자주 안 바뀌는 데이터 | 메인(6h), 상세(1h), 인물(6h) |
| **SSR (no-store)** | `{ cache: 'no-store' }` | 실시간 데이터 | 리뷰 목록, 검색 결과 |
| **CSR** | `'use client'` + useEffect/SWR | 사용자 상호작용 | 채팅, 좋아요, 폼 |
| **Static** | 빌드 타임 생성 | 고정 콘텐츠 | 이용약관, 개인정보처리방침 |

**ISR + On-Demand Revalidation 흐름**
```
1. 빌드 시: 메인 페이지 HTML 생성 + .next/cache에 저장
2. 요청 시: 캐시 HIT → 즉시 반환 (x-nextjs-cache: HIT)
3. revalidate 시간 경과: 백그라운드에서 재생성
4. On-Demand: POST /internal/revalidate → 즉시 캐시 무효화
   (리뷰 CRUD, 배치 완료 시 호출)
```

### 3.2 Server Component vs Client Component

**Server Component** (기본값) — 서버에서 렌더링, JS 번들 미포함
```typescript
// frontend/src/app/page.tsx — 메인 페이지
export default function HomePage() {
  // fetchApi는 서버에서 실행 (브라우저에 코드 안 감)
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <BoxOfficeSection />  {/* async Server Component */}
    </Suspense>
  );
}

async function BoxOfficeSection() {
  const data = await fetchApi('/rankings?...', { next: { revalidate: 21600 } });
  return <RankingCarousel data={data} />;
}
```

**Client Component** — 브라우저에서 실행, 상호작용 필요 시
```typescript
'use client';  // 이 지시자가 있어야 Client Component

export default function ChatSection() {
  const [messages, setMessages] = useState([]);
  // useState, useEffect, onClick 등 브라우저 API 사용 가능
}
```

**구분 기준**:
- Server: 데이터 페칭, SEO, 정적 렌더링
- Client: 이벤트 핸들러, 상태 관리, 브라우저 API (localStorage 등)

### 3.3 데이터 페칭

**fetchApi 래퍼** (lib/fetcher.ts)
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

**페이지별 페칭 설정**:

| 페이지 | 엔드포인트 | 캐시 설정 |
|--------|-----------|---------|
| 메인 (/) | `/rankings`, `/reviews/recent` | `revalidate: 21600` (6h) |
| 상세 (/contents/[type]/[tmdbId]) | `/contents/:type/:tmdbId` | `revalidate: 3600` (1h) |
| 상세 리뷰 | `/reviews?contentId=` | `cache: 'no-store'` |
| 인물 (/person/[personId]) | `/contents/person/:id` | `revalidate: 21600` (6h) |
| 인물 credits | `/contents/person/:id/credits` | `revalidate: 21600` (6h) |
| 프로필 (/profile/[userId]) | `/users/:id/profile` | `revalidate: 300` (5m) |
| 검색/탐색 | `/contents/search`, `/contents/discover` | `cache: 'no-store'` |

### 3.4 상태 관리

**AuthContext (Context API)**
```
AuthProvider (layout.tsx에 감싸짐)
  │
  ├── user: User | null
  ├── isLoading: boolean
  ├── handleAuthSuccess(data) — 로그인 성공 시 user 상태 저장
  ├── logout() — 서버 로그아웃 요청 + user 상태 초기화
  ├── openAuthModal() / closeAuthModal() — 로그인 모달
  └── updateUser(user) — 프로필 수정 반영
```

**localStorage 사용**
```
filmott_chat_messages — 채팅 히스토리 + assistant 추천 메타데이터
  (최근 50개, 비로그인→로그인 전환에도 유지, 중복 추천 방지에 활용)
레거시 auth key들(access_token, refresh_token, user)은
  쿠키 세션 전환 이후 마이그레이션 정리 대상으로만 사용
```

**API 클라이언트 세션 자동 갱신** (lib/api.ts)
```
1. Axios 인스턴스는 withCredentials=true로 세션 쿠키를 자동 전송
2. Response Interceptor (401 감지):
   a. isRefreshing 플래그 확인 → 이미 갱신 중이면 큐에 대기
   b. refreshApi.post('/auth/refresh') 호출 (별도 인스턴스, 인터셉터 없음)
   c. 성공: 원 요청 재시도
   d. 실패: AUTH_REQUIRED_EVENT 발생 → 레거시 auth storage 정리 + AuthContext가 모달 열기

3. 앱 초기 진입 시 세션 복원:
   a. refreshApi.get('/users/me') 호출
   b. 401이면 refreshApi.post('/auth/refresh') 후 /users/me 재조회
```

### 3.5 라우팅

```
src/app/
├── layout.tsx              — 루트 레이아웃 (Header, Footer, AuthProvider)
├── page.tsx                — 메인 페이지 (ISR)
├── not-found.tsx           — 404 페이지
├── global-error.tsx        — 글로벌 에러 바운더리
├── (auth)/                 — 소셜 로그인 진입 라우트 그룹
│   ├── login/page.tsx      — AuthModal 열고 홈으로 리다이렉트
│   └── signup/page.tsx     — AuthModal 열고 홈으로 리다이렉트
├── auth/callback/page.tsx  — OAuth 콜백 (Client Component)
├── contents/[type]/[tmdbId]/
│   ├── page.tsx            — 작품 상세 (ISR 1h)
│   └── actions.ts          — Server Actions
├── person/[personId]/page.tsx — 인물 상세 (ISR 6h)
├── profile/
│   ├── page.tsx            — 내 프로필 (Client)
│   ├── [userId]/page.tsx   — 공개 프로필 (ISR 5m)
│   └── watchlist/page.tsx  — 워치리스트 (Client)
├── search/page.tsx         — 검색 (no-store)
├── discover/page.tsx       — 탐색 (no-store)
├── admin/
│   ├── page.tsx            — 관리 대시보드 (Client)
│   ├── login/page.tsx      — 관리자 로그인
│   └── actions.ts          — Server Actions (성인물 차단 등)
├── internal/revalidate/route.ts — ISR 캐시 갱신 API
├── terms/page.tsx          — 이용약관 (Static)
├── privacy/page.tsx        — 개인정보처리방침 (Static)
└── sitemap.ts              — 동적 사이트맵 (ISR 24h)
```

### 3.6 컴포넌트 설계

```
components/
├── layout/      — Header (스크롤 감지, 검색), Footer
├── auth/        — AuthModal, SocialLoginButton, NicknameSetupModal
├── chat/        — ChatSection, ChatInput, StreamingText, RecommendationCard
├── content/     — ContentCard, ContentGrid, CastCarousel, FilterBar
├── ranking/     — RankingCard, RankingCarousel (탭)
├── review/      — ReviewForm, ReviewFormModal, ReviewCard, StarRating, LikeButton, CommentList
├── watchlist/   — WatchlistStatusButton (드롭다운), WatchlistCard
├── profile/     — ProfileImageUploader, NicknameEditor, OttSubscriptions
├── icons/       — 커스텀 아이콘 (CommentIcon 등)
├── common/      — TmdbImage, TimeAgo, UserAvatar, SectionError
├── search/      — SearchTypeFilter, SearchResultSections
├── admin/       — AdminTabs, UserManagement, RankingRefresh
├── analytics/   — GoogleAnalytics
└── pwa/         — ServiceWorkerRegister
```

### 추가 학습
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching) — ISR/캐시 전략 핵심
- [Server vs Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns) — 패턴 가이드
- [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching) — fetch 옵션
- [React Context 공식 문서](https://react.dev/reference/react/useContext)
- [Axios Interceptors](https://axios-http.com/docs/interceptors) — 토큰 갱신 패턴

---

## 4. 인프라/배포

### 4.1 Docker 멀티스테이지 빌드

**Frontend (3단계)**
```
Stage 1 (deps):     npm ci → node_modules 생성
Stage 2 (builder):  npm run build → .next/ 생성
Stage 3 (runtime):  standalone + static + public 복사
                    nextjs:1001 유저로 실행
                    .next/cache chown (ISR 캐시 쓰기 권한)
```

**Backend (2단계)**
```
Stage 1 (builder):  npm ci + npm run build → dist/ 생성
Stage 2 (runtime):  npm ci --omit=dev + dist/ 복사
                    nestjs:1001 유저로 실행
```

**PostgreSQL**
```
postgres:18-alpine + pgvector 0.8.2 빌드 설치
```

### 4.2 Docker Compose 서비스 간 네트워크

```
docker-compose.prod.yml 기본 네트워크 (bridge)
┌──────────────────────────────────────────────────┐
│  nginx ──→ frontend:3000                         │
│       ──→ backend:3001                           │
│                                                  │
│  backend ──→ postgres:5432 (depends_on: healthy) │
│         ──→ frontend:3000 (FRONTEND_INTERNAL_URL, revalidation 호출) │
│         ──→ 브라우저 리다이렉트는 https://filmott.kr (FRONTEND_URL) │
│                                                  │
│  frontend ──→ external (https://filmott.kr/api)  │
│           (SSR 시 자기 자신을 통해 API 호출)        │
└──────────────────────────────────────────────────┘

외부 노출:
  nginx: 80, 443
  postgres: 127.0.0.1:5432 (로컬만)
```

### 4.3 Nginx 리버스 프록시

```nginx
# SSE chunk 출력 (AI 채팅)
location /api/chat/ {
    proxy_pass http://backend;
    proxy_buffering off;       # text/recommendations 이벤트 즉시 전달
    proxy_read_timeout 300s;   # 5분 (긴 대화)
}

# 일반 API
location /api/ {
    proxy_pass http://backend;
    proxy_read_timeout 30s;
}

# 내부 API 차단 (revalidation 등)
location /internal/ {
    deny all;
    return 403;
}

# 정적 파일 (1년 캐시)
location /_next/static/ {
    proxy_pass http://frontend;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# 프론트엔드 (WebSocket 업그레이드 지원)
location / {
    proxy_pass http://frontend;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 4.4 SSL

```
Cloudflare (Full Strict SSL)
  → Nginx (Let's Encrypt 인증서)
    → TLSv1.2 / TLSv1.3
    → HSTS: max-age=31536000; includeSubDomains
```

- 초기 발급: `scripts/init-ssl.sh` (더미 인증서 → certbot webroot)
- 자동 갱신: `scripts/renew-ssl.sh` (crontab 매월 1일, 15일)

### 4.5 CI/CD (GitHub Actions)

```
main 브랜치 push
    │
    ▼
┌── CI (ci.yml) ──────────────┐
│  Backend 테스트 ─┐ (병렬)    │
│  Frontend 테스트 ─┘           │
└─────────────────────────────┘
    │ 통과
    ▼
┌── Deploy (deploy.yml) ──────┐
│  1. SSH 접속                 │
│  2. git fetch + reset --hard │
│  3. frontend/backend build   │
│  4. frontend/backend up -d   │
│  5. nginx restart            │
│  6. backend healthcheck      │
│  7. frontend 내부 ISR 갱신    │
│  8. docker image prune       │
└─────────────────────────────┘
```

### 4.6 PostgreSQL 튜닝

```
24GB 서버 기준:
  shared_buffers = 6GB        (메모리 25% — 자주 접근하는 데이터 캐시)
  effective_cache_size = 18GB  (메모리 75% — 쿼리 플래너 힌트)
  work_mem = 32MB              (정렬/해시 작업 메모리)
  max_connections = 150        (TypeORM 풀 50 + 여유)
  random_page_cost = 1.1       (SSD 최적화, HDD는 4.0)
  log_min_duration_statement = 1000  (1초 이상 슬로우 쿼리 로깅)
```

### 4.7 서버 크론탭

```
매일 19:00 UTC (04:00 KST)     — DB 백업 (7일 보관)
매주 일 19:30 UTC (04:30 KST)  — Docker 이미지 정리
매월 1일, 15일 00:00 UTC        — SSL 인증서 갱신
```

### 추가 학습
- [Docker Compose Networking](https://docs.docker.com/compose/how-tos/networking/) — 서비스 간 통신
- [Nginx Reverse Proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) — 프록시 설정
- [Let's Encrypt + Docker](https://letsencrypt.org/docs/) — SSL 자동화
- [GitHub Actions 공식 문서](https://docs.github.com/en/actions) — CI/CD 워크플로우
- [PostgreSQL Tuning for Web](https://pgtune.leopard.in.ua/) — 서버 스펙별 튜닝 계산기

---

## 5. 횡단 관심사

### 5.1 캐싱 레이어

```
요청 →  [Cloudflare CDN]  (정적 파일, DNS)
    →  [Nginx]            (/_next/static/ 1년 캐시)
    →  [Next.js ISR]      (.next/cache, 페이지별 TTL)
    →  [인메모리 캐시]     (blockedIds 5분, person 72시간)
    →  [DB 캐시]          (contents 테이블, 72시간 TTL)
    →  [외부 API]         (TMDB, KOBIS, OpenAI)
```

### 5.2 이미지 최적화

| 소스 | 방식 | 설정 |
|------|------|------|
| TMDB | `TmdbImage` 래퍼 (`unoptimized={true}`) | CDN 직접 로드, 사이즈별 URL |
| R2 프로필 | `next/image` 최적화 | sharp 리사이즈 후 저장 |

**TMDB 사이즈 규칙**: 로고 w92, 캐스트 w185, 포스터 w342, 백드롭 w1280

### 5.3 모니터링 (Sentry)

```
Backend: @sentry/nestjs
  - instrument.ts에서 초기화
  - SentryGlobalFilter로 모든 예외 자동 추적
  - tracesSampleRate: 0.01 (1%)

Frontend: @sentry/nextjs
  - sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  - instrumentation.ts에서 런타임별 로드
  - tracesSampleRate: client/server 0.01, edge 0.1
  - Replay: 에러 시에만 (replaysOnErrorSampleRate: 1.0)
```

### 5.4 보안

| 영역 | 구현 |
|------|------|
| **인증** | JWT access/refresh를 HttpOnly 쿠키로 관리 + Refresh Token Rotation + pessimistic lock |
| **CSRF** | OAuth state 쿠키 (httpOnly, sameSite: lax) |
| **Rate Limiting** | ThrottlerModule 기본 10회/60초, 컨트롤러별 `@UseGuards(ThrottlerGuard)` + `@Throttle()` 개별 설정, 채팅 비로그인 5회 |
| **XSS** | Nginx 보안 헤더, React 자동 이스케이프, 인증 토큰은 JS 비가시 쿠키 사용 |
| **SQL Injection** | TypeORM 파라미터 바인딩 |
| **내부 API** | Nginx `/internal/` 차단 + Bearer 토큰 인증 + revalidate path allowlist |
| **SSL** | TLSv1.2/1.3 + HSTS + Cloudflare Full Strict |
| **Non-root** | Docker 컨테이너 모두 비-root 유저 실행 |
| **직렬화** | `@Exclude()`로 password 필드 노출 방지 |
| **업로드 제한** | Nginx `client_max_body_size 6m` (API location) |

### 5.5 GA 이벤트 추적

```typescript
// lib/ga.ts
trackEvent('chat_message_sent', { message_count: n });
trackEvent('chat_example_clicked', { question: '...' });
trackEvent('content_detail_view', { tmdb_id, title, content_type });
trackEvent('review_created', { content_id });
trackEvent('social_login_started', { provider });
trackEvent('signup_completed', { provider });
trackEvent('watchlist_added', { status, content_type });
```

### 5.6 SEO 구조화 데이터

- **canonical URL**: 전체 페이지에 `<link rel="canonical">` 적용
- **JSON-LD**: 작품 상세 페이지에 Movie/TVSeries 구조화 데이터 (이름, 이미지, 평점, 감독, 출연진 등)
- **robots.txt**: `/search` 경로 크롤링 차단 (검색 결과 페이지 인덱싱 방지)

### 5.7 OpenAI API timeout

| 용도 | timeout |
|------|---------|
| 채팅 구조화 응답 생성 | 30초 |
| 의도 분석 | 10초 |
| 임베딩 | 10초 |

### 5.8 배치 실패 알림

- Cron 배치 실패 시 `Sentry.captureException()`으로 자동 알림
- 대상: KOBIS 박스오피스, TMDB 트렌딩, 한국TV Discover

### 추가 학습
- [Web Caching Explained](https://web.dev/articles/http-cache) — HTTP 캐싱 기초
- [Sentry for NestJS](https://docs.sentry.io/platforms/javascript/guides/nestjs/) — 에러 추적
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — 웹 보안 기초
- [next/image 최적화](https://nextjs.org/docs/app/building-your-application/optimizing/images) — 이미지 전략

---

## 6. 종합 학습 로드맵

프로젝트를 깊이 이해하기 위한 순서:

### Step 1: 백엔드 기초 (Spring 경험 활용)
1. `backend/src/app.module.ts` — 전체 모듈 구성 파악
2. `backend/src/auth/` — 인증 흐름 (Spring Security 대비)
3. `backend/src/contents/contents.service.ts` — 캐싱 패턴
4. `backend/src/reviews/reviews.service.ts` — CRUD + 트랜잭션

### Step 2: 프론트엔드 핵심 (새로운 영역)
1. `frontend/src/app/layout.tsx` — App Router 레이아웃 이해
2. `frontend/src/app/page.tsx` — ISR + Suspense 패턴
3. `frontend/src/lib/api.ts` — Axios 인터셉터 (세션 쿠키 갱신)
4. `frontend/src/contexts/AuthContext.tsx` — 세션 복원 + 로그인 모달 상태 관리
5. `frontend/src/components/chat/ChatSection.tsx` — SSE + 클라이언트 상태 + 추천 메타데이터 history

### Step 3: 인프라
1. `docker-compose.prod.yml` — 서비스 구성
   `FRONTEND_URL`은 공개 도메인, `FRONTEND_INTERNAL_URL`은 Docker 내부 통신용으로 분리
2. `nginx/nginx.conf` — 프록시 + SSL
3. `.github/workflows/deploy.yml` — CI/CD 파이프라인

### Step 4: 심화
1. `backend/src/chat/` — AI 추천 (의도 분석 + 벡터/SQL 검색 + 구조화 응답 + SSE)
   `backend/src/chat/structured-chat-response.ts` — 구조화 응답 스키마/검증/렌더링
2. `backend/src/rankings/rankings.service.ts` — 배치 + 스케줄링
3. 캐싱 전체 흐름 추적 (Cloudflare → Nginx → ISR → 인메모리 → DB)

### 추천 외부 학습 자료
- [NestJS 공식 강좌 (무료)](https://courses.nestjs.com/) — 모듈, DI, 가드 등
- [Next.js Learn](https://nextjs.org/learn) — App Router 핸즈온
- [TypeORM 공식 문서](https://typeorm.io/) — Entity, Migration, QueryBuilder
- [Docker Getting Started](https://docs.docker.com/get-started/) — 컨테이너 기초
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/) — SQL, 인덱스, 튜닝
- [pgvector 문서](https://github.com/pgvector/pgvector) — 벡터 검색
- [OAuth 2.0 Simplified](https://aaronparecki.com/oauth-2-simplified/) — OAuth 흐름 이해
