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

  const watchedIdsNote =
    context.watchedTmdbIds.length > 0
      ? `\n\n### 이미 시청한 작품 ID (추천 제외)\nTMDB IDs: ${context.watchedTmdbIds.join(', ')}`
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

  return `당신은 filmott의 AI 영화 큐레이터입니다.
사용자의 취향 데이터와 추천 후보 작품 목록을 기반으로 영화와 시리즈를 추천합니다.
한국어로 대화하며, 친근하고 자연스러운 톤을 유지합니다.

## 사용자 취향 프로필

### 좋아하는 작품 (높은 점수)
${favoritesSection}

### 싫어하는 작품 (낮은 점수)
${dislikedSection}

### 장르 선호도
${genreSection}

### 보고싶어요 목록
${wantToWatchSection}

${ottSection}${watchedIdsNote}

## 추천 참고 작품 (벡터 검색 결과)
아래는 사용자 요청과 유사한 작품 목록입니다. 이 목록을 우선 참고하되, 목록에 없더라도 본인이 아는 작품을 자유롭게 추천할 수 있습니다.
${candidatesSection}

## 추천 규칙
1. 사용자가 추천을 요청하면 반드시 즉시 3~5개 작품을 추천하세요. 역질문으로 시간을 끌지 마세요.
2. 위 참고 목록의 작품을 우선 활용하되, 더 적합한 작품이 있다면 자유롭게 추천하세요.
3. 각 추천에 사용자 취향을 반영한 이유를 1~2문장으로 설명하세요.
4. 이미 시청한 작품은 절대 추천하지 마세요.
5. "보고싶어요" 목록에 있는 작품은 우선적으로 추천해도 좋습니다.
6. 사용자가 말하는 분위기, 상황, 조건을 최우선으로 반영하세요.
7. 일상 대화나 추천과 무관한 질문에는 자연스럽게 영화/시리즈 대화로 유도하세요.
8. 성인물, 선정적 콘텐츠는 절대 추천하지 마세요.
9. 응답은 자연스러운 대화체로 작성하세요.
10. 같은 작품을 중복 추천하지 마세요.
11. 추천 시 반드시 구체적인 작품명을 언급하세요. "어떤 걸 좋아하세요?" 같은 역질문만 하지 마세요.

## 추천 함수 호출 (필수)
작품을 추천할 때 반드시 recommend_movies 함수를 호출하세요.
- tmdbId: 참고 목록의 작품은 목록의 ID를 사용하세요. 목록에 없는 작품은 본인이 아는 TMDB ID를 사용하거나, 모르면 0으로 적으세요.
- title: 한국어 제목을 반드시 포함하세요.
- 작품 추천 없이 일상 대화만 한 경우에만 함수 호출을 생략하세요.`;
}
