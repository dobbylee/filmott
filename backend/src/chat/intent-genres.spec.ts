import { CHAT_INTENT_RESPONSE_FORMAT } from './intent-schema';
import { getSearchableGenres, normalizeIntentGenres } from './intent-genres';

describe('의도 장르와 SQL 장르 계약', () => {
  it('구조화 출력은 정식 영화/TV 장르만 허용해야 한다', () => {
    const schema = CHAT_INTENT_RESPONSE_FORMAT.json_schema.schema as {
      properties: { genres: { items: { enum: string[] } } };
    };
    const genres = schema.properties.genres.items.enum;
    expect(genres).toEqual(
      expect.arrayContaining(['로맨스', '코미디', 'SF & 판타지', '토크']),
    );
    expect(genres).not.toEqual(expect.arrayContaining(['로코']));
    expect(genres).not.toEqual(expect.arrayContaining(['힐링']));
    expect(genres).not.toEqual(expect.arrayContaining(['뮤지컬']));
  });

  it('미지원 표현·빈값·중복은 제외하고 소수 기존 별칭만 호환해야 한다', () => {
    expect(
      normalizeIntentGenres(
        [' 코미디 ', '코미디', '호러', '힐링', '로코', '', 'toString'],
        'movie',
      ),
    ).toEqual(['코미디', '공포']);
  });

  it('영화의 로맨스/코미디와 TV에서 검색 가능한 코미디를 구분해야 한다', () => {
    const genres = ['로맨스', '코미디'];
    expect(getSearchableGenres(genres, 'movie')).toEqual(['로맨스', '코미디']);
    expect(getSearchableGenres(genres, 'tv')).toEqual(['코미디']);
    expect(genres).toEqual(['로맨스', '코미디']);
  });

  it('TV에서 장르로 표현할 수 없는 조건은 잘못된 SQL 필터로 만들지 않아야 한다', () => {
    expect(getSearchableGenres(['스릴러', '로맨스', '공포'], 'tv')).toEqual([]);
    expect(getSearchableGenres(['힐링', '로맨틱 코미디'], null)).toEqual([]);
  });

  it('영화/TV의 장르 분류 대응과 타입 미지정 검색을 보존해야 한다', () => {
    expect(
      getSearchableGenres(
        normalizeIntentGenres(['액션', 'SF'], 'movie'),
        'movie',
      ),
    ).toEqual(['액션', 'SF']);
    expect(
      getSearchableGenres(normalizeIntentGenres(['액션', 'SF'], 'tv'), 'tv'),
    ).toEqual(['액션 & 어드벤처', 'SF & 판타지']);
    expect(
      getSearchableGenres(normalizeIntentGenres(['액션', 'SF'], null), null),
    ).toEqual(['액션', 'SF', '액션 & 어드벤처', 'SF & 판타지']);
    expect(getSearchableGenres(['리얼리티', '토크'], 'movie')).toEqual([]);
  });
});
