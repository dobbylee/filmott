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

  const makeCandidates = (overrides: Partial<SimilarContent>[]): SimilarContent[] =>
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
    const prompt = buildSystemPrompt(emptyContext, [], [], candidates, emptyIntent);

    expect(prompt).toContain('유사도: 95%');
  });

  it('유사도 0인 후보는 유사도 텍스트를 포함하지 않아야 한다', () => {
    const candidates = makeCandidates([{ similarity: 0, title: 'KOBIS작품' }]);
    const prompt = buildSystemPrompt(emptyContext, [], [], candidates, emptyIntent);

    expect(prompt).not.toContain('유사도:');
  });

  it('후보가 유사도 내림차순으로 정렬되어야 한다', () => {
    const candidates = makeCandidates([
      { similarity: 0.5, title: '중간작품', tmdbId: 2001 },
      { similarity: 0.9, title: '높은작품', tmdbId: 2002 },
      { similarity: 0.3, title: '낮은작품', tmdbId: 2003 },
    ]);
    const prompt = buildSystemPrompt(emptyContext, [], [], candidates, emptyIntent);

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
});
