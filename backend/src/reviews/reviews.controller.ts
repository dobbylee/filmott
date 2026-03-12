import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewCommentsService } from './review-comments.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { CreateReviewCommentDto } from './dto/create-review-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type{ JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reviewCommentsService: ReviewCommentsService,
  ) {}

  private parseIntOrDefault(value: string | undefined, defaultValue: number, name: string): number {
    if (value === undefined || value === '') return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException(`${name} must be a valid integer`);
    }
    return parsed;
  }

  // --- Reviews CRUD ---

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.reviewsService.delete(user.id, id, user.role);
    return { message: '삭제되었습니다.' };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async findMyReview(
    @CurrentUser() user: JwtPayload,
    @Query('contentId', ParseIntPipe) contentId: number,
  ) {
    return this.reviewsService.findMyReview(user.id, contentId);
  }

  @Get('liked-ids')
  @UseGuards(JwtAuthGuard)
  async getLikedIds(
    @CurrentUser() user: JwtPayload,
    @Query('contentId') contentId?: string,
    @Query('reviewIds') reviewIds?: string,
  ) {
    if (reviewIds) {
      const ids = reviewIds.split(',').map(Number).filter(Boolean);
      return this.reviewsService.getLikedReviewIdsByIds(user.id, ids);
    }
    if (contentId) {
      const parsedContentId = this.parseIntOrDefault(contentId, 0, 'contentId');
      if (parsedContentId === 0) return [];
      return this.reviewsService.getLikedReviewIds(user.id, parsedContentId);
    }
    return [];
  }

  @Get()
  async findByContent(
    @Query('contentId', ParseIntPipe) contentId: number,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    const p = this.parseIntOrDefault(page, 1, 'page');
    const s = sort === 'likes' ? 'likes' : 'latest';
    return this.reviewsService.findByContent(contentId, p, s);
  }

  @Get('recent')
  async getRecent(@Query('limit') limit?: string) {
    const l = this.parseIntOrDefault(limit, 10, 'limit');
    return this.reviewsService.getRecentReviews(Math.min(Math.max(l, 1), 50));
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
  ) {
    const p = this.parseIntOrDefault(page, 1, 'page');
    return this.reviewsService.findByUser(userId, p);
  }

  @Get(':id/stats')
  async getStats(@Param('id', ParseIntPipe) contentId: number) {
    return this.reviewsService.getContentStats(contentId);
  }

  // --- Likes ---

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.reviewsService.toggleLike(user.id, id);
  }

  // --- Comments ---

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  async createComment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) reviewId: number,
    @Body() dto: CreateReviewCommentDto,
  ) {
    return this.reviewCommentsService.create(user.id, reviewId, dto);
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    await this.reviewCommentsService.delete(user.id, commentId, user.role);
    return { message: '댓글이 삭제되었습니다.' };
  }

  @Get(':id/comments')
  async getComments(
    @Param('id', ParseIntPipe) reviewId: number,
    @Query('page') page?: string,
  ) {
    const p = this.parseIntOrDefault(page, 1, 'page');
    return this.reviewCommentsService.findByReview(reviewId, p);
  }
}
