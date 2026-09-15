import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Ranking } from '../ranking.entity';

@Injectable()
export class RankingsQueryService {
  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
  ) {}

  /**
   * 최신 랭킹 조회 (content 정보 join)
   */
  async getRankings(
    source: string,
    category: string,
    limit = 10,
  ): Promise<Ranking[]> {
    // 해당 source+category의 최신 fetchedAt 조회
    const latestRecord = await this.rankingRepo.findOne({
      where: { source, category },
      order: { fetchedAt: 'DESC' },
      select: ['fetchedAt'],
    });

    if (!latestRecord) {
      return [];
    }

    return this.rankingRepo.find({
      where: {
        source,
        category,
        fetchedAt: latestRecord.fetchedAt,
      },
      relations: ['content'],
      order: { rank: 'ASC' },
      take: limit,
    });
  }

  /**
   * TMDB 매칭 실패 항목 조회 (contentId IS NULL, 최신 targetDate 기준)
   */
  async getUnmatchedRankings(): Promise<Ranking[]> {
    const latestRecord = await this.rankingRepo.findOne({
      where: { contentId: IsNull() as unknown as undefined },
      order: { targetDate: 'DESC' },
      select: ['targetDate'],
    });

    if (!latestRecord) {
      return [];
    }

    return this.rankingRepo.find({
      where: {
        contentId: IsNull() as unknown as undefined,
        targetDate: latestRecord.targetDate,
      },
      order: { rank: 'ASC' },
    });
  }
}
