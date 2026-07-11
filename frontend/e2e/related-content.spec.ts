import { expect, test } from '@playwright/test';

test('상세의 연관 작품 링크가 모바일에서 가로로 스크롤되고 대상 상세로 이동해야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contents/movie/496243');

  const section = page.getByRole('region', {
    name: '연관 작품',
  });
  await expect(section).toBeVisible();
  await expect(
    section.getByText('장르와 작품 정보를 바탕으로 골랐어요'),
  ).toBeVisible();

  const scroller = section.getByTestId('related-contents-scroll');
  const dimensions = await scroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });

  const relatedLink = section.getByRole('link', {
    name: /Fixture 관련 영화/,
  }).first();
  await expect(relatedLink).toBeVisible();
  await expect(relatedLink).toHaveAttribute('href', '/contents/movie/27205');

  await relatedLink.click();

  await expect(
    page.getByRole('heading', { name: 'Fixture 관련 영화' }),
  ).toBeVisible();
});
