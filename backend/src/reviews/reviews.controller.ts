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
    @Query('contentId', ParseIntPipe) contentId: number,
  ) {
    return this.reviewsService.getLikedReviewIds(user.id, contentId);
  }

  @Get()
  async findByContent(
    @Query('contentId', ParseIntPipe) contentId: number,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const s = sort === 'likes' ? 'likes' : 'latest';
    return this.reviewsService.findByContent(contentId, p, s);
  }

  @Get('recent')
  async getRecent(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    return this.reviewsService.getRecentReviews(l);
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
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
    const p = page ? parseInt(page, 10) : 1;
    return this.reviewCommentsService.findByReview(reviewId, p);
  }
}
