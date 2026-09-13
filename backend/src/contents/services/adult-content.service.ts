import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Content } from '../content.entity';
import { TmdbService, TmdbPersonCredit } from '../../tmdb/tmdb.service';
import { RevalidateService } from '../../common/revalidate.service';
import { ContentCatalogService } from './content-catalog.service';
const BLOCKED_IDS_TTL_MS = 5 * 60 * 1000;
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
interface BlockedContentRow {
  tmdbId: number | string;
  contentType: string;
}
@Injectable()
export class AdultContentService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
    private readonly catalogService: ContentCatalogService,
    private readonly revalidateService: RevalidateService,
  ) {}

  private blockedIdsCache: CacheEntry<Set<string>> | null = null;

  /**
   * 차단된 콘텐츠 목록 조회 (관리자용)
   */
  async getAdultContents(
    page = 1,
    limit = 20,
  ): Promise<{
    data: Pick<
      Content,
      'id' | 'tmdbId' | 'contentType' | 'title' | 'posterUrl'
    >[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const [data, total] = await this.contentRepo.findAndCount({
      where: { adult: true },
      select: ['id', 'tmdbId', 'contentType', 'title', 'posterUrl'],
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * 관리자 수동 성인물 차단/해제
   */
  async toggleAdult(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    adult: boolean,
  ): Promise<Content> {
    let content = await this.contentRepo.findOne({
      where: { tmdbId, contentType },
    });

    if (!content) {
      content = await this.catalogService.findOrFetchByTmdbId(
        tmdbId,
        contentType,
      );
    }

    content.adult = adult;
    const saved = await this.contentRepo.save(content);
    this.invalidateBlockedIdsCache();
    await this.revalidateService.revalidatePaths([
      '/',
      `/contents/${contentType}/${tmdbId}`,
    ]);
    return saved;
  }

  /**
   * 인물의 전체 작품 일괄 차단 (관리자용)
   */
  async blockPersonContents(personId: number): Promise<{
    blocked: number;
    failed: number;
    total: number;
    blockedContents: { tmdbId: number; contentType: string }[];
  }> {
    const credits = await this.tmdbService.getPersonCredits(personId);
    const allCredits = [...credits.cast, ...credits.crew].filter(
      (item) => item.media_type === 'movie' || item.media_type === 'tv',
    );

    // 중복 제거 (같은 작품에 cast+crew 양쪽 존재 가능)
    const unique = new Map<string, TmdbPersonCredit>();
    for (const item of allCredits) {
      unique.set(`${item.media_type}:${item.id}`, item);
    }

    // 일괄 조회: DB에 이미 존재하는 콘텐츠
    const uniqueEntries = [...unique.values()];
    const existingContents =
      uniqueEntries.length > 0
        ? await this.contentRepo
            .createQueryBuilder('c')
            .where(
              uniqueEntries
                .map(
                  (_, i) =>
                    `(c.tmdb_id = :tmdbId${i} AND c.content_type = :type${i})`,
                )
                .join(' OR '),
              Object.fromEntries(
                uniqueEntries.flatMap((item, i) => [
                  [`tmdbId${i}`, item.id],
                  [`type${i}`, item.media_type],
                ]),
              ) as Record<string, number | string>,
            )
            .getMany()
        : [];

    const existingMap = new Map<string, Content>();
    for (const c of existingContents) {
      existingMap.set(`${c.contentType}:${c.tmdbId}`, c);
    }

    // 이미 adult=true인 항목 제외, 차단 대상 분류
    const toBlockIds: number[] = [];
    const toFetch: TmdbPersonCredit[] = [];

    for (const item of unique.values()) {
      const key = `${item.media_type}:${item.id}`;
      const existing = existingMap.get(key);
      if (existing) {
        if (!existing.adult) {
          toBlockIds.push(existing.id);
        }
      } else {
        toFetch.push(item);
      }
    }

    // DB에 없는 항목은 개별 fetch (TMDB API 호출 불가피)
    let failed = 0;
    for (const item of toFetch) {
      const type = item.media_type as 'movie' | 'tv';
      try {
        const content = await this.catalogService.findOrFetchByTmdbId(
          item.id,
          type,
        );
        if (!content.adult) {
          toBlockIds.push(content.id);
        }
      } catch {
        failed++;
      }
    }

    // 일괄 update (updatedAt 수동 갱신 — update()는 @UpdateDateColumn 미동작)
    if (toBlockIds.length > 0) {
      await this.contentRepo.update(
        { id: In(toBlockIds) },
        { adult: true, updatedAt: new Date() },
      );
      this.invalidateBlockedIdsCache();
    }

    // 차단된 콘텐츠 정보 반환 (프론트에서 캐시 무효화용)
    const blockedContents =
      toBlockIds.length > 0
        ? await this.contentRepo.find({
            where: { id: In(toBlockIds) },
            select: ['tmdbId', 'contentType'],
          })
        : [];

    if (blockedContents.length > 0) {
      await this.revalidateService.revalidatePaths([
        '/',
        ...blockedContents.map(
          (content) => `/contents/${content.contentType}/${content.tmdbId}`,
        ),
      ]);
    }

    return {
      blocked: toBlockIds.length,
      failed,
      total: unique.size,
      blockedContents: blockedContents.map((c) => ({
        tmdbId: c.tmdbId,
        contentType: c.contentType,
      })),
    };
  }

  async getBlockedTmdbIds(): Promise<Set<string>> {
    if (this.blockedIdsCache && Date.now() < this.blockedIdsCache.expiresAt) {
      return this.blockedIdsCache.data;
    }
    const blocked = await this.contentRepo
      .createQueryBuilder('content')
      .select('content.tmdbId', 'tmdbId')
      .addSelect('content.contentType', 'contentType')
      .where('content.adult = true')
      .getRawMany<BlockedContentRow>();
    const data = new Set(blocked.map((c) => `${c.contentType}:${c.tmdbId}`));
    this.blockedIdsCache = { data, expiresAt: Date.now() + BLOCKED_IDS_TTL_MS };
    return data;
  }

  private invalidateBlockedIdsCache(): void {
    this.blockedIdsCache = null;
  }
}
