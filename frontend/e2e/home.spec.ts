import { expect, test } from '@playwright/test';

test('메인 페이지가 채팅과 최근 리뷰 섹션을 표시해야 한다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '오늘 뭐 볼까?' })).toBeVisible();
  await expect(page.getByPlaceholder('메시지를 입력하세요.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '최근 리뷰' })).toBeVisible();
});
