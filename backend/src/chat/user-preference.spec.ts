import { extractUserPreference, UserPreference } from './user-preference';
import { UserContext, FavoriteContent, GenreStat } from './prompts/system-prompt';
import { OttProvider } from '../common/ott-providers';
import { OTT_PROVIDERS } from '../common/ott-providers';

function makeGenreStat(
  genre: string,
  avgRating: number,
  count: number,
): GenreStat {
  return { genre, avgRating: avgRating.toFixed(1), count };
}

function makeFavorite(
  title: string,
  genres: string,
  rating: number,
  originCountry?: string | null,
): FavoriteContent & { originCountry?: string | null } {
  return { title, year: '2024', genres, rating, ...(originCountry !== undefined ? { originCountry } : {}) };
}

function makeEmptyContext(): UserContext {
  return {
    favorites: [],
    disliked: [],
    genreStats: [],
    watchedTmdbIds: [],
    wantToWatch: [],
  };
}

describe('extractUserPreference', () => {
  describe('preferredGenres', () => {
    it('genreStats에서 가중 점수 기준 상위 5개 장르를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        genreStats: [
          makeGenreStat('드라마', 8.5, 10),     // 8.5 * log2(11) = 29.4
          makeGenreStat('액션', 7.0, 8),         // 7.0 * log2(9) = 22.1
          makeGenreStat('코미디', 6.5, 6),       // 6.5 * log2(7) = 18.2
          makeGenreStat('스릴러', 9.0, 3),       // 9.0 * log2(4) = 18.0
          makeGenreStat('로맨스', 7.5, 4),       // 7.5 * log2(5) = 17.4
          makeGenreStat('공포', 5.0, 5),         // 5.0 * log2(6) = 12.9
          makeGenreStat('다큐멘터리', 8.0, 2),   // 8.0 * log2(3) = 12.7
        ],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredGenres).toHaveLength(5);
      expect(result.preferredGenres[0]).toBe('드라마');
      expect(result.preferredGenres[1]).toBe('액션');
      expect(result.preferredGenres).toContain('코미디');
      expect(result.preferredGenres).toContain('스릴러');
      expect(result.preferredGenres).toContain('로맨스');
      expect(result.preferredGenres).not.toContain('공포');
      expect(result.preferredGenres).not.toContain('다큐멘터리');
    });

    it('count 1인 장르는 제외해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        genreStats: [
          makeGenreStat('드라마', 9.0, 1),   // count < 2 → 제외
          makeGenreStat('액션', 7.0, 3),     // 포함
          makeGenreStat('코미디', 6.0, 1),   // count < 2 → 제외
        ],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredGenres).toEqual(['액션']);
    });

    it('genreStats가 비어있으면 favorites에서 장르를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마, 스릴러', 10),
          makeFavorite('올드보이', '스릴러, 액션', 9),
          makeFavorite('괴물', '드라마, 공포', 8),
        ],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      // 드라마: 2, 스릴러: 2, 액션: 1, 공포: 1
      expect(result.preferredGenres[0]).toBe('드라마');
      expect(result.preferredGenres[1]).toBe('스릴러');
      expect(result.preferredGenres).toContain('액션');
      expect(result.preferredGenres).toContain('공포');
    });

    it('genreStats에서 eligible 장르가 없으면 favorites fallback을 사용해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        genreStats: [
          makeGenreStat('드라마', 9.0, 1),  // count < 2 → 제외
        ],
        favorites: [
          makeFavorite('인터스텔라', 'SF, 드라마', 10),
        ],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredGenres).toEqual(['SF', '드라마']);
    });
  });

  describe('ottProviderNames', () => {
    it('subscribedOtts를 TMDB provider_name으로 변환해야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        ['netflix', 'tving', 'wavve'],
        OTT_PROVIDERS,
      );

      expect(result.ottProviderNames).toEqual(['Netflix', 'Tving', 'wavve']);
    });

    it('알 수 없는 OTT ID는 OTT_PROVIDERS에서 name fallback을 사용해야 한다', () => {
      const customProviders: OttProvider[] = [
        { id: 'custom_ott', name: '커스텀OTT', tmdbProviderId: 9999, logoPath: '/test.jpg' },
      ];

      const result = extractUserPreference(
        makeEmptyContext(),
        ['custom_ott'],
        customProviders,
      );

      expect(result.ottProviderNames).toEqual(['커스텀OTT']);
    });

    it('빈 subscribedOtts는 빈 배열을 반환해야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        [],
        OTT_PROVIDERS,
      );

      expect(result.ottProviderNames).toEqual([]);
    });
  });

  describe('hasData', () => {
    it('유저 데이터가 없으면 hasData=false여야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        [],
        OTT_PROVIDERS,
      );

      expect(result.hasData).toBe(false);
    });

    it('genreStats가 있으면 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        genreStats: [makeGenreStat('드라마', 8.0, 5)],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.hasData).toBe(true);
    });

    it('favorites만 있어도 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [makeFavorite('기생충', '드라마', 10)],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.hasData).toBe(true);
    });
  });

  describe('preferredCountries', () => {
    it('preferredCountries를 빈도순으로 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10, 'KR'),
          makeFavorite('올드보이', '스릴러', 9, 'KR'),
          makeFavorite('인셉션', 'SF', 9, 'US'),
          makeFavorite('아멜리에', '로맨스', 8, 'FR'),
          makeFavorite('미나리', '드라마', 8, 'US'),
        ] as (FavoriteContent & { originCountry?: string | null })[],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredCountries).toEqual(['KR', 'US']);
    });

    it('originCountry가 없으면 빈 배열이어야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10),
        ],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredCountries).toEqual([]);
    });

    it('originCountry가 null인 항목은 건너뛰어야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10, 'KR'),
          makeFavorite('올드보이', '스릴러', 9, null),
        ] as (FavoriteContent & { originCountry?: string | null })[],
      };

      const result = extractUserPreference(context, [], OTT_PROVIDERS);

      expect(result.preferredCountries).toEqual(['KR']);
    });
  });
});
