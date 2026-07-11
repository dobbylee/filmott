import { expect, test } from '@playwright/test';

test('상세의 관련 작품 링크가 모바일에서도 노출되고 대상 상세로 이동해야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contents/movie/496243');

  const section = page.getByRole('region', {
    name: '이 작품과 비슷한 작품',
  });
  await expect(section).toBeVisible();
  const relatedLink = section.getByRole('link', {
    name: /Fixture 관련 영화/,
  });
  await expect(relatedLink).toBeVisible();
  await expect(relatedLink).toHaveAttribute('href', '/contents/movie/27205');

  await relatedLink.click();

  await expect(
    page.getByRole('heading', { name: 'Fixture 관련 영화' }),
  ).toBeVisible();
});
