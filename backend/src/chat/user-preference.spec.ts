import { extractUserPreference } from './user-preference';
import { UserContext, FavoriteContent, GenreStat } from './prompts/system-prompt';

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
  originCountry: string | null = null,
): FavoriteContent {
  return { title, year: '2024', genres, rating, originCountry };
}

function makeWantToWatch(
  title: string,
  genres: string,
  originCountry: string | null = null,
): { title: string; year: string; genres: string; originCountry: string | null } {
  return { title, year: '2024', genres, originCountry };
}

function makeEmptyContext(): UserContext {
  return {
    favorites: [],
    disliked: [],
    genreStats: [],
    watchedTmdbIds: [],
    wantToWatch: [],
    watchedGenres: [],
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

      const result = extractUserPreference(context, []);

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

      const result = extractUserPreference(context, []);

      expect(result.preferredGenres).toEqual(['액션']);
    });

    it('genreStats가 비어있으면 watchedGenres에서 빈도 기반으로 장르를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        watchedGenres: [
          makeGenreStat('드라마', 0, 5),
          makeGenreStat('액션', 0, 3),
          makeGenreStat('코미디', 0, 1),
        ],
      };

      const result = extractUserPreference(context, []);

      expect(result.preferredGenres[0]).toBe('드라마');
      expect(result.preferredGenres[1]).toBe('액션');
      expect(result.preferredGenres).toContain('코미디');
    });

    it('genreStats, watchedGenres 모두 비어있으면 favorites에서 장르를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마, 스릴러', 10),
          makeFavorite('올드보이', '스릴러, 액션', 9),
          makeFavorite('괴물', '드라마, 공포', 8),
        ],
      };

      const result = extractUserPreference(context, []);

      // 드라마: 2, 스릴러: 2, 액션: 1, 공포: 1
      expect(result.preferredGenres[0]).toBe('드라마');
      expect(result.preferredGenres[1]).toBe('스릴러');
      expect(result.preferredGenres).toContain('액션');
      expect(result.preferredGenres).toContain('공포');
    });

    it('genreStats, watchedGenres, favorites 모두 비어있으면 wantToWatch에서 장르를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        wantToWatch: [
          makeWantToWatch('기생충', '드라마, 스릴러', 'KR'),
          makeWantToWatch('인셉션', 'SF, 액션', 'US'),
          makeWantToWatch('올드보이', '드라마, 스릴러', 'KR'),
        ],
      };

      const result = extractUserPreference(context, []);

      // 드라마: 2, 스릴러: 2, SF: 1, 액션: 1
      expect(result.preferredGenres[0]).toBe('드라마');
      expect(result.preferredGenres[1]).toBe('스릴러');
      expect(result.preferredGenres).toContain('SF');
      expect(result.preferredGenres).toContain('액션');
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

      const result = extractUserPreference(context, []);

      expect(result.preferredGenres).toEqual(['SF', '드라마']);
    });
  });

  describe('ottProviderNames', () => {
    it('subscribedOtts를 TMDB provider_name으로 변환해야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        ['netflix', 'tving', 'wavve'],
      );

      expect(result.ottProviderNames).toEqual(['Netflix', 'Tving', 'wavve']);
    });

    it('OTT_ID_TO_TMDB_NAME에 없는 ID는 결과에서 제외해야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        ['custom_ott', 'netflix'],
      );

      expect(result.ottProviderNames).toEqual(['Netflix']);
    });

    it('빈 subscribedOtts는 빈 배열을 반환해야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        [],
      );

      expect(result.ottProviderNames).toEqual([]);
    });
  });

  describe('hasData', () => {
    it('유저 데이터가 없으면 hasData=false여야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        [],
      );

      expect(result.hasData).toBe(false);
    });

    it('genreStats가 있으면 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        genreStats: [makeGenreStat('드라마', 8.0, 5)],
      };

      const result = extractUserPreference(context, []);

      expect(result.hasData).toBe(true);
    });

    it('favorites만 있어도 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [makeFavorite('기생충', '드라마', 10)],
      };

      const result = extractUserPreference(context, []);

      expect(result.hasData).toBe(true);
    });

    it('watchedGenres만 있어도 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        watchedGenres: [makeGenreStat('드라마', 0, 3)],
      };

      const result = extractUserPreference(context, []);

      expect(result.hasData).toBe(true);
    });

    it('wantToWatch만 있어도 hasData=true여야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        wantToWatch: [makeWantToWatch('기생충', '드라마', 'KR')],
      };

      const result = extractUserPreference(context, []);

      expect(result.hasData).toBe(true);
    });

    it('OTT 구독만 있어도 hasData=true여야 한다', () => {
      const result = extractUserPreference(
        makeEmptyContext(),
        ['netflix'],
      );

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
        ],
      };

      const result = extractUserPreference(context, []);

      expect(result.preferredCountries).toEqual(['KR', 'US']);
    });

    it('originCountry가 없으면 빈 배열이어야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10),
        ],
      };

      const result = extractUserPreference(context, []);

      expect(result.preferredCountries).toEqual([]);
    });

    it('originCountry가 null인 항목은 건너뛰어야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10, 'KR'),
          makeFavorite('올드보이', '스릴러', 9, null),
        ],
      };

      const result = extractUserPreference(context, []);

      expect(result.preferredCountries).toEqual(['KR']);
    });

    it('wantToWatch의 originCountry도 국가 추출에 반영되어야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('기생충', '드라마', 10, 'KR'),
        ],
        wantToWatch: [
          makeWantToWatch('인셉션', 'SF', 'US'),
          makeWantToWatch('어벤져스', '액션', 'US'),
          makeWantToWatch('괴물', '드라마', 'KR'),
        ],
      };

      const result = extractUserPreference(context, []);

      // KR: 2 (기생충 + 괴물), US: 2 (인셉션 + 어벤져스)
      expect(result.preferredCountries).toHaveLength(2);
      expect(result.preferredCountries).toContain('KR');
      expect(result.preferredCountries).toContain('US');
    });

    it('favorites 없이 wantToWatch만 있어도 국가를 추출해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        wantToWatch: [
          makeWantToWatch('인셉션', 'SF', 'US'),
          makeWantToWatch('기생충', '드라마', 'KR'),
          makeWantToWatch('어벤져스', '액션', 'US'),
        ],
      };

      const result = extractUserPreference(context, []);

      // US: 2, KR: 1
      expect(result.preferredCountries).toEqual(['US', 'KR']);
    });

    it('복합 originCountry "KR, US"를 개별 국가로 분리해야 한다', () => {
      const context: UserContext = {
        ...makeEmptyContext(),
        favorites: [
          makeFavorite('미나리', '드라마', 9, 'KR, US'),
          makeFavorite('기생충', '드라마', 10, 'KR'),
        ],
      };

      const result = extractUserPreference(context, []);

      // KR: 2 (미나리 + 기생충), US: 1 (미나리)
      expect(result.preferredCountries).toEqual(['KR', 'US']);
    });
  });
});
