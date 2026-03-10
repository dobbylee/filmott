import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from './content.entity';
import { TmdbService, TmdbItem } from '../tmdb/tmdb.service';

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

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
  async searchContents(query: string, type?: 'movie' | 'tv', page = 1) {
    if (type) {
      return this.tmdbService.searchByType(query, type, page);
    }
    return this.tmdbService.searchMulti(query, page);
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
      page?: number;
    } = {},
  ) {
    return this.tmdbService.discoverByFilters(type, {
      genres: options.genres,
      watchProviders: options.providers,
      year: options.year,
      page: options.page,
    });
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
        ? `${IMAGE_BASE}/w500${tmdbData.poster_path}`
        : undefined,
      backdropUrl: tmdbData.backdrop_path
        ? `${IMAGE_BASE}/original${tmdbData.backdrop_path}`
        : undefined,
      overview: tmdbData.overview ?? undefined,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      voteAverage: tmdbData.vote_average ?? undefined,
      genres: tmdbData.genres ?? [],
      runtime: runtime ?? undefined,
    };
  }
}
