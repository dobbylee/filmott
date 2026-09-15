import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ranking } from '../ranking.entity';
import { RANKINGS_REVALIDATE_TAGS } from '../rankings.constants';
import { RevalidateService } from '../../integrations/frontend-cache/revalidate.service';
@Injectable()
export class RankingsManagementService {
  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
    private readonly revalidateService: RevalidateService,
  ) {}

  /**
   * 포스터 URL 수동 업데이트 (TMDB 매칭 실패 항목용)
   */
  async updatePosterUrl(id: number, posterUrl: string): Promise<Ranking> {
    const ranking = await this.rankingRepo.findOneBy({ id });
    if (!ranking) {
      throw new NotFoundException(`Ranking #${id}을(를) 찾을 수 없습니다.`);
    }
    ranking.posterUrl = posterUrl;
    const saved = await this.rankingRepo.save(ranking);
    await this.revalidateService.revalidatePath('/', RANKINGS_REVALIDATE_TAGS);
    return saved;
  }
}
