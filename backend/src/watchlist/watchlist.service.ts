import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watchlist } from './watchlist.entity';
import { ContentsService } from '../contents/contents.service';
import { AddToWatchlistDto } from './dto/add-to-watchlist.dto';
import { UpdateWatchlistDto } from './dto/update-watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    private readonly contentsService: ContentsService,
  ) {}

  /**
   * Add content to watchlist (upsert pattern)
   */
  async addToWatchlist(userId: number, dto: AddToWatchlistDto): Promise<Watchlist> {
    // Ensure content exists in DB
    const content = await this.contentsService.findOrFetchByTmdbId(
      dto.tmdbId,
      dto.contentType,
    );

    // Check if already in watchlist
    const existing = await this.watchlistRepo.findOne({
      where: { userId, contentId: content.id },
    });

    if (existing) {
      // Update status
      existing.status = dto.status;
      existing.watchedAt = dto.status === 'watched'
        ? (dto.watchedAt ? new Date(dto.watchedAt) : new Date())
        : null;
      return this.watchlistRepo.save(existing);
    }

    // Create new entry
    const watchlist = this.watchlistRepo.create({
      userId,
      contentId: content.id,
      status: dto.status,
      watchedAt: dto.status === 'watched'
        ? (dto.watchedAt ? new Date(dto.watchedAt) : new Date())
        : null,
    });

    return this.watchlistRepo.save(watchlist);
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
      throw new NotFoundException('Watchlist item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('Not your watchlist item');
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
  async removeFromWatchlist(userId: number, watchlistId: number): Promise<void> {
    const item = await this.watchlistRepo.findOne({
      where: { id: watchlistId },
    });

    if (!item) {
      throw new NotFoundException('Watchlist item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('Not your watchlist item');
    }

    await this.watchlistRepo.remove(item);
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
      qb.loadRelationCountAndMap(
        'review.commentsCount',
        'review.comments',
      );
    }

    qb.orderBy('w.updatedAt', 'DESC')
      .skip(skip)
      .take(take);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
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
   * Get watchlist status for a specific content (by DB contentId)
   */
  async getWatchlistStatus(userId: number, contentId: number) {
    const item = await this.watchlistRepo.findOne({
      where: { userId, contentId },
    });

    return {
      status: item?.status ?? null,
      watchlistId: item?.id ?? null,
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
    };
  }
}
