import type { Repository } from 'typeorm';
import type { Review } from '../reviews/review.entity';
import type { Watchlist } from '../watchlist/watchlist.entity';
import { ChatContextService } from './chat-context.service';

function createQueryBuilder(rows: unknown[]) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
}

describe('ChatContextService', () => {
  it('리뷰와 워치리스트 raw 결과를 사용자 컨텍스트로 변환해야 한다', async () => {
    const reviewRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(
          createQueryBuilder([
            {
              title: '기생충',
              releaseDate: '2019-05-30',
              genres: '드라마, 스릴러',
              rating: 10,
              originCountry: 'KR',
            },
          ]),
        )
        .mockReturnValueOnce(
          createQueryBuilder([
            {
              title: '비선호작',
              releaseDate: '2020-01-01',
              genres: '액션',
              rating: 2,
              originCountry: 'US',
              director: '감독A',
            },
          ]),
        )
        .mockReturnValueOnce(
          createQueryBuilder([
            { genre: '드라마', avgRating: '8.5', count: '5' },
          ]),
        ),
    } as unknown as Repository<Review>;
    const watchlistRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(createQueryBuilder([{ tmdbId: 496243 }]))
        .mockReturnValueOnce(
          createQueryBuilder([
            {
              title: '인셉션',
              releaseDate: '2010-07-16',
              genres: 'SF, 액션',
              originCountry: 'US',
            },
          ]),
        )
        .mockReturnValueOnce(
          createQueryBuilder([{ genre: '코미디', avgRating: '0', count: '3' }]),
        ),
    } as unknown as Repository<Watchlist>;
    const service = new ChatContextService(watchlistRepo, reviewRepo);

    await expect(service.buildUserContext(1)).resolves.toEqual({
      favorites: [
        {
          title: '기생충',
          year: '2019',
          genres: '드라마, 스릴러',
          rating: 10,
          originCountry: 'KR',
        },
      ],
      disliked: [
        {
          title: '비선호작',
          year: '2020',
          genres: '액션',
          rating: 2,
          originCountry: 'US',
          director: '감독A',
        },
      ],
      genreStats: [{ genre: '드라마', avgRating: '8.5', count: 5 }],
      watchedTmdbIds: [496243],
      wantToWatch: [
        {
          title: '인셉션',
          year: '2010',
          genres: 'SF, 액션',
          originCountry: 'US',
        },
      ],
      watchedGenres: [{ genre: '코미디', avgRating: '0', count: 3 }],
    });
  });

  it('raw 결과가 없으면 모든 컨텍스트 목록을 비워야 한다', async () => {
    const reviewRepo = {
      createQueryBuilder: jest.fn(() => createQueryBuilder([])),
    } as unknown as Repository<Review>;
    const watchlistRepo = {
      createQueryBuilder: jest.fn(() => createQueryBuilder([])),
    } as unknown as Repository<Watchlist>;
    const service = new ChatContextService(watchlistRepo, reviewRepo);

    await expect(service.buildUserContext(1)).resolves.toEqual({
      favorites: [],
      disliked: [],
      genreStats: [],
      watchedTmdbIds: [],
      wantToWatch: [],
      watchedGenres: [],
    });
  });
});
