import { describe, expect, it } from 'vitest';
import { createTmdbAggregateRating } from '@/app/contents/[type]/[tmdbId]/page';

describe('createTmdbAggregateRating', () => {
  it('TMDB 평점과 투표 수가 양수이면 구조화 데이터 계약을 반환한다', () => {
    expect(createTmdbAggregateRating(8.4, 12345)).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 8.4,
      ratingCount: 12345,
      bestRating: 10,
    });
  });

  it.each([
    [undefined, 10],
    [0, 10],
    [8.4, undefined],
    [8.4, 0],
    [Number.NaN, 10],
    [8.4, Number.NaN],
  ])('평점이나 투표 수가 유효하지 않으면 생략한다', (rating, count) => {
    expect(createTmdbAggregateRating(rating, count)).toBeUndefined();
  });
});
