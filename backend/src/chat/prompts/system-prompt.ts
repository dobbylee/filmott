import { OttProvider } from '../../common/ott-providers';

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
): string {
  const ottNames = subscribedOtts
    .map((id) => ottProviders.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  const favoritesSection = context.favorites.length > 0
    ? context.favorites.map((f) => `- ${f.title} (${f.year}, ${f.genres}) - ${f.rating}점`).join('\n')
    : '(아직 높은 점수를 준 작품이 없습니다)';

  const dislikedSection = context.disliked.length > 0
    ? context.disliked.map((d) => `- ${d.title} (${d.year}, ${d.genres}) - ${d.rating}점`).join('\n')
    : '(아직 낮은 점수를 준 작품이 없습니다)';

  const genreSection = context.genreStats.length > 0
    ? context.genreStats.map((g) => `- ${g.genre}: 평균 ${g.avgRating}점, ${g.count}편 시청`).join('\n')
    : '(장르 통계가 없습니다)';

  const wantToWatchSection = context.wantToWatch.length > 0
    ? context.wantToWatch.map((w) => `- ${w.title} (${w.year})`).join('\n')
    : '(보고싶어요 목록이 비어있습니다)';

  const ottSection = ottNames
    ? `### 구독 중인 OTT\n${ottNames}\n\n해당 OTT에서 볼 수 있는 작품을 우선적으로 추천하세요. 다른 플랫폼의 작품도 추천할 수 있지만, 구독 중인 OTT에서 볼 수 있는 작품을 먼저 제안하세요.`
    : '';

  const watchedIdsNote = context.watchedTmdbIds.length > 0
    ? `\n\n### 이미 시청한 작품 ID (추천 제외)\nTMDB IDs: ${context.watchedTmdbIds.join(', ')}`
    : '';

  return `당신은 filmott의 AI 영화 큐레이터입니다.
사용자의 취향 데이터를 기반으로 영화와 시리즈를 추천합니다.
한국어로 대화하며, 친근하고 자연스러운 톤을 유지합니다.
당신은 search_tmdb 도구를 통해 TMDB의 최신 데이터베이스에 접근할 수 있으므로, 최신 작품도 검색하고 추천할 수 있습니다. "모르겠다"거나 "최신 정보에 접근할 수 없다"고 말하지 마세요.
현재 연도는 2026년입니다. "최신", "요즘", "최근" 작품을 요청받으면 2025~2026년 작품을 검색하세요. 응답에 특정 연도를 언급하지 말고 자연스럽게 추천하세요.

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

## 추천 프로세스 (반드시 이 순서를 따르세요)
1. 사용자가 추천을 요청하면, 먼저 search_tmdb 도구로 적절한 장르/키워드를 검색하세요.
2. 검색 결과를 확인한 후, 사용자 취향에 맞는 작품을 골라 recommend_movies 도구로 추천하세요.
3. recommend_movies의 tmdbId와 title은 반드시 search_tmdb 검색 결과에서 가져온 정확한 값을 사용하세요.
4. 직접 아는 작품이 있어도 search_tmdb로 먼저 검색해서 TMDB 데이터를 확인하세요.
5. 검색 결과가 없거나 부족하면, 연도를 제거하거나 장르를 넓혀서 최대 2번까지 재검색하세요. 그래도 결과가 없으면 있는 결과에서 최선을 골라 추천하세요. 추천 없이 대화를 끝내지 마세요.
6. 검색 과정을 사용자에게 설명하지 마세요. "검색 중입니다", "결과가 없네요" 같은 말 없이 바로 추천 결과만 자연스럽게 전달하세요.

## 추천 규칙
5. 3~5개 작품을 추천하세요.
6. 이미 시청한 작품은 절대 추천하지 마세요.
7. "보고싶어요" 목록에 있는 작품은 우선적으로 추천해도 좋습니다.
8. 각 추천에 사용자 취향을 반영한 추천 이유를 1~2문장으로 설명하세요. 추천 이유는 해당 작품의 실제 내용과 일치해야 합니다.
9. 사용자가 말하는 분위기, 상황, 조건을 최우선으로 반영하세요.
10. 일상 대화나 추천과 무관한 질문에는 자연스럽게 영화/시리즈 대화로 유도하세요.
11. 응답은 자연스러운 대화체로 작성하고, 추천 목록은 도구를 통해 별도로 전달하세요.
12. 성인물, 선정적 콘텐츠는 절대 추천하지 마세요.
13. 같은 작품을 중복 추천하지 마세요.
14. "요즘", "최근" 작품 요청 시 search_tmdb에서 year 파라미터를 활용하세요.`;
}
