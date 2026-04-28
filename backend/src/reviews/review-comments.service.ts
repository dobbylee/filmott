import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewComment } from './review-comment.entity';
import { Review } from './review.entity';
import { CreateReviewCommentDto } from './dto/create-review-comment.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { RevalidateService } from '../common/revalidate.service';

const RECENT_REVIEWS_REVALIDATE_TAGS = ['recent-reviews'];

@Injectable()
export class ReviewCommentsService {
  constructor(
    @InjectRepository(ReviewComment)
    private readonly commentRepo: Repository<ReviewComment>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    private readonly revalidateService: RevalidateService,
  ) {}

  async create(
    userId: number,
    reviewId: number,
    dto: CreateReviewCommentDto,
  ): Promise<ReviewComment> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    const comment = this.commentRepo.create({
      userId,
      reviewId,
      content: dto.content,
    });

    const saved = await this.commentRepo.save(comment);
    await this.revalidateRecentReviews();
    return saved;
  }

  async delete(
    userId: number,
    commentId: number,
    userRole?: string,
  ): Promise<void> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }
    if (comment.userId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다.');
    }

    await this.commentRepo.remove(comment);
    await this.revalidateRecentReviews();
  }

  private async revalidateRecentReviews(): Promise<void> {
    await this.revalidateService.revalidatePath(
      '/',
      RECENT_REVIEWS_REVALIDATE_TAGS,
    );
  }

  async findByReview(reviewId: number, page = 1) {
    const take = 20;
    const skip = (page - 1) * take;

    const [comments, total] = await this.commentRepo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .addSelect([
        'user.id',
        'user.nickname',
        'user.email',
        'user.profileImage',
        'user.status',
      ])
      .where('comment.reviewId = :reviewId', { reviewId })
      .orderBy('comment.createdAt', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return {
      data: comments,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
  }
}
