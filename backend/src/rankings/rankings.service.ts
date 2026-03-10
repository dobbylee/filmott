import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Ranking } from './ranking.entity';
import { KobisService } from '../kobis/kobis.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { ContentsService } from '../contents/contents.service';

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
    private readonly kobisService: KobisService,
    private readonly tmdbService: TmdbService,
    private readonly contentsService: ContentsService,
  ) {}

  /**
   * KOBIS 일별 박스오피스를 가져와 rankings에 저장
   * 매일 오전 10시 실행 (전일자 데이터)
   */
  @Cron('0 10 * * *', { name: 'daily-box-office', timeZone: 'Asia/Seoul' })
  async fetchDailyBoxOffice(): Promise<Ranking[]> {
    const yesterday = this.getYesterdayDate();
    this.logger.log(`Fetching daily box office for ${yesterday}`);

    try {
      const boxOfficeItems = await this.kobisService.getDailyBoxOffice(yesterday);
      const rankings: Ranking[] = [];
      const fetchedAt = new Date();

      for (const item of boxOfficeItems) {
        const ranking = this.rankingRepo.create({
          source: 'kobis',
          category: 'daily-box-office',
          rank: parseInt(item.rank, 10),
          title: item.movieNm,
          fetchedAt,
        });

        // KOBIS -> TMDB 매칭 시도
        const content = await this.matchKobisToTmdb(item.movieNm, item.openDt);
        if (content) {
          ranking.contentId = content.id;
          ranking.posterUrl = content.posterUrl;
        }

        rankings.push(await this.rankingRepo.save(ranking));
      }

      this.logger.log(`Saved ${rankings.length} daily box office rankings`);
      return rankings;
    } catch (error) {
      this.logger.error('Failed to fetch daily box office', error);
      throw error;
    }
  }

  /**
   * TMDB 트렌딩을 가져와 rankings에 저장
   * 매일 오전 6시 실행
   */
  @Cron('0 6 * * *', { name: 'daily-trending', timeZone: 'Asia/Seoul' })
  async fetchTrending(
    type: 'movie' | 'tv' | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'day',
  ): Promise<Ranking[]> {
    const category = `trending-${type}-${timeWindow}`;
    this.logger.log(`Fetching trending: ${category}`);

    try {
      const trendingData = await this.tmdbService.getTrending(type, timeWindow);
      const rankings: Ranking[] = [];
      const fetchedAt = new Date();

      for (let i = 0; i < trendingData.results.length; i++) {
        const item = trendingData.results[i];
        const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
        const title = mediaType === 'movie' ? item.title : item.name;
        const posterUrl = item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : undefined;

        // contents 테이블에 캐싱
        let contentId: number | undefined;
        try {
          const content = await this.contentsService.findOrFetchByTmdbId(
            item.id,
            mediaType as 'movie' | 'tv',
          );
          contentId = content.id;
        } catch (error) {
          this.logger.warn(
            `Failed to cache trending content: ${title} (tmdb:${item.id})`,
          );
        }

        const ranking = this.rankingRepo.create({
          source: 'tmdb',
          category,
          rank: i + 1,
          title: title ?? undefined,
          posterUrl,
          contentId,
          fetchedAt,
        });

        rankings.push(await this.rankingRepo.save(ranking));
      }

      this.logger.log(`Saved ${rankings.length} trending rankings for ${category}`);
      return rankings;
    } catch (error) {
      this.logger.error(`Failed to fetch trending: ${category}`, error);
      throw error;
    }
  }

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
   * KOBIS 영화명 + 개봉연도를 기반으로 TMDB에서 매칭
   */
  private async matchKobisToTmdb(
    movieNm: string,
    openDt: string,
  ): Promise<{ id: number; posterUrl?: string } | null> {
    try {
      const searchResult = await this.tmdbService.searchByType(
        movieNm,
        'movie',
        1,
      );

      if (!searchResult.results.length) {
        this.logger.warn(`No TMDB match found for: ${movieNm}`);
        return null;
      }

      // 개봉연도 추출 (KOBIS openDt: "2024-01-15" or "20240115")
      const openYear = this.extractYear(openDt);

      // 제목 + 연도 매칭
      const matched = searchResult.results.find((item) => {
        const releaseYear = item.release_date
          ? new Date(item.release_date).getFullYear()
          : null;

        // 제목 완전 일치 또는 연도 일치
        const titleMatch =
          item.title === movieNm || item.original_title === movieNm;
        const yearMatch = openYear && releaseYear
          ? Math.abs(releaseYear - openYear) <= 1
          : true;

        return titleMatch && yearMatch;
      });

      // 완전 매칭 없으면 첫 번째 결과 사용 (제목 유사도 높은 순)
      const bestMatch = matched ?? searchResult.results[0];

      // contents 테이블에 캐싱
      const content = await this.contentsService.findOrFetchByTmdbId(
        bestMatch.id,
        'movie',
      );

      return { id: content.id, posterUrl: content.posterUrl };
    } catch (error) {
      this.logger.warn(`TMDB matching failed for: ${movieNm}`, error);
      return null;
    }
  }

  private extractYear(dateStr: string): number | null {
    if (!dateStr) return null;
    // "2024-01-15" or "20240115"
    const cleaned = dateStr.replace(/-/g, '');
    if (cleaned.length >= 4) {
      return parseInt(cleaned.substring(0, 4), 10);
    }
    return null;
  }

  private getYesterdayDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}
