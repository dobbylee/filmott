import { expect, test } from '@playwright/test';

test('상세의 기록 행동은 모바일에서 직접 노출되고 선택한 로그인 이유를 보여줘야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
  });
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
  });
  await page.goto('/contents/movie/496243');

  const actions = page.locator('[aria-label="작품 기록"] button');
  await expect(actions).toHaveCount(2);
  await expect(actions).toHaveText([
    '봤어요 · 별점 남기기',
    '보고 싶어요',
  ]);

  await actions.nth(0).click();
  await expect(
    page.getByText('이 작품을 기록하고 별점을 남기려면 로그인하세요.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '닫기' }).click();

  await actions.nth(1).click();
  await expect(
    page.getByText('이 작품을 보고 싶은 작품으로 저장하려면 로그인하세요.'),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
