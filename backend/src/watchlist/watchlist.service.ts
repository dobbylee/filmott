import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Watchlist } from './watchlist.entity';
import { Review } from '../reviews/review.entity';
import { ContentsService } from '../contents/contents.service';
import { AddToWatchlistDto } from './dto/add-to-watchlist.dto';
import { UpdateWatchlistDto } from './dto/update-watchlist.dto';
import { RevalidateService } from '../common/revalidate.service';

const RECENT_REVIEWS_REVALIDATE_TAGS = ['recent-reviews'];

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    private readonly contentsService: ContentsService,
    private readonly revalidateService: RevalidateService,
  ) {}

  /**
   * Add content to watchlist (upsert pattern)
   */
  async addToWatchlist(
    userId: number,
    dto: AddToWatchlistDto,
  ): Promise<Watchlist> {
    // Ensure content exists in DB
    const content = await this.contentsService.findOrFetchByTmdbId(
      dto.tmdbId,
      dto.contentType,
    );

    if (dto.status === 'want_to_watch') {
      await this.assertNoReviewForWantToWatch(userId, content.id);
    }

    // Check if already in watchlist
    const existing = await this.watchlistRepo.findOne({
      where: { userId, contentId: content.id },
    });

    if (existing) {
      // Update status
      existing.status = dto.status;
      existing.watchedAt =
        dto.status === 'watched'
          ? dto.watchedAt
            ? new Date(dto.watchedAt)
            : new Date()
          : null;
      return this.watchlistRepo.save(existing);
    }

    // Create new entry
    const watchlist = this.watchlistRepo.create({
      userId,
      contentId: content.id,
      status: dto.status,
      watchedAt:
        dto.status === 'watched'
          ? dto.watchedAt
            ? new Date(dto.watchedAt)
            : new Date()
          : null,
    });

    return this.watchlistRepo.save(watchlist);
  }

  /**
   * Add to watchlist by contentId (used by ReviewsService on review creation)
   */
  async addToWatchlistByContentId(
    userId: number,
    contentId: number,
    status: 'watched' | 'want_to_watch',
    watchedAt?: string,
  ): Promise<Watchlist> {
    return this.upsertByContentId(
      this.watchlistRepo,
      userId,
      contentId,
      status,
      watchedAt,
    );
  }

  async addToWatchlistByContentIdWithManager(
    manager: EntityManager,
    userId: number,
    contentId: number,
    status: 'watched' | 'want_to_watch',
    watchedAt?: string,
  ): Promise<Watchlist> {
    return this.upsertByContentId(
      manager.getRepository(Watchlist),
      userId,
      contentId,
      status,
      watchedAt,
    );
  }

  /**
   * Update watchlist item status
   */
  async updateStatus(
    userId: number,
    watchlistId: number,
    dto: UpdateWatchlistDto,
  ): Promise<Watchlist> {
    const item = await this.watchlistRepo.findOne({
      where: { id: watchlistId },
    });

    if (!item) {
      throw new NotFoundException('워치리스트 항목을 찾을 수 없습니다.');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException(
        '본인의 워치리스트 항목만 수정할 수 있습니다.',
      );
    }

    if (dto.status) {
      item.status = dto.status;
      if (dto.status === 'watched') {
        item.watchedAt = dto.watchedAt ? new Date(dto.watchedAt) : new Date();
      } else {
        item.watchedAt = null;
      }
    } else if (dto.watchedAt && item.status === 'watched') {
      item.watchedAt = new Date(dto.watchedAt);
    }

    return this.watchlistRepo.save(item);
  }

  /**
   * Remove from watchlist
   */
  async removeFromWatchlist(
    userId: number,
    watchlistId: number,
  ): Promise<void> {
    const item = await this.watchlistRepo.findOne({
      where: { id: watchlistId },
    });

    if (!item) {
      throw new NotFoundException('워치리스트 항목을 찾을 수 없습니다.');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException(
        '본인의 워치리스트 항목만 수정할 수 있습니다.',
      );
    }

    const deletedReviewsCount = await this.watchlistRepo.manager.transaction(
      async (manager) => {
        const reviewDeleteResult = await manager.delete(Review, {
          userId,
          contentId: item.contentId,
        });
        await manager.remove(Watchlist, item);
        return reviewDeleteResult.affected ?? 0;
      },
    );

    if (deletedReviewsCount > 0) {
      await this.revalidateRecentReviews();
    }
  }

  /**
   * Get my watchlist with pagination
   * When status='watched', LEFT JOIN review for user's review on that content
   */
  async getMyWatchlist(
    userId: number,
    status: 'want_to_watch' | 'watched',
    page = 1,
  ) {
    const take = 20;
    const skip = (page - 1) * take;

    const qb = this.watchlistRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.content', 'content')
      .where('w.userId = :userId', { userId })
      .andWhere('w.status = :status', { status });

    // If watched, also join user's review for that content + commentsCount
    if (status === 'watched') {
      qb.leftJoinAndMapOne(
        'w.review',
        'Review',
        'review',
        'review.userId = w.userId AND review.contentId = w.contentId',
      );
      qb.loadRelationCountAndMap('review.commentsCount', 'review.comments');
    }

    qb.orderBy('w.updatedAt', 'DESC').skip(skip).take(take);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Get want_to_watch items with cursor-based pagination
   */
  async getWantToWatchAll(userId: number, limit = 30, offset = 0) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [items, total] = await this.watchlistRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.content', 'content')
      .where('w.userId = :userId', { userId })
      .andWhere('w.status = :status', { status: 'want_to_watch' })
      .orderBy('w.createdAt', 'DESC')
      .skip(safeOffset)
      .take(safeLimit)
      .getManyAndCount();

    return { items, total, hasMore: safeOffset + items.length < total };
  }

  /**
   * Get counts for watched and want_to_watch
   */
  async getMyWatchlistCounts(userId: number) {
    const [watchedCount, wantToWatchCount] = await Promise.all([
      this.watchlistRepo.count({ where: { userId, status: 'watched' } }),
      this.watchlistRepo.count({ where: { userId, status: 'want_to_watch' } }),
    ]);

    return { watchedCount, wantToWatchCount };
  }

  /**
   * Get distinct years where user has watched content
   */
  async getWatchedYears(userId: number): Promise<{ years: number[] }> {
    const result = await this.watchlistRepo
      .createQueryBuilder('w')
      .select(
        'DISTINCT EXTRACT(YEAR FROM COALESCE(w.watchedAt, w.updatedAt))',
        'year',
      )
      .where('w.userId = :userId', { userId })
      .andWhere('w.status = :status', { status: 'watched' })
      .orderBy('year', 'DESC')
      .getRawMany<{ year: string }>();

    const years = result.map((r) => parseInt(r.year, 10));
    return { years };
  }

  /**
   * Get watched items grouped by month for a specific year
   */
  async getWatchedByYear(userId: number, year: number) {
    const startDate = new Date(year, 0, 1); // Jan 1
    const endDate = new Date(year + 1, 0, 1); // Jan 1 next year

    const qb = this.watchlistRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.content', 'content')
      .leftJoinAndMapOne(
        'w.review',
        'Review',
        'review',
        'review.userId = w.userId AND review.contentId = w.contentId',
      )
      .where('w.userId = :userId', { userId })
      .andWhere('w.status = :status', { status: 'watched' })
      .andWhere('COALESCE(w.watchedAt, w.updatedAt) >= :startDate', {
        startDate,
      })
      .andWhere('COALESCE(w.watchedAt, w.updatedAt) < :endDate', { endDate });

    qb.loadRelationCountAndMap('review.commentsCount', 'review.comments');

    qb.orderBy('COALESCE(w.watchedAt, w.updatedAt)', 'DESC').addOrderBy(
      'w.id',
      'DESC',
    );

    const items = await qb.getMany();

    // Group by month in JS
    const monthMap = new Map<number, typeof items>();
    for (const item of items) {
      const effectiveDate = item.watchedAt ?? item.updatedAt;
      const d = new Date(effectiveDate);
      const month = d.getMonth() + 1; // 1~12
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      monthMap.get(month)!.push(item);
    }

    // Build months array sorted 12 -> 1 (newest first)
    const months = Array.from(monthMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([month, monthItems]) => ({
        month,
        count: monthItems.length,
        items: monthItems,
      }));

    return {
      year,
      totalCount: items.length,
      months,
    };
  }

  /**
   * Get watchlist status for a specific content (by DB contentId)
   */
  async getWatchlistStatus(userId: number, contentId: number) {
    const item = await this.watchlistRepo.findOne({
      where: { userId, contentId },
    });

    return {
      status: item?.status ?? null,
      watchlistId: item?.id ?? null,
      watchedAt: item?.watchedAt ?? null,
    };
  }

  /**
   * Get watchlist status by tmdbId (for detail page button)
   */
  async getWatchlistStatusByTmdbId(
    userId: number,
    tmdbId: number,
    contentType: 'movie' | 'tv',
  ) {
    const item = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'content')
      .where('w.userId = :userId', { userId })
      .andWhere('content.tmdbId = :tmdbId', { tmdbId })
      .andWhere('content.contentType = :contentType', { contentType })
      .getOne();

    return {
      status: item?.status ?? null,
      watchlistId: item?.id ?? null,
      watchedAt: item?.watchedAt ?? null,
    };
  }

  private async upsertByContentId(
    repo: Repository<Watchlist>,
    userId: number,
    contentId: number,
    status: 'watched' | 'want_to_watch',
    watchedAt?: string,
  ): Promise<Watchlist> {
    if (status === 'want_to_watch') {
      await this.assertNoReviewForWantToWatch(userId, contentId);
    }

    const existing = await repo.findOne({
      where: { userId, contentId },
    });

    const resolvedDate =
      status === 'watched'
        ? watchedAt
          ? new Date(watchedAt)
          : new Date()
        : null;

    if (existing) {
      existing.status = status;
      existing.watchedAt = resolvedDate;
      return repo.save(existing);
    }

    const watchlist = repo.create({
      userId,
      contentId,
      status,
      watchedAt: resolvedDate,
    });

    return repo.save(watchlist);
  }

  private async assertNoReviewForWantToWatch(
    userId: number,
    contentId: number,
  ): Promise<void> {
    const existingReview = await this.reviewRepo.findOne({
      where: { userId, contentId },
      select: ['id'],
    });

    if (existingReview) {
      throw new BadRequestException(
        '작성한 리뷰가 있는 작품은 감상할 작품으로 등록할 수 없습니다.',
      );
    }
  }

  private async revalidateRecentReviews(): Promise<void> {
    await this.revalidateService.revalidatePath(
      '/',
      RECENT_REVIEWS_REVALIDATE_TAGS,
    );
  }
}
