import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from './content.entity';
import {
  TmdbService,
  TmdbItem,
  TmdbPersonDetail,
  TmdbPersonCredit,
} from '../tmdb/tmdb.service';
import { TMDB_IMAGE_BASE } from '../common/constants';

const GENRE_NAME_MAP: Record<number, string> = {
  28: '액션',
  12: '모험',
  16: '애니메이션',
  35: '코미디',
  80: '범죄',
  99: '다큐멘터리',
  18: '드라마',
  10751: '가족',
  14: '판타지',
  36: '역사',
  27: '공포',
  10402: '음악',
  9648: '미스터리',
  10749: '로맨스',
  878: 'SF',
  10770: 'TV 영화',
  53: '스릴러',
  10752: '전쟁',
  37: '서부',
  10759: '액션 & 어드벤처',
  10762: '키즈',
  10763: '뉴스',
  10764: '리얼리티',
  10765: 'SF & 판타지',
  10766: '소프 오페라',
  10767: '토크',
  10768: '전쟁 & 정치',
};

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
  ) {}

  /**
   * DB에서 캐시 히트 시 반환, 미스 시 TMDB에서 fetch하여 저장 후 반환
   */
  async findOrFetchByTmdbId(
    tmdbId: number,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const existing = await this.contentRepo.findOne({
      where: { tmdbId, contentType: type },
    });

    if (existing) {
      return existing;
    }

    const tmdbData = await this.tmdbService.getDetails(tmdbId, type);
    return this.saveFromTmdb(tmdbData, type);
  }

  /**
   * 검색: TMDB API 호출 후 결과 반환 (캐싱은 하지 않음, 목록은 가볍게)
   */
  async searchContents(query: string, type?: 'movie' | 'tv' | 'person', page = 1) {
    if (type === 'movie' || type === 'tv' || type === 'person') {
      return this.tmdbService.searchByType(query, type, page);
    }
    // "전체" 검색: 인물(page 1 고정) + 영화/시리즈(페이징) 각각 호출
    const [personResult, movieResult, tvResult] = await Promise.all([
      this.tmdbService.searchByType(query, 'person', 1),
      this.tmdbService.searchByType(query, 'movie', page),
      this.tmdbService.searchByType(query, 'tv', page),
    ]);
    const contentTotal = movieResult.total_results + tvResult.total_results;
    return {
      page,
      total_pages: Math.max(movieResult.total_pages, tvResult.total_pages),
      total_results: personResult.total_results + contentTotal,
      personTotal: personResult.total_results,
      contentTotal,
      results: [...personResult.results, ...movieResult.results, ...tvResult.results],
    };
  }

  /**
   * 상세: TMDB에서 최신 데이터 fetch + DB 업데이트, OTT 정보 포함
   */
  async getContentDetail(tmdbId: number, type: 'movie' | 'tv') {
    const tmdbData = await this.tmdbService.getDetails(tmdbId, type);

    if (!tmdbData || !tmdbData.id) {
      throw new NotFoundException(
        `Content not found: ${type}/${tmdbId}`,
      );
    }

    // DB에 저장/업데이트
    const content = await this.upsertFromTmdb(tmdbData, type);

    // OTT 정보, 출연진 등 추가 정보 포함하여 반환
    const watchProviders =
      tmdbData['watch/providers']?.results?.KR ?? null;
    const credits = tmdbData.credits?.cast?.slice(0, 20) ?? [];

    return {
      ...content,
      watchProviders,
      credits,
    };
  }

  /**
   * 필터 기반 탐색
   */
  async discoverContents(
    type: 'movie' | 'tv' = 'movie',
    options: {
      genres?: string;
      providers?: string;
      year?: number;
      sort?: string;
      page?: number;
    } = {},
  ) {
    return this.tmdbService.discoverByFilters(type, {
      genres: options.genres,
      watchProviders: options.providers,
      year: options.year,
      sort: options.sort,
      page: options.page,
    });
  }

  /**
   * 인물 상세 정보
   */
  async getPersonDetail(personId: number): Promise<TmdbPersonDetail> {
    return this.tmdbService.getPersonDetail(personId);
  }

  /**
   * 인물 필모그래피 (movie/tv만, 최신순 정렬)
   */
  async getPersonCredits(personId: number): Promise<{
    cast: TmdbPersonCredit[];
    crew: TmdbPersonCredit[];
  }> {
    const credits = await this.tmdbService.getPersonCredits(personId);

    const filterAndSort = (items: TmdbPersonCredit[]) => {
      return items
        .filter(
          (item) =>
            item.media_type === 'movie' || item.media_type === 'tv',
        )
        .sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });
    };

    return {
      cast: filterAndSort(credits.cast),
      crew: filterAndSort(credits.crew),
    };
  }

  /**
   * TMDB 데이터를 Content 엔티티로 변환하여 저장
   */
  private async saveFromTmdb(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const content = this.contentRepo.create(
      this.mapTmdbToContent(tmdbData, type),
    );
    return this.contentRepo.save(content);
  }

  /**
   * TMDB 데이터를 Content 엔티티로 변환하여 upsert
   */
  private async upsertFromTmdb(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const mapped = this.mapTmdbToContent(tmdbData, type);

    const existing = await this.contentRepo.findOne({
      where: { tmdbId: tmdbData.id, contentType: type },
    });

    if (existing) {
      Object.assign(existing, mapped);
      return this.contentRepo.save(existing);
    }

    const content = this.contentRepo.create(mapped);
    return this.contentRepo.save(content);
  }

  private mapTmdbToContent(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Partial<Content> {
    const title = type === 'movie' ? tmdbData.title : tmdbData.name;
    const originalTitle =
      type === 'movie' ? tmdbData.original_title : tmdbData.original_name;
    const releaseDate =
      type === 'movie' ? tmdbData.release_date : tmdbData.first_air_date;

    // runtime: movie는 직접, tv는 episode_run_time 첫번째 값
    let runtime = tmdbData.runtime ?? null;
    if (type === 'tv' && !runtime && tmdbData.episode_run_time?.length) {
      runtime = tmdbData.episode_run_time[0];
    }

    return {
      tmdbId: tmdbData.id,
      contentType: type,
      title: title ?? '',
      originalTitle: originalTitle ?? undefined,
      posterUrl: tmdbData.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${tmdbData.poster_path}`
        : undefined,
      backdropUrl: tmdbData.backdrop_path
        ? `${TMDB_IMAGE_BASE}/original${tmdbData.backdrop_path}`
        : undefined,
      overview: tmdbData.overview ?? undefined,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      voteAverage: tmdbData.vote_average ?? undefined,
      genres: (tmdbData.genres ?? []).map((g) => ({
        id: g.id,
        name: GENRE_NAME_MAP[g.id] ?? g.name,
      })),
      runtime: runtime ?? undefined,
    };
  }
}
