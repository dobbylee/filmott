import { expect, test } from '@playwright/test';

test('상세의 AI 추천 CTA는 기존 대화 없이 질문만 채우고 자동 전송하지 않아야 한다', async ({
  page,
}) => {
  let chatRequestCount = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/chat/messages') {
      chatRequestCount += 1;
    }
  });

  await page.goto('/contents/movie/496243');
  await page
    .getByRole('link', { name: /내 취향에 맞는 비슷한 작품 추천받기/ })
    .click();

  const input = page.getByPlaceholder('메시지를 입력하세요.');
  await expect(input).toHaveValue(
    'Fixture 영화 같은 느낌의 작품 추천해줘',
  );
  await expect(page).toHaveURL(/\/#chat-section$/);
  expect(chatRequestCount).toBe(0);
});
