import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Content } from '../content.entity';
import { buildSearchIndexableContentSql } from '../search-indexable-content';

const SITEMAP_CONTENT_LIMIT = 10_000;
const GOOGLE_PROVIDER_HIGH_MIN_VOTE_COUNT = 2_000;
const GOOGLE_PROVIDER_MID_MIN_VOTE_COUNT = 1_000;

export const GOOGLE_SITEMAP_COHORTS = [
  'filmott-signal',
  'provider-high',
  'provider-mid',
] as const;

export type GoogleSitemapCohort = (typeof GOOGLE_SITEMAP_COHORTS)[number];

export function isGoogleSitemapCohort(
  value: string,
): value is GoogleSitemapCohort {
  return GOOGLE_SITEMAP_COHORTS.some((cohort) => cohort === value);
}

interface SitemapContentRow {
  tmdbId: number | string;
  contentType: string;
  lastModified: Date | string;
}

interface SearchIndexableContentRow {
  id: number | string;
}

@Injectable()
export class ContentIndexingService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
  ) {}

  async isContentSearchIndexable(contentId: number): Promise<boolean> {
    const query = this.contentRepo
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .leftJoin('reviews', 'rv', 'rv.content_id = c.id')
      .leftJoin('rankings', 'rk', 'rk.content_id = c.id');

    this.applySearchIndexableWhere(query);

    const row = await query
      .andWhere('c.id = :contentId', { contentId })
      .limit(1)
      .getRawOne<SearchIndexableContentRow>();

    return row !== undefined;
  }

  private applySearchIndexableWhere(
    query: SelectQueryBuilder<Content>,
  ): SelectQueryBuilder<Content> {
    const { conditions, minVoteCount } = buildSearchIndexableContentSql({
      contentAlias: 'c',
      minVoteCountPlaceholder: ':minVoteCount',
      signalSource: {
        kind: 'joined',
        reviewAlias: 'rv',
        rankingAlias: 'rk',
      },
    });
    const [firstCondition, ...remainingConditions] = conditions;
    query.where(firstCondition);
    for (const condition of remainingConditions) {
      if (condition.includes(':minVoteCount')) {
        query.andWhere(condition, { minVoteCount });
      } else {
        query.andWhere(condition);
      }
    }
    return query;
  }

  /**
   * 사이트맵용: 색인 가치가 높은 대표 콘텐츠를 안정적인 변경일과 함께 반환
   */
  async getSitemapContents(): Promise<
    Array<{ tmdbId: number; contentType: string; lastModified: Date }>
  > {
    const query = this.contentRepo
      .createQueryBuilder('c')
      .select('c.tmdbId', 'tmdbId')
      .addSelect('c.contentType', 'contentType')
      .addSelect(
        'COALESCE(MAX(rv.updated_at), c.updated_at, c.created_at)',
        'lastModified',
      )
      .leftJoin('reviews', 'rv', 'rv.content_id = c.id')
      .leftJoin('rankings', 'rk', 'rk.content_id = c.id');

    this.applySearchIndexableWhere(query);

    const rows = await query
      .groupBy('c.id')
      .orderBy('COUNT(DISTINCT rv.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT rk.id)', 'DESC')
      .addOrderBy(
        'CASE WHEN c.watch_providers IS NOT NULL THEN 1 ELSE 0 END',
        'DESC',
      )
      .addOrderBy('c.vote_count', 'DESC')
      .addOrderBy(
        'COALESCE(MAX(rv.updated_at), c.updated_at, c.created_at)',
        'DESC',
      )
      .addOrderBy('c.id', 'DESC')
      .limit(SITEMAP_CONTENT_LIMIT)
      .getRawMany<SitemapContentRow>();

    return rows.map((r) => ({
      tmdbId: Number(r.tmdbId),
      contentType: r.contentType,
      lastModified: new Date(r.lastModified),
    }));
  }

  /**
   * Google Search Console 관찰용: 기존 sitemap의 고품질 부분집합을
   * 상호 배타적인 cohort로 반환한다.
   */
  async getGoogleSitemapContents(
    cohort: GoogleSitemapCohort,
  ): Promise<
    Array<{ tmdbId: number; contentType: string; lastModified: Date }>
  > {
    const query = this.contentRepo
      .createQueryBuilder('c')
      .select('c.tmdbId', 'tmdbId')
      .addSelect('c.contentType', 'contentType')
      .addSelect(
        'GREATEST(MAX(rv.updated_at), c.updated_at, c.created_at)',
        'lastModified',
      )
      .leftJoin('reviews', 'rv', 'rv.content_id = c.id')
      .leftJoin('rankings', 'rk', 'rk.content_id = c.id');

    this.applySearchIndexableWhere(query);

    if (cohort === 'filmott-signal') {
      query.andWhere('(rv.id IS NOT NULL OR rk.id IS NOT NULL)');
    } else {
      query
        .andWhere('rv.id IS NULL')
        .andWhere('rk.id IS NULL')
        .andWhere('c.watch_providers IS NOT NULL');

      if (cohort === 'provider-high') {
        query.andWhere('c.vote_count >= :googleProviderHighMinVoteCount', {
          googleProviderHighMinVoteCount: GOOGLE_PROVIDER_HIGH_MIN_VOTE_COUNT,
        });
      } else {
        query
          .andWhere('c.vote_count >= :googleProviderMidMinVoteCount', {
            googleProviderMidMinVoteCount: GOOGLE_PROVIDER_MID_MIN_VOTE_COUNT,
          })
          .andWhere('c.vote_count < :googleProviderHighMinVoteCount', {
            googleProviderHighMinVoteCount: GOOGLE_PROVIDER_HIGH_MIN_VOTE_COUNT,
          });
      }
    }

    const rows = await query
      .groupBy('c.id')
      .orderBy('COUNT(DISTINCT rv.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT rk.id)', 'DESC')
      .addOrderBy('c.vote_count', 'DESC')
      .addOrderBy(
        'GREATEST(MAX(rv.updated_at), c.updated_at, c.created_at)',
        'DESC',
      )
      .addOrderBy('c.id', 'DESC')
      .limit(SITEMAP_CONTENT_LIMIT)
      .getRawMany<SitemapContentRow>();

    return rows.map((row) => ({
      tmdbId: Number(row.tmdbId),
      contentType: row.contentType,
      lastModified: new Date(row.lastModified),
    }));
  }
}
