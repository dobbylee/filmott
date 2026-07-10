import { expect, test } from '@playwright/test';

const reviewContentPath = '/contents/movie/496243';

test('콘텐츠 상세에서 리뷰 작성 요청을 보낼 수 있어야 한다', async ({
  page,
}) => {
  await page.goto(reviewContentPath);
  await expect(
    page.getByRole('heading', { name: 'Fixture 영화' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '리뷰 작성' }).click();
  await expect(page.getByRole('heading', { name: '리뷰 작성' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-05-01');

  await page.getByRole('slider', { name: '별점 선택' }).fill('8');
  await page
    .getByPlaceholder('작품에 대한 한마디를 남겨보세요.')
    .fill('브라우저 e2e 리뷰');
  const reviewRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/reviews',
  );
  await page.getByRole('button', { name: '작성', exact: true }).click();
  const reviewRequest = await reviewRequestPromise;

  expect(reviewRequest.postDataJSON()).toEqual({
    contentId: 1,
    rating: 8,
    comment: '브라우저 e2e 리뷰',
    watchedAt: '2026-05-01',
  });
});
