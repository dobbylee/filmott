import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReviewsModule } from '../../src/reviews/reviews.module';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RevalidateService } from '../../src/common/revalidate.service';
import type { JwtPayload } from '../../src/auth/decorators/current-user.decorator';
import { Review } from '../../src/reviews/review.entity';
import { ReviewLike } from '../../src/reviews/review-like.entity';
import { Watchlist } from '../../src/watchlist/watchlist.entity';
import { UserRole } from '../../src/users/enums/user-role.enum';
import {
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import { createIntegrationFixtures } from './helpers/fixtures';
import {
  createIntegrationApp,
  requestIntegrationApp,
} from './helpers/test-app';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

function getResponseItems(body: unknown): Array<{ id: number }> {
  if (!Array.isArray(body)) {
    throw new Error('배열 응답이 필요합니다.');
  }

  return body.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'number'
    ) {
      throw new Error('id가 있는 응답 항목이 필요합니다.');
    }

    return { id: item.id };
  });
}

describeWithDb('reviews integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let currentUser: JwtPayload;
  const revalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
    revalidatePaths: jest.fn().mockResolvedValue(undefined),
  };
  const authGuard: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
      request.user = currentUser;
      return true;
    },
  };

  beforeAll(async () => {
    app = await createIntegrationApp({
      imports: [ReviewsModule],
      configure: (builder) =>
        builder
          .overrideGuard(JwtAuthGuard)
          .useValue(authGuard)
          .overrideProvider(RevalidateService)
          .useValue(revalidateService),
    });
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('리뷰 작성 시 review를 저장하고 want_to_watch를 watched로 전환해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const user = await fixtures.user();
    const content = await fixtures.content();
    await fixtures.watchlist({
      userId: user.id,
      contentId: content.id,
      status: 'want_to_watch',
    });
    currentUser = { id: user.id, nickname: user.nickname, role: user.role };

    const response = await requestIntegrationApp(app, 'POST', '/api/reviews', {
      contentId: content.id,
      rating: 9,
      comment: '실제 DB에 저장되는 리뷰',
      watchedAt: '2026-05-01',
    });

    expect(response.status).toBe(201);
    const review = await dataSource.getRepository(Review).findOneByOrFail({
      userId: user.id,
      contentId: content.id,
    });
    const watchlist = await dataSource
      .getRepository(Watchlist)
      .findOneByOrFail({
        userId: user.id,
        contentId: content.id,
      });
    expect(review.rating).toBe(9);
    expect(review.comment).toBe('실제 DB에 저장되는 리뷰');
    expect(watchlist.status).toBe('watched');
    expect(watchlist.watchedAt).toBe('2026-05-01');
    expect(revalidateService.revalidatePath).toHaveBeenCalledWith('/', [
      'recent-reviews',
    ]);
  });

  it('같은 유저와 콘텐츠의 중복 리뷰 작성을 차단해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const user = await fixtures.user();
    const content = await fixtures.content();
    await fixtures.review({ userId: user.id, contentId: content.id });
    currentUser = { id: user.id, nickname: user.nickname, role: user.role };

    const response = await requestIntegrationApp(app, 'POST', '/api/reviews', {
      contentId: content.id,
      rating: 8,
    });

    expect(response.status).toBe(409);
    expect(await dataSource.getRepository(Review).count()).toBe(1);
    expect(revalidateService.revalidatePath).not.toHaveBeenCalled();
  });

  it('리뷰 내용 변경 시 좋아요를 삭제하고 likesCount를 0으로 초기화해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const owner = await fixtures.user();
    const liker = await fixtures.user();
    const content = await fixtures.content();
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      rating: 7,
      comment: '기존 리뷰',
      likesCount: 1,
    });
    await fixtures.reviewLike({ reviewId: review.id, userId: liker.id });
    currentUser = { id: owner.id, nickname: owner.nickname, role: owner.role };

    const response = await requestIntegrationApp(
      app,
      'PATCH',
      `/api/reviews/${review.id}`,
      {
        rating: 9,
        comment: '수정된 리뷰',
      },
    );

    expect(response.status).toBe(200);
    const updated = await dataSource.getRepository(Review).findOneByOrFail({
      id: review.id,
    });
    expect(updated.rating).toBe(9);
    expect(updated.comment).toBe('수정된 리뷰');
    expect(updated.likesCount).toBe(0);
    expect(await dataSource.getRepository(ReviewLike).count()).toBe(0);
  });

  it('watchedAt만 변경하면 기존 좋아요를 유지해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const owner = await fixtures.user();
    const liker = await fixtures.user();
    const content = await fixtures.content();
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      rating: 8,
      likesCount: 1,
    });
    await fixtures.watchlist({
      userId: owner.id,
      contentId: content.id,
      status: 'watched',
      watchedAt: '2026-04-01',
    });
    await fixtures.reviewLike({ reviewId: review.id, userId: liker.id });
    currentUser = { id: owner.id, nickname: owner.nickname, role: owner.role };

    const response = await requestIntegrationApp(
      app,
      'PATCH',
      `/api/reviews/${review.id}`,
      {
        watchedAt: '2026-05-02',
      },
    );

    expect(response.status).toBe(200);
    const updated = await dataSource.getRepository(Review).findOneByOrFail({
      id: review.id,
    });
    const watchlist = await dataSource
      .getRepository(Watchlist)
      .findOneByOrFail({
        userId: owner.id,
        contentId: content.id,
      });
    expect(updated.likesCount).toBe(1);
    expect(await dataSource.getRepository(ReviewLike).count()).toBe(1);
    expect(watchlist.watchedAt).toBe('2026-05-02');
  });

  it('최근 리뷰를 최신순으로 반환해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const firstUser = await fixtures.user();
    const secondUser = await fixtures.user();
    const firstContent = await fixtures.content({ title: '먼저 작성한 작품' });
    const secondContent = await fixtures.content({ title: '나중 작성한 작품' });
    const oldReview = await fixtures.review({
      userId: firstUser.id,
      contentId: firstContent.id,
      comment: '오래된 리뷰',
    });
    const newReview = await fixtures.review({
      userId: secondUser.id,
      contentId: secondContent.id,
      comment: '최신 리뷰',
    });
    await dataSource.query('UPDATE reviews SET created_at = $1 WHERE id = $2', [
      '2026-05-01T00:00:00.000Z',
      oldReview.id,
    ]);
    await dataSource.query('UPDATE reviews SET created_at = $1 WHERE id = $2', [
      '2026-05-02T00:00:00.000Z',
      newReview.id,
    ]);

    const response = await requestIntegrationApp(
      app,
      'GET',
      '/api/reviews/recent?limit=2',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: oldReview.id }),
        expect.objectContaining({ id: newReview.id }),
      ]),
    );
    expect(getResponseItems(response.body)[0].id).toBe(newReview.id);
  });

  it('소유자와 관리자만 리뷰를 삭제할 수 있어야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const owner = await fixtures.user();
    const other = await fixtures.user();
    const admin = await fixtures.user({ role: UserRole.ADMIN });
    const content = await fixtures.content();
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
    });

    currentUser = { id: other.id, nickname: other.nickname, role: other.role };
    const forbidden = await requestIntegrationApp(
      app,
      'DELETE',
      `/api/reviews/${review.id}`,
    );
    expect(forbidden.status).toBe(403);

    currentUser = { id: admin.id, nickname: admin.nickname, role: admin.role };
    const deleted = await requestIntegrationApp(
      app,
      'DELETE',
      `/api/reviews/${review.id}`,
    );

    expect(deleted.status).toBe(200);
    expect(await dataSource.getRepository(Review).count()).toBe(0);
  });
});
