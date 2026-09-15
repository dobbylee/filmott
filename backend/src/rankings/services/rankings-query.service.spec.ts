import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Ranking } from '../ranking.entity';
import { RankingsQueryService } from './rankings-query.service';
describe('랭킹 조회', () => {
  let service: RankingsQueryService;
  const mockRankingRepo = { find: jest.fn(), findOne: jest.fn() };
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RankingsQueryService,
        { provide: getRepositoryToken(Ranking), useValue: mockRankingRepo },
      ],
    }).compile();
    service = module.get(RankingsQueryService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('getRankings', () => {
    it('content가 조인된 최신 랭킹을 반환해야 한다', async () => {
      const fetchedAt = new Date('2026-03-09T10:00:00Z');
      mockRankingRepo.findOne.mockResolvedValue({ fetchedAt });

      const rankings = [
        {
          id: 1,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 1,
          title: 'Movie 1',
          targetDate: '2026-03-08',
          content: { id: 1, title: 'Movie 1' },
          fetchedAt,
        },
        {
          id: 2,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 2,
          title: 'Movie 2',
          targetDate: '2026-03-08',
          content: null,
          fetchedAt,
        },
      ];
      mockRankingRepo.find.mockResolvedValue(rankings);

      const result = await service.getRankings('kobis', 'daily-box-office', 10);

      expect(result).toHaveLength(2);
      expect(mockRankingRepo.findOne).toHaveBeenCalledWith({
        where: { source: 'kobis', category: 'daily-box-office' },
        order: { fetchedAt: 'DESC' },
        select: ['fetchedAt'],
      });
      expect(mockRankingRepo.find).toHaveBeenCalledWith({
        where: {
          source: 'kobis',
          category: 'daily-box-office',
          fetchedAt,
        },
        relations: ['content'],
        order: { rank: 'ASC' },
        take: 10,
      });
    });

    it('랭킹이 없을 때 빈 배열을 반환해야 한다', async () => {
      mockRankingRepo.findOne.mockResolvedValue(null);

      const result = await service.getRankings('kobis', 'daily-box-office');

      expect(result).toEqual([]);
    });
  });

  describe('getUnmatchedRankings', () => {
    it('contentId가 NULL인 최신 targetDate의 랭킹을 반환해야 한다', async () => {
      const latestRecord = { targetDate: '2026-03-16' };
      mockRankingRepo.findOne.mockResolvedValue(latestRecord);

      const unmatchedRankings = [
        {
          id: 1,
          rank: 3,
          title: 'Unmatched Movie',
          targetDate: '2026-03-16',
          contentId: null,
        },
      ];
      mockRankingRepo.find.mockResolvedValue(unmatchedRankings);

      const result = await service.getUnmatchedRankings();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Unmatched Movie');
      expect(mockRankingRepo.findOne).toHaveBeenCalled();
      expect(mockRankingRepo.find).toHaveBeenCalled();
    });

    it('매칭 실패 항목이 없을 때 빈 배열을 반환해야 한다', async () => {
      mockRankingRepo.findOne.mockResolvedValue(null);

      const result = await service.getUnmatchedRankings();

      expect(result).toEqual([]);
    });
  });
});
