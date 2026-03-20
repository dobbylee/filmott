import { OttProvider } from '../../common/ott-providers';
import { SimilarContent } from '../embedding.service';

export interface FavoriteContent {
  title: string;
  year: string;
  genres: string;
  rating: number;
}

export interface GenreStat {
  genre: string;
  avgRating: string;
  count: number;
}

export interface WantToWatchContent {
  title: string;
  year: string;
}

export interface UserContext {
  favorites: FavoriteContent[];
  disliked: FavoriteContent[];
  genreStats: GenreStat[];
  watchedTmdbIds: number[];
  wantToWatch: WantToWatchContent[];
}

export function buildSystemPrompt(
  context: UserContext,
  subscribedOtts: string[],
  ottProviders: OttProvider[],
  candidates: SimilarContent[],
): string {
  const ottNames = subscribedOtts
    .map((id) => ottProviders.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  const favoritesSection =
    context.favorites.length > 0
      ? context.favorites
          .map(
            (f) => `- ${f.title} (${f.year}, ${f.genres}) - ${f.rating}점`,
          )
          .join('\n')
      : '(아직 높은 점수를 준 작품이 없습니다)';

  const dislikedSection =
    context.disliked.length > 0
      ? context.disliked
          .map(
            (d) => `- ${d.title} (${d.year}, ${d.genres}) - ${d.rating}점`,
          )
          .join('\n')
      : '(아직 낮은 점수를 준 작품이 없습니다)';

  const genreSection =
    context.genreStats.length > 0
      ? context.genreStats
          .map(
            (g) =>
              `- ${g.genre}: 평균 ${g.avgRating}점, ${g.count}편 시청`,
          )
          .join('\n')
      : '(장르 통계가 없습니다)';

  const wantToWatchSection =
    context.wantToWatch.length > 0
      ? context.wantToWatch
          .map((w) => `- ${w.title} (${w.year})`)
          .join('\n')
      : '(보고싶어요 목록이 비어있습니다)';

  const ottSection = ottNames
    ? `### 구독 중인 OTT\n${ottNames}\n\n해당 OTT에서 볼 수 있는 작품을 우선적으로 추천하세요. 다른 플랫폼의 작품도 추천할 수 있지만, 구독 중인 OTT에서 볼 수 있는 작품을 먼저 제안하세요.`
    : '';

  const candidatesSection =
    candidates.length > 0
      ? candidates
          .map(
            (c, i) =>
              `${i + 1}. [ID:${c.tmdbId}|${c.contentType}] ${c.title} (${c.voteAverage}점) - 장르: ${(c.genres || []).map((g) => g.name).join(', ')}\n   ${c.description}`,
          )
          .join('\n')
      : '(추천 후보가 없습니다)';

  const today = new Date().toISOString().split('T')[0];

  return `당신은 filmott의 AI 영화 큐레이터입니다. 한국어로 친근하게 대화합니다.
오늘 날짜: ${today}. "최신", "요즘", "올해" 등의 표현은 이 날짜를 기준으로 판단하세요.

## 사용자 취향

좋아하는 작품: ${favoritesSection}

싫어하는 작품: ${dislikedSection}

장르 선호도: ${genreSection}

보고싶어요: ${wantToWatchSection}

${ottSection}

## 추천 후보 작품
아래 목록에서 우선적으로 선택하세요. 목록에 적합한 작품이 없을 때만 본인 지식을 활용하세요.
${candidatesSection}

## 규칙
- 추천 요청 시 즉시 3~5개를 추천하세요. 역질문하지 마세요.
- 후보 목록에서 우선 선택하되, 사용자 취향 데이터가 있으면 취향에 맞는 작품을 최우선으로 추천하세요.
- 이미 시청한 작품과 성인물은 추천 금지.
- "보고싶어요" 목록 작품은 우선 추천 가능.
- 이전 대화에서 추천한 작품을 다시 추천하지 마세요.
- 추천과 무관한 질문은 영화/시리즈 대화로 유도.

## 응답 형식 (반드시 준수)
아래 형식으로 작성하세요:

1. 상황에 맞는 짧은 인사 한 줄
2. 각 작품을 아래 형식으로 한 줄씩:
   **한국어 제목 (영어 원제)** — 추천 이유 1~2문장
3. 마지막에 추가 요청을 유도하는 한 줄

예시:
비 오는 날 감성 충전할 영화 골라봤어요!

**리틀 포레스트 (Little Forest)** — 시골 풍경과 계절 요리가 주는 잔잔한 힐링, 빗소리와 잘 어울려요.

**어바웃 타임 (About Time)** — 따뜻한 로맨스와 유머가 우중충한 기분을 달래줍니다.

다른 분위기나 장르 원하면 말해주세요!

(볼드 제목은 시스템이 추천 카드를 자동 생성합니다. 영어 원제를 반드시 괄호 안에 포함하세요.)`;
}
