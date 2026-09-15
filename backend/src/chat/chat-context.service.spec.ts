import type { Repository } from 'typeorm';
import type { User } from '../users/user.entity';
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
    const service = new ChatContextService(watchlistRepo, reviewRepo, {
      findOne: jest.fn().mockResolvedValue({ subscribedOtts: ['netflix'] }),
    } as unknown as Repository<User>);

    const result = await service.buildChatContext(1);
    expect(result.subscribedOtts).toEqual(['netflix']);
    expect(result.userContext).toEqual({
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
    const service = new ChatContextService(watchlistRepo, reviewRepo, {
      findOne: jest.fn().mockResolvedValue({ subscribedOtts: ['netflix'] }),
    } as unknown as Repository<User>);

    const result = await service.buildChatContext(1);
    expect(result.subscribedOtts).toEqual(['netflix']);
    expect(result.userContext).toEqual({
      favorites: [],
      disliked: [],
      genreStats: [],
      watchedTmdbIds: [],
      wantToWatch: [],
      watchedGenres: [],
    });
  });
});

function contextHarness() {
  const queries = Array.from({ length: 6 }, () => createQueryBuilder([]));
  const reviewRepo = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(queries[0])
      .mockReturnValueOnce(queries[1])
      .mockReturnValueOnce(queries[2]),
  };
  const watchlistRepo = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(queries[3])
      .mockReturnValueOnce(queries[4])
      .mockReturnValueOnce(queries[5]),
  };
  const userRepo = { findOne: jest.fn().mockResolvedValue(null) };
  return {
    queries,
    reviewRepo,
    watchlistRepo,
    userRepo,
    service: new ChatContextService(
      watchlistRepo as unknown as Repository<Watchlist>,
      reviewRepo as unknown as Repository<Review>,
      userRepo as unknown as Repository<User>,
    ),
  };
}

const emptyContext = {
  favorites: [],
  disliked: [],
  genreStats: [],
  watchedTmdbIds: [],
  wantToWatch: [],
  watchedGenres: [],
};

describe('개인화 컨텍스트 수집 경계', () => {
  it('익명은 모든 저장소 조회 없이 빈 컨텍스트와 OTT를 반환해야 한다', async () => {
    const h = contextHarness();
    await expect(h.service.buildChatContext(null)).resolves.toEqual({
      userContext: emptyContext,
      subscribedOtts: [],
    });
    expect(h.reviewRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(h.watchlistRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(h.userRepo.findOne).not.toHaveBeenCalled();
  });

  it.each([null, { subscribedOtts: null }, { subscribedOtts: [] }])(
    '사용자가 없거나 OTT가 비어 있으면 기존 빈 배열을 반환해야 한다: %j',
    async (user) => {
      const h = contextHarness();
      h.userRepo.findOne.mockResolvedValue(user);
      await expect(h.service.buildChatContext(0)).resolves.toEqual({
        userContext: emptyContext,
        subscribedOtts: [],
      });
      expect(h.userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(h.userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 0 },
        select: ['id', 'subscribedOtts'],
      });
      for (const query of h.queries)
        expect(query.getRawMany).toHaveBeenCalledTimes(1);
    },
  );

  it('어느 조회도 완료되기 전에 여섯 컨텍스트와 User 조회를 모두 시작해야 한다', async () => {
    const h = contextHarness();
    const pending = Array.from({ length: 7 }, () => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise<unknown>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    });
    h.queries.forEach((query, index) =>
      query.getRawMany.mockReturnValue(pending[index].promise),
    );
    h.userRepo.findOne.mockReturnValue(pending[6].promise);
    const result = h.service.buildChatContext(42);
    for (const query of h.queries)
      expect(query.getRawMany).toHaveBeenCalledTimes(1);
    expect(h.userRepo.findOne).toHaveBeenCalledTimes(1);
    pending.forEach((item, index) =>
      item.resolve(index === 6 ? { subscribedOtts: ['netflix'] } : []),
    );
    await expect(result).resolves.toEqual({
      userContext: emptyContext,
      subscribedOtts: ['netflix'],
    });
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    '조회 %i의 실패를 빈 결과로 바꾸지 않아야 한다',
    async (index) => {
      const h = contextHarness();
      const error = new Error('컨텍스트 조회 실패');
      const query =
        index === 6 ? h.userRepo.findOne : h.queries[index].getRawMany;
      query.mockRejectedValue(error);
      await expect(h.service.buildChatContext(1)).rejects.toBe(error);
      for (const item of h.queries)
        expect(item.getRawMany).toHaveBeenCalledTimes(1);
      expect(h.userRepo.findOne).toHaveBeenCalledTimes(1);
    },
  );
});
