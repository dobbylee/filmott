import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Ranking } from '../ranking.entity';
import { RevalidateService } from '../../common/revalidate.service';
import { RankingsManagementService } from './rankings-management.service';
describe('랭킹 포스터 관리', () => {
  let service: RankingsManagementService;
  const mockRankingRepo = { findOneBy: jest.fn(), save: jest.fn() };
  const mockRevalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
  };
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RankingsManagementService,
        { provide: getRepositoryToken(Ranking), useValue: mockRankingRepo },
        { provide: RevalidateService, useValue: mockRevalidateService },
      ],
    }).compile();
    service = module.get(RankingsManagementService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('updatePosterUrl', () => {
    it('존재하는 랭킹의 posterUrl을 업데이트해야 한다', async () => {
      const ranking = { id: 1, title: 'Test Movie', posterUrl: undefined };
      mockRankingRepo.findOneBy.mockResolvedValue(ranking);
      mockRankingRepo.save.mockResolvedValue({
        ...ranking,
        posterUrl: 'https://example.com/poster.jpg',
      });

      const result = await service.updatePosterUrl(
        1,
        'https://example.com/poster.jpg',
      );

      expect(mockRankingRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(mockRankingRepo.save).toHaveBeenCalledWith({
        ...ranking,
        posterUrl: 'https://example.com/poster.jpg',
      });
      expect(result.posterUrl).toBe('https://example.com/poster.jpg');
    });

    it('존재하지 않는 랭킹에 대해 NotFoundException을 던져야 한다', async () => {
      mockRankingRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updatePosterUrl(999, 'https://example.com/poster.jpg'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
