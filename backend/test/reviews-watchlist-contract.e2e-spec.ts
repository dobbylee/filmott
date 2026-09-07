import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../src/users/enums/user-role.enum';
import { User } from '../src/users/user.entity';
import { Content } from '../src/contents/content.entity';
import { Review } from '../src/reviews/review.entity';
import { ReviewLike } from '../src/reviews/review-like.entity';
import { ReviewComment } from '../src/reviews/review-comment.entity';
import { Watchlist } from '../src/watchlist/watchlist.entity';
import { WatchlistService } from '../src/watchlist/watchlist.service';
import { createContractApp } from './contracts/contract-app';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

describe('리뷰·감상기록 실제 HTTP·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let owner: User;
  let other: User;
  let admin: User;
  let content: Content;
  const sign = (user: User) =>
    harness.app.get(JwtService).sign({ sub: user.id });
  const api = () => request(harness.app.getHttpServer());

  beforeEach(async () => {
    harness = await createContractApp();
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    owner = await fixtures.user();
    other = await fixtures.user();
    admin = await fixtures.user({ role: UserRole.ADMIN });
    content = await fixtures.content({ tmdbId: 101, posterUrl: '/poster.jpg' });
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
      expect(harness.httpCalls).toEqual([]);
      expect(harness.s3Spy).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it('리뷰 작성은 감상기록을 함께 저장하고 모든 조회에서 같은 내용을 반환해야 한다', async () => {
    const missing = await api()
      .get(`/api/reviews/my?contentId=${content.id}`)
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(missing.text).toBe('');
    const response = await api()
      .post('/api/reviews')
      .auth(sign(owner), { type: 'bearer' })
      .send({
        contentId: content.id,
        rating: 8,
        comment: '계약 리뷰',
        watchedAt: '2026-02-03',
      })
      .expect(201);
    const review = await db
      .getRepository(Review)
      .findOneByOrFail({ userId: owner.id, contentId: content.id });
    expect(response.body).toEqual({
      id: review.id,
      userId: owner.id,
      contentId: content.id,
      rating: 8,
      comment: '계약 리뷰',
      likesCount: 0,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    });
    expect(
      await db
        .getRepository(Watchlist)
        .findOneByOrFail({ userId: owner.id, contentId: content.id }),
    ).toMatchObject({ status: 'watched', watchedAt: '2026-02-03' });
    const mine = await api()
      .get(`/api/reviews/my?contentId=${content.id}`)
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(mine.body).toMatchObject({
      ...response.body,
      commentsCount: 0,
      user: {
        id: owner.id,
        nickname: owner.nickname,
        status: 'ACTIVE',
        profileImage: null,
      },
    });
    expect(Object.keys(mine.body.user).sort()).toEqual([
      'id',
      'nickname',
      'profileImage',
      'status',
    ]);
    for (const url of [
      `/api/reviews?contentId=${content.id}&page=1&sort=latest`,
      `/api/reviews/user/${owner.id}?page=1&limit=10`,
    ]) {
      const result = await api().get(url).expect(200);
      expect(result.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
      expect(result.body.data.map((item: { id: number }) => item.id)).toEqual([
        review.id,
      ]);
      expect(result.body.data[0]).toMatchObject({
        ...response.body,
        commentsCount: 0,
        user: {
          id: owner.id,
          nickname: owner.nickname,
          profileImage: null,
          status: 'ACTIVE',
        },
      });
      expect(Object.keys(result.body.data[0].user).sort()).toEqual([
        'id',
        'nickname',
        'profileImage',
        'status',
      ]);
      if (url.startsWith('/api/reviews/user/')) {
        expect(result.body.data[0].content).toMatchObject({
          id: content.id,
          tmdbId: 101,
          title: content.title,
          posterUrl: '/poster.jpg',
        });
      }
    }
    const recent = await api().get('/api/reviews/recent?limit=10').expect(200);
    expect(recent.body.map((item: { id: number }) => item.id)).toEqual([
      review.id,
    ]);
    expect(recent.body[0]).toMatchObject({
      ...response.body,
      commentsCount: 0,
      user: {
        id: owner.id,
        nickname: owner.nickname,
        profileImage: null,
        status: 'ACTIVE',
      },
      content: {
        id: content.id,
        tmdbId: 101,
        title: content.title,
        posterUrl: '/poster.jpg',
      },
    });
    expect(Object.keys(recent.body[0].user).sort()).toEqual([
      'id',
      'nickname',
      'profileImage',
      'status',
    ]);
    await api()
      .get(`/api/reviews/${content.id}/stats`)
      .expect(200, { averageRating: 8, reviewCount: 1 });
    await api()
      .get('/api/reviews/99999/stats')
      .expect(200, { averageRating: null, reviewCount: 0 });
    await api()
      .post('/api/reviews')
      .auth(sign(owner), { type: 'bearer' })
      .send({ contentId: content.id, rating: 9 })
      .expect(409);
    expect(await db.getRepository(Review).count()).toBe(1);
    expect(
      harness.fetchCalls.map((call) => JSON.parse(String(call.body))),
    ).toEqual([
      { path: '/', tags: ['recent-reviews', `content-reviews:${content.id}`] },
    ]);
  });

  it('좋아요 토글·댓글·리뷰 변경은 응답과 관련 행의 변화를 보존해야 한다', async () => {
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
    });
    await api()
      .post(`/api/reviews/${review.id}/like`)
      .auth(sign(other), { type: 'bearer' })
      .expect(201, { liked: true, likesCount: 1 });
    for (const query of [
      `contentId=${content.id}`,
      `reviewIds=${review.id}`,
      `reviewIds=${review.id}&contentId=99999`,
    ]) {
      await api()
        .get(`/api/reviews/liked-ids?${query}`)
        .auth(sign(other), { type: 'bearer' })
        .expect(200, [review.id]);
    }
    await api()
      .get('/api/reviews/liked-ids')
      .auth(sign(other), { type: 'bearer' })
      .expect(200, []);
    const comment = await api()
      .post(`/api/reviews/${review.id}/comments`)
      .auth(sign(other), { type: 'bearer' })
      .send({ content: '첫 댓글' })
      .expect(201);
    const comments = await api()
      .get(`/api/reviews/${review.id}/comments?page=1`)
      .expect(200);
    expect(comments.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(comments.body.data[0]).toMatchObject({
      id: comment.body.id,
      content: '첫 댓글',
      user: { id: other.id },
    });
    expect(Object.keys(comments.body.data[0].user).sort()).toEqual([
      'id',
      'nickname',
      'profileImage',
      'status',
    ]);
    await api()
      .patch(`/api/reviews/${review.id}`)
      .auth(sign(owner), { type: 'bearer' })
      .send({ watchedAt: '2026-03-01' })
      .expect(200);
    expect(
      await db.getRepository(ReviewLike).countBy({ reviewId: review.id }),
    ).toBe(1);
    const changed = await api()
      .patch(`/api/reviews/${review.id}`)
      .auth(sign(owner), { type: 'bearer' })
      .send({ rating: 9, comment: '바뀐 리뷰' })
      .expect(200);
    expect(changed.body).toMatchObject({
      rating: 9,
      comment: '바뀐 리뷰',
      likesCount: 0,
    });
    expect(await db.getRepository(ReviewLike).count()).toBe(0);
    await api()
      .delete(`/api/reviews/comments/${comment.body.id}`)
      .auth(sign(admin), { type: 'bearer' })
      .expect(200, { message: '댓글이 삭제되었습니다.' });
    expect(await db.getRepository(ReviewComment).count()).toBe(0);
    await api()
      .delete(`/api/reviews/${review.id}`)
      .auth(sign(admin), { type: 'bearer' })
      .expect(200, { message: '삭제되었습니다.' });
    expect(await db.getRepository(Review).count()).toBe(0);
    expect(await db.getRepository(Watchlist).count()).toBe(1);
  });

  it('리뷰·댓글의 타인 변경과 DTO 오류는 DB와 revalidation을 바꾸지 않아야 한다', async () => {
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
    });
    const comment = await fixtures.reviewComment({
      userId: owner.id,
      reviewId: review.id,
    });
    await api()
      .patch(`/api/reviews/${review.id}`)
      .auth(sign(other), { type: 'bearer' })
      .send({ rating: 3 })
      .expect(403);
    await api()
      .delete(`/api/reviews/${review.id}`)
      .auth(sign(other), { type: 'bearer' })
      .expect(403);
    await api()
      .delete(`/api/reviews/comments/${comment.id}`)
      .auth(sign(other), { type: 'bearer' })
      .expect(403);
    await api()
      .post('/api/reviews')
      .auth(sign(other), { type: 'bearer' })
      .send({ contentId: content.id, rating: 0 })
      .expect(400);
    await api()
      .post(`/api/reviews/${review.id}/comments`)
      .auth(sign(other), { type: 'bearer' })
      .send({ content: '' })
      .expect(400);
    await api()
      .post('/api/reviews/99999/comments')
      .auth(sign(other), { type: 'bearer' })
      .send({ content: '댓글' })
      .expect(404);
    expect(
      await db.getRepository(Review).findOneByOrFail({ id: review.id }),
    ).toEqual(review);
    expect(
      await db.getRepository(ReviewComment).findOneByOrFail({ id: comment.id }),
    ).toEqual(comment);
    expect(harness.fetchCalls).toEqual([]);
  });

  it('감상기록 저장 실패는 앞서 저장한 리뷰도 실제 transaction에서 rollback해야 한다', async () => {
    const watcher = harness.app.get<WatchlistService>(WatchlistService);
    // 실패 지점만 주입하며 Review 저장과 transaction rollback은 실제 DB로 확인한다.
    const failure = jest
      .spyOn(watcher, 'addToWatchlistByContentIdWithManager')
      .mockRejectedValueOnce(new Error('고정 후속 저장 실패'));
    try {
      await api()
        .post('/api/reviews')
        .auth(sign(owner), { type: 'bearer' })
        .send({ contentId: content.id, rating: 8 })
        .expect(500);
      expect(failure).toHaveBeenCalledTimes(1);
      expect(await db.getRepository(Review).count()).toBe(0);
      expect(await db.getRepository(Watchlist).count()).toBe(0);
      expect(harness.fetchCalls).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });

  it('동시 좋아요는 실제 row lock으로 count를 보존하고 재토글은 정확히 취소해야 한다', async () => {
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
    });
    const toggle = (user: User) =>
      api()
        .post(`/api/reviews/${review.id}/like`)
        .auth(sign(user), { type: 'bearer' });
    const settled = await Promise.allSettled([
      toggle(owner).expect(201),
      toggle(other).expect(201),
    ]);
    expect(settled.filter((result) => result.status === 'rejected')).toEqual(
      [],
    );
    const results = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(results.every((result) => result.body.liked === true)).toBe(true);
    expect(results.map((result) => result.body.likesCount).sort()).toEqual([
      1, 2,
    ]);
    expect(await db.getRepository(ReviewLike).count()).toBe(2);
    expect(
      (await db.getRepository(Review).findOneByOrFail({ id: review.id }))
        .likesCount,
    ).toBe(2);
    await toggle(owner).expect(201, { liked: false, likesCount: 1 });
    expect(await db.getRepository(ReviewLike).count()).toBe(1);
  });

  it('감상기록의 upsert·상태·날짜·조회·집계는 동일 사용자와 작품에 일치해야 한다', async () => {
    const add = await api()
      .post('/api/watchlist')
      .auth(sign(owner), { type: 'bearer' })
      .send({ tmdbId: 101, contentType: 'movie', status: 'want_to_watch' })
      .expect(201);
    const id: number = add.body.id;
    expect(add.body).toMatchObject({
      contentId: content.id,
      userId: owner.id,
      status: 'want_to_watch',
      watchedAt: null,
    });
    await api()
      .get('/api/watchlist/me/counts')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200, { watchedCount: 0, wantToWatchCount: 1 });
    const want = await api()
      .get('/api/watchlist/me/want-to-watch?limit=0&offset=-1')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(want.body).toMatchObject({ total: 1, hasMore: false });
    expect(want.body.items.map((item: { id: number }) => item.id)).toEqual([
      id,
    ]);
    await api()
      .patch(`/api/watchlist/${id}`)
      .auth(sign(owner), { type: 'bearer' })
      .send({ status: 'watched', watchedAt: '2026-02-03' })
      .expect(200);
    const expectedStatus = {
      status: 'watched',
      watchlistId: id,
      watchedAt: '2026-02-03',
    };
    for (const query of [
      `contentId=${content.id}`,
      'tmdbId=101&contentType=movie',
    ]) {
      await api()
        .get(`/api/watchlist/me/status?${query}`)
        .auth(sign(owner), { type: 'bearer' })
        .expect(200, expectedStatus);
    }
    await api()
      .get('/api/watchlist/me/status?contentId=bad&tmdbId=101')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200, { status: null, watchlistId: null, watchedAt: null });
    const list = await api()
      .get('/api/watchlist/me?status=watched&page=1')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(list.body.items.map((item: { id: number }) => item.id)).toEqual([
      id,
    ]);
    await api()
      .get('/api/watchlist/me/watched-years')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200, { years: [2026] });
    const year = await api()
      .get('/api/watchlist/me/watched?year=2026')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(year.body).toMatchObject({
      year: 2026,
      totalCount: 1,
      months: [{ month: 2, count: 1 }],
    });
    expect(
      year.body.months[0].items.map((item: { id: number }) => item.id),
    ).toEqual([id]);
    await api()
      .get('/api/watchlist/me/counts')
      .auth(sign(other), { type: 'bearer' })
      .expect(200, { watchedCount: 0, wantToWatchCount: 0 });
    const upsert = await api()
      .post('/api/watchlist')
      .auth(sign(owner), { type: 'bearer' })
      .send({ tmdbId: 101, contentType: 'movie', status: 'want_to_watch' })
      .expect(201);
    expect(upsert.body).toMatchObject({
      id,
      status: 'want_to_watch',
      watchedAt: null,
    });
    expect(await db.getRepository(Watchlist).count()).toBe(1);
  });

  it('감상기록 삭제는 관련 리뷰·좋아요·댓글을 함께 삭제하고 타인 요청은 거부해야 한다', async () => {
    const item = await fixtures.watchlist({
      userId: owner.id,
      contentId: content.id,
      status: 'watched',
    });
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      likesCount: 1,
    });
    await fixtures.reviewLike({ userId: other.id, reviewId: review.id });
    await fixtures.reviewComment({ userId: other.id, reviewId: review.id });
    await api()
      .delete(`/api/watchlist/${item.id}`)
      .auth(sign(other), { type: 'bearer' })
      .expect(403);
    await api()
      .patch(`/api/watchlist/${item.id}`)
      .auth(sign(other), { type: 'bearer' })
      .send({ watchedAt: '2026-01-01' })
      .expect(403);
    expect(await db.getRepository(Review).count()).toBe(1);
    expect(harness.fetchCalls).toEqual([]);
    for (const action of ['post', 'patch'] as const) {
      await api()
        [action](
          action === 'post' ? '/api/watchlist' : `/api/watchlist/${item.id}`,
        )
        .auth(sign(owner), { type: 'bearer' })
        .send(
          action === 'post'
            ? { tmdbId: 101, contentType: 'movie', status: 'want_to_watch' }
            : { status: 'want_to_watch' },
        )
        .expect(400);
    }
    expect(
      (await db.getRepository(Watchlist).findOneByOrFail({ id: item.id }))
        .status,
    ).toBe('watched');
    await api()
      .delete(`/api/watchlist/${item.id}`)
      .auth(sign(owner), { type: 'bearer' })
      .expect(200, { message: 'Removed from watchlist' });
    for (const entity of [Watchlist, Review, ReviewLike, ReviewComment])
      expect(await db.getRepository(entity).count()).toBe(0);
    expect(
      harness.fetchCalls.map((call) => JSON.parse(String(call.body))),
    ).toEqual([{ path: '/', tags: ['recent-reviews'] }]);
  });

  it('리뷰의 최신·좋아요 정렬과 사용자·댓글 페이지는 실제 SQL 결과를 유지해야 한다', async () => {
    const first = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      likesCount: 3,
      createdAt: new Date('2026-01-01'),
    });
    const second = await fixtures.review({
      userId: other.id,
      contentId: content.id,
      likesCount: 3,
      createdAt: new Date('2026-01-03'),
    });
    const third = await fixtures.review({
      userId: admin.id,
      contentId: content.id,
      likesCount: 1,
      createdAt: new Date('2026-01-02'),
    });
    const latest = await api()
      .get(`/api/reviews?contentId=${content.id}&sort=latest`)
      .expect(200);
    expect(latest.body.data.map((row: { id: number }) => row.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);
    const likes = await api()
      .get(`/api/reviews?contentId=${content.id}&sort=likes`)
      .expect(200);
    expect(likes.body.data.map((row: { id: number }) => row.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ]);
    await api()
      .get(`/api/reviews?contentId=${content.id}&page=2`)
      .expect(200, { data: [], total: 3, page: 2, totalPages: 1 });
    const adult = await fixtures.content({ adult: true });
    const hidden = await fixtures.review({
      userId: owner.id,
      contentId: adult.id,
      createdAt: new Date('2026-01-04'),
    });
    const recent = await api().get('/api/reviews/recent?limit=2').expect(200);
    expect(recent.body.map((row: { id: number }) => row.id)).toEqual([
      second.id,
      third.id,
    ]);
    const byUser = await api()
      .get(`/api/reviews/user/${owner.id}?limit=1&page=2`)
      .expect(200);
    expect(byUser.body).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(byUser.body.data.map((row: { id: number }) => row.id)).toEqual([
      first.id,
    ]);
    const commentIds: number[] = [];
    for (let index = 0; index < 21; index++) {
      const comment = await fixtures.reviewComment({
        userId: other.id,
        reviewId: first.id,
        content: `댓글 ${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      });
      commentIds.push(comment.id);
    }
    const comments = await api()
      .get(`/api/reviews/${first.id}/comments?page=2`)
      .expect(200);
    expect(comments.body).toMatchObject({ total: 21, page: 2, totalPages: 2 });
    expect(comments.body.data.map((row: { id: number }) => row.id)).toEqual([
      commentIds[20],
    ]);
    for (const url of [
      `/api/reviews?contentId=${content.id}&page=nope`,
      `/api/reviews/${first.id}/comments?page=nope`,
    ]) {
      await api().get(url).expect(400);
    }
  });

  it('감상기록 후속 삭제 실패는 리뷰·좋아요·댓글까지 실제 transaction으로 복구해야 한다', async () => {
    const item = await fixtures.watchlist({
      userId: owner.id,
      contentId: content.id,
      status: 'watched',
    });
    const review = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      likesCount: 1,
    });
    await fixtures.reviewLike({ userId: other.id, reviewId: review.id });
    await fixtures.reviewComment({ userId: other.id, reviewId: review.id });
    // Review DELETE와 FK 연관 삭제는 실제 실행한 뒤 Watchlist remove만 실패시킨다.
    const failure = jest
      .spyOn(EntityManager.prototype, 'remove')
      .mockRejectedValueOnce(new Error('고정 감상기록 삭제 실패'));
    try {
      await api()
        .delete(`/api/watchlist/${item.id}`)
        .auth(sign(owner), { type: 'bearer' })
        .expect(500);
      expect(failure).toHaveBeenCalledTimes(1);
      expect(failure.mock.calls[0][0]).toBe(Watchlist);
      expect(await db.getRepository(Watchlist).countBy({ id: item.id })).toBe(
        1,
      );
      expect(await db.getRepository(Review).countBy({ id: review.id })).toBe(1);
      expect(
        await db.getRepository(ReviewLike).countBy({ reviewId: review.id }),
      ).toBe(1);
      expect(
        await db.getRepository(ReviewComment).countBy({ reviewId: review.id }),
      ).toBe(1);
      expect(harness.fetchCalls).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });

  it('감상기록 목록·연도 조회는 본인 리뷰와 실제 댓글수만 연결해야 한다', async () => {
    const item = await fixtures.watchlist({
      userId: owner.id,
      contentId: content.id,
      status: 'watched',
      watchedAt: '2026-02-03',
    });
    const mine = await fixtures.review({
      userId: owner.id,
      contentId: content.id,
      rating: 9,
      comment: '본인 리뷰',
    });
    const theirs = await fixtures.review({
      userId: other.id,
      contentId: content.id,
      rating: 2,
      comment: '타인 리뷰',
    });
    await fixtures.reviewComment({ userId: owner.id, reviewId: mine.id });
    await fixtures.reviewComment({ userId: other.id, reviewId: mine.id });
    await fixtures.reviewComment({ userId: other.id, reviewId: theirs.id });
    const list = await api()
      .get('/api/watchlist/me?status=watched')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    const year = await api()
      .get('/api/watchlist/me/watched?year=2026')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    for (const value of [list.body.items[0], year.body.months[0].items[0]]) {
      expect(value).toMatchObject({
        id: item.id,
        content: { id: content.id, tmdbId: 101 },
        review: {
          id: mine.id,
          userId: owner.id,
          contentId: content.id,
          rating: 9,
          comment: '본인 리뷰',
          commentsCount: 2,
        },
      });
    }
  });

  it('감상 연도는 KST 날짜 fallback을 사용하고 월·생성순·offset을 구분해야 한다', async () => {
    const january = await fixtures.watchlist({
      userId: owner.id,
      contentId: content.id,
      status: 'watched',
      watchedAt: null,
      updatedAt: new Date('2025-12-31T16:30:00Z'),
    });
    const decemberContent = await fixtures.content();
    await fixtures.watchlist({
      userId: owner.id,
      contentId: decemberContent.id,
      status: 'watched',
      watchedAt: '2025-12-31',
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const februaryContent = await fixtures.content();
    const february = await fixtures.watchlist({
      userId: owner.id,
      contentId: februaryContent.id,
      status: 'watched',
      watchedAt: '2026-02-01',
    });
    await api()
      .get('/api/watchlist/me/watched-years')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200, { years: [2026, 2025] });
    const year = await api()
      .get('/api/watchlist/me/watched?year=2026')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(year.body).toMatchObject({ totalCount: 2, year: 2026 });
    expect(
      year.body.months.map(
        (month: { month: number; count: number; items: { id: number }[] }) => ({
          month: month.month,
          count: month.count,
          ids: month.items.map((item) => item.id),
        }),
      ),
    ).toEqual([
      { month: 2, count: 1, ids: [february.id] },
      { month: 1, count: 1, ids: [january.id] },
    ]);
    const wants: number[] = [];
    for (let index = 0; index < 2; index++) {
      const itemContent = await fixtures.content();
      const item = await fixtures.watchlist({
        userId: owner.id,
        contentId: itemContent.id,
        status: 'want_to_watch',
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      });
      wants.push(item.id);
    }
    const page = await api()
      .get('/api/watchlist/me/want-to-watch?limit=1&offset=1')
      .auth(sign(owner), { type: 'bearer' })
      .expect(200);
    expect(page.body).toMatchObject({ total: 2, hasMore: false });
    expect(page.body.items.map((item: { id: number }) => item.id)).toEqual([
      wants[0],
    ]);
  });

  it.each([
    ['post', '/api/reviews'],
    ['patch', '/api/reviews/1'],
    ['delete', '/api/reviews/1'],
    ['get', '/api/reviews/my?contentId=1'],
    ['get', '/api/reviews/liked-ids'],
    ['post', '/api/reviews/1/like'],
    ['post', '/api/reviews/1/comments'],
    ['delete', '/api/reviews/comments/1'],
    ['post', '/api/watchlist'],
    ['patch', '/api/watchlist/1'],
    ['delete', '/api/watchlist/1'],
    ['get', '/api/watchlist/me'],
    ['get', '/api/watchlist/me/want-to-watch'],
    ['get', '/api/watchlist/me/watched-years'],
    ['get', '/api/watchlist/me/watched'],
    ['get', '/api/watchlist/me/counts'],
    ['get', '/api/watchlist/me/status'],
  ] as const)(
    '미인증 %s %s 요청은 저장·외부 호출 전에 거부해야 한다',
    async (method, url) => {
      await api()[method](url).expect(401);
      expect(await db.getRepository(Review).count()).toBe(0);
      expect(await db.getRepository(Watchlist).count()).toBe(0);
      expect(harness.fetchCalls).toEqual([]);
    },
  );
});
