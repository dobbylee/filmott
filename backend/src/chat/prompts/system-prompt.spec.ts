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

  it('서버가 확정한 후보 순서를 유지해야 한다', () => {
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
    expect(idx2).toBeLessThan(idx1);
    expect(idx1).toBeLessThan(idx3);
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
      [candidates[1]],
      emptyIntent,
      [],
    );

    expect(prompt).toContain('## 확정 추천 작품');
    expect(prompt).toContain('서버가 검증할 수 있는 최종 후보');
    expect(prompt).toContain('사용자 요청과 실제로 맞는 작품만');
    expect(prompt).toContain(
      '확정 후보 1개 중 사용자 조건에 맞는 작품만 최대 5개 선택',
    );
    expect(prompt).not.toContain('반드시 모두 추천');
    expect(prompt).toContain('확정 후보');
    expect(prompt).not.toContain('검색 후보');
    expect(prompt).toContain('<filmott_recommendations>');
    expect(prompt).toContain('[{"tmdbId":2002,"contentType":"movie"}]');
    expect(prompt).toContain('실제로 본문에 추천한 작품만 같은 순서');
    expect(prompt).toContain('trailer 밖에는 JSON, ID 배열, 내부 데이터');
    expect(prompt).toContain('괄호 단서로 붙이지 마세요');
    expect(prompt).toContain('(넷플릭스 가능)');
  });

  it('확정 추천 후보가 없으면 후보 밖 작품을 만들지 않도록 안내해야 한다', () => {
    const prompt = buildSystemPrompt(emptyContext, [], [], [], emptyIntent, []);

    expect(prompt).toContain('(확정 추천 후보가 없습니다)');
    expect(prompt).toContain('작품명을 새로 만들지 말고');
    expect(prompt).toContain('작품 추천을 만들지 말고');
    expect(prompt).toContain('<filmott_recommendations>');
    expect(prompt).toContain('[]');
  });

  it('확정 후보가 없을 때는 작품을 만들지 않도록 안내해야 한다', () => {
    const prompt = buildSystemPrompt(emptyContext, [], [], [], emptyIntent);

    expect(prompt).toContain('확정 추천 작품이 없으면 작품 추천을 만들지 말고');
  });
});
