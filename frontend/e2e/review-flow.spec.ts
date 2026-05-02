import { expect, test } from '@playwright/test';

const reviewContentPath =
  process.env.E2E_REVIEW_CONTENT_PATH ?? '/contents/movie/496243';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      json: {
        id: 1,
        nickname: 'e2e-user',
        email: 'e2e@example.com',
        role: 'user',
        status: 'active',
        subscribedOtts: [],
      },
    });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ json: { user: { id: 1, nickname: 'e2e-user' } } });
  });

  await page.route('**/api/reviews/my**', async (route) => {
    await route.fulfill({ json: null });
  });

  await page.route('**/api/reviews/liked-ids**', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/api/watchlist/me/status**', async (route) => {
    await route.fulfill({
      json: {
        status: 'watched',
        watchlistId: 100,
        watchedAt: '2026-05-01',
      },
    });
  });
});

test('콘텐츠 상세에서 리뷰 작성 요청을 보낼 수 있어야 한다', async ({ page }) => {
  let reviewPayload: unknown = null;

  await page.route('**/api/reviews', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    reviewPayload = route.request().postDataJSON() as unknown;
    await route.fulfill({
      status: 201,
      json: {
        id: 900,
        contentId: 1,
        rating: 8,
        comment: '브라우저 e2e 리뷰',
      },
    });
  });

  await page.goto(reviewContentPath);
  await page.getByRole('button', { name: '리뷰 작성' }).click();
  await expect(page.getByRole('heading', { name: '리뷰 작성' })).toBeVisible();

  await page.getByRole('slider', { name: '별점 선택' }).fill('8');
  await page
    .getByPlaceholder('작품에 대한 한마디를 남겨보세요.')
    .fill('브라우저 e2e 리뷰');
  await page.getByRole('button', { name: '작성' }).click();

  await expect.poll(() => reviewPayload).toEqual({
    contentId: 1,
    rating: 8,
    comment: '브라우저 e2e 리뷰',
    watchedAt: '2026-05-01',
  });
});
