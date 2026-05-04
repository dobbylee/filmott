import { buildSystemPrompt, UserContext } from './system-prompt';
import { SimilarContent } from '../embedding.service';
import { ParsedIntent } from '../intent-analyzer';

describe('buildSystemPrompt', () => {
  const emptyContext: UserContext = {
    favorites: [],
    disliked: [],
    genreStats: [],
    watchedTmdbIds: [],
    wantToWatch: [],
    watchedGenres: [],
  };

  const emptyIntent: ParsedIntent = {
    ottProviderNames: [],
    countries: [],
    excludeCountries: [],
    personNames: [],
    referenceTitles: [],
    dateRange: null,
    contentType: null,
    genres: [],
    confidence: 'low',
  };

  const makeCandidates = (
    overrides: Partial<SimilarContent>[],
  ): SimilarContent[] =>
    overrides.map((o, i) => ({
      contentId: i + 1,
      tmdbId: 1000 + i,
      contentType: 'movie',
      title: `작품${i + 1}`,
      posterUrl: null,
      genres: [{ id: 18, name: '드라마' }],
      voteAverage: 8.0,
      description: '설명',
      similarity: 0,
      director: null,
      originCountry: 'KR',
      overview: null,
      ...o,
    }));

  it('유사도 점수가 0보다 큰 후보는 유사도 %를 포함해야 한다', () => {
    const candidates = makeCandidates([{ similarity: 0.95, title: '기생충' }]);
    const prompt = buildSystemPrompt(
      emptyContext,
      [],
      [],
      candidates,
      emptyIntent,
    );

    expect(prompt).toContain('유사도: 95%');
  });

  it('유사도 0인 후보는 유사도 텍스트를 포함하지 않아야 한다', () => {
    const candidates = makeCandidates([{ similarity: 0, title: 'KOBIS작품' }]);
    const prompt = buildSystemPrompt(
      emptyContext,
      [],
      [],
      candidates,
      emptyIntent,
    );

    expect(prompt).not.toContain('유사도:');
  });

  it('후보가 유사도 내림차순으로 정렬되어야 한다', () => {
    const candidates = makeCandidates([
      { similarity: 0.5, title: '중간작품', tmdbId: 2001 },
      { similarity: 0.9, title: '높은작품', tmdbId: 2002 },
      { similarity: 0.3, title: '낮은작품', tmdbId: 2003 },
    ]);
    const prompt = buildSystemPrompt(
      emptyContext,
      [],
      [],
      candidates,
      emptyIntent,
    );

    const idx1 = prompt.indexOf('높은작품');
    const idx2 = prompt.indexOf('중간작품');
    const idx3 = prompt.indexOf('낮은작품');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('유사도 규칙이 시스템 프롬프트에 포함되어야 한다', () => {
    const prompt = buildSystemPrompt(emptyContext, [], [], [], emptyIntent);

    expect(prompt).toContain('유사도가 높은 작품을 우선 추천하되');
    expect(prompt).toContain('30% 미만');
  });

  it('확정 추천 후보가 있으면 해당 후보만 본문에 사용하도록 안내해야 한다', () => {
    const candidates = makeCandidates([
      { title: '검색 후보', tmdbId: 2001, posterUrl: '/search.jpg' },
      { title: '확정 후보', tmdbId: 2002, posterUrl: '/confirmed.jpg' },
    ]);
    const prompt = buildSystemPrompt(
      emptyContext,
      [],
      [],
      candidates,
      emptyIntent,
      [],
      [candidates[1]],
    );

    expect(prompt).toContain('## 확정 추천 작품');
    expect(prompt).toContain('서버가 검증한 최종 추천 후보');
    expect(prompt).toContain('확정 추천 작품 전체를 같은 순서');
    expect(prompt).toContain('확정 추천 작품 1개를 반드시 모두 추천');
    expect(prompt).toContain('3개로 줄이지 마세요');
    expect(prompt).toContain('확정 후보');
    expect(prompt).not.toContain('검색 후보');
    expect(prompt).not.toContain('<filmott_recommendations>');
    expect(prompt).not.toContain('[{"tmdbId":2002,"contentType":"movie"}]');
    expect(prompt).toContain('JSON, ID 배열, 내부 데이터');
    expect(prompt).toContain('괄호 단서로 붙이지 마세요');
    expect(prompt).toContain('(넷플릭스 가능)');
  });

  it('확정 추천 후보가 없으면 후보 밖 작품을 만들지 않도록 안내해야 한다', () => {
    const candidates = makeCandidates([
      { title: '검색 후보', tmdbId: 2001, posterUrl: '/search.jpg' },
    ]);
    const prompt = buildSystemPrompt(
      emptyContext,
      [],
      [],
      candidates,
      emptyIntent,
      [],
      [],
    );

    expect(prompt).toContain('(확정 추천 후보가 없습니다)');
    expect(prompt).toContain('작품명을 새로 만들지 말고');
    expect(prompt).toContain('작품 추천을 만들지 말고');
    expect(prompt).not.toContain('<filmott_recommendations>');
    expect(prompt).not.toContain('[]');
    expect(prompt).not.toContain('검색 후보');
  });

  it('확정 후보가 없을 때는 추천 기본 개수를 3~5개로 안내해야 한다', () => {
    const prompt = buildSystemPrompt(emptyContext, [], [], [], emptyIntent);

    expect(prompt).toContain('추천 요청 시 즉시 3~5개를 추천하세요');
  });
});
