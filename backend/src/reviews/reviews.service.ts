import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ReviewLike)
    private readonly reviewLikeRepo: Repository<ReviewLike>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: number, dto: CreateReviewDto): Promise<Review> {
    const existing = await this.reviewRepo.findOne({
      where: { userId, contentId: dto.contentId },
    });
    if (existing) {
      throw new ConflictException('이미 이 작품에 한줄평을 작성했습니다.');
    }

    const review = this.reviewRepo.create({
      userId,
      contentId: dto.contentId,
      rating: dto.rating,
      comment: dto.comment,
      hasSpoiler: dto.hasSpoiler ?? false,
    });

    return this.reviewRepo.save(review);
  }

  async update(
    userId: number,
    reviewId: number,
    dto: UpdateReviewDto,
  ): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('한줄평을 찾을 수 없습니다.');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('본인의 한줄평만 수정할 수 있습니다.');
    }

    // rating은 null로 변경 불가
    const newRating = dto.rating !== undefined ? dto.rating : review.rating;
    if (newRating == null) {
      throw new BadRequestException('rating은 필수입니다.');
    }

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment;
    if (dto.hasSpoiler !== undefined) review.hasSpoiler = dto.hasSpoiler;

    // 수정 시 likes_count 리셋 + 좋아요 데이터 삭제를 트랜잭션으로 처리
    return this.dataSource.transaction(async (manager) => {
      review.likesCount = 0;
      await manager.delete(ReviewLike, { reviewId: review.id });
      return manager.save(review);
    });
  }

  async delete(userId: number, reviewId: number): Promise<void> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('한줄평을 찾을 수 없습니다.');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('본인의 한줄평만 삭제할 수 있습니다.');
    }

    await this.reviewRepo.remove(review);
  }

  async findMyReview(userId: number, contentId: number): Promise<Review | null> {
    return this.reviewRepo.findOne({
      where: { userId, contentId },
    });
  }

  async findByContent(
    contentId: number,
    page = 1,
    sort: 'latest' | 'likes' = 'latest',
  ) {
    const take = 20;
    const skip = (page - 1) * take;

    const qb = this.reviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .where('review.contentId = :contentId', { contentId })
      .skip(skip)
      .take(take);

    if (sort === 'likes') {
      qb.orderBy('review.likesCount', 'DESC').addOrderBy(
        'review.createdAt',
        'DESC',
      );
    } else {
      qb.orderBy('review.createdAt', 'DESC');
    }

    const [reviews, total] = await qb.getManyAndCount();

    return {
      data: reviews,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
  }

  async findByUser(userId: number, page = 1) {
    const take = 20;
    const skip = (page - 1) * take;

    const [reviews, total] = await this.reviewRepo.findAndCount({
      where: { userId },
      relations: ['content'],
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return {
      data: reviews,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
  }

  async getRecentReviews(limit = 10) {
    return this.reviewRepo.find({
      relations: ['user', 'content'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getContentStats(contentId: number) {
    const result = await this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'averageRating')
      .addSelect('COUNT(*)', 'reviewCount')
      .where('review.contentId = :contentId', { contentId })
      .andWhere('review.rating IS NOT NULL')
      .getRawOne();

    return {
      averageRating: result?.averageRating
        ? parseFloat(parseFloat(result.averageRating).toFixed(1))
        : null,
      reviewCount: parseInt(result?.reviewCount ?? '0', 10),
    };
  }

  async toggleLike(
    userId: number,
    reviewId: number,
  ): Promise<{ liked: boolean; likesCount: number }> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('한줄평을 찾을 수 없습니다.');
    }

    const existing = await this.reviewLikeRepo.findOne({
      where: { reviewId, userId },
    });

    return this.dataSource.transaction(async (manager) => {
      if (existing) {
        await manager.remove(existing);
        await manager
          .createQueryBuilder()
          .update(Review)
          .set({ likesCount: () => 'likes_count - 1' })
          .where('id = :id', { id: reviewId })
          .execute();

        const updated = await manager.findOne(Review, {
          where: { id: reviewId },
        });
        return { liked: false, likesCount: updated!.likesCount };
      } else {
        const like = this.reviewLikeRepo.create({ reviewId, userId });
        await manager.save(like);
        await manager
          .createQueryBuilder()
          .update(Review)
          .set({ likesCount: () => 'likes_count + 1' })
          .where('id = :id', { id: reviewId })
          .execute();

        const updated = await manager.findOne(Review, {
          where: { id: reviewId },
        });
        return { liked: true, likesCount: updated!.likesCount };
      }
    });
  }

}
