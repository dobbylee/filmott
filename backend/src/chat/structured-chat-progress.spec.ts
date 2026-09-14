import { getStructuredChatProgress } from './structured-chat-progress';

describe('구조화 JSON 생성 진행 상태', () => {
  it('생성 중 숫자와 문자열은 구분자나 닫는 따옴표 전까지 미완성으로 처리해야 한다', () => {
    const prefix = '{"recommendations":[{"tmdbId":496';
    expect(
      getStructuredChatProgress(prefix).isComplete(
        'recommendations',
        0,
        'tmdbId',
      ),
    ).toBe(false);
    expect(
      getStructuredChatProgress(prefix + '243 \n ').isComplete(
        'recommendations',
        0,
        'tmdbId',
      ),
    ).toBe(false);
    const body = prefix + '243,"contentType":"movie","reason":"생성 중';
    const progress = getStructuredChatProgress(body);
    expect(progress.isComplete('recommendations', 0, 'tmdbId')).toBe(true);
    expect(progress.isComplete('recommendations', 0, 'contentType')).toBe(true);
    expect(progress.isComplete('recommendations', 0, 'reason')).toBe(false);
    expect(progress.isComplete('recommendations', 0)).toBe(false);
    expect(progress.isComplete('recommendations')).toBe(false);
  });

  it('문자열 안의 괄호·escape·필드명은 실제 구조 경계로 오인하지 않아야 한다', () => {
    const reason = '"recommendations": [] } \\ 줄바꿈\n 🎬';
    const prefix =
      '{"followUpQuestion":"질문","recommendations":[' +
      JSON.stringify({ reason, contentType: 'movie', tmdbId: 123 });
    const progress = getStructuredChatProgress(prefix);
    expect(progress.isComplete('followUpQuestion')).toBe(true);
    expect(progress.isComplete('recommendations', 0, 'reason')).toBe(true);
    expect(progress.isComplete('recommendations', 0)).toBe(true);
    expect(progress.isComplete('recommendations')).toBe(false);
    expect(
      getStructuredChatProgress(prefix + ']}').isComplete('recommendations'),
    ).toBe(true);
  });

  it('서로 다른 배열 항목과 빈 배열·escaped key를 정확히 구분해야 한다', () => {
    const progress = getStructuredChatProgress(
      '{"recommendations":[{"tmdb\\u0049d":1},{"tmdbId":2}],"message":"","followUpQuestion":""}',
    );
    expect(progress.isComplete('recommendations', 0, 'tmdbId')).toBe(true);
    expect(progress.isComplete('recommendations', 1, 'tmdbId')).toBe(true);
    expect(progress.isComplete('recommendations', 2)).toBe(false);
    expect(progress.isComplete('message')).toBe(true);
    expect(
      getStructuredChatProgress('{"recommendations":[]}').isComplete(
        'recommendations',
      ),
    ).toBe(true);
    expect(
      getStructuredChatProgress('{"recommendations.0.tmdbId":1}').isComplete(
        'recommendations',
        0,
        'tmdbId',
      ),
    ).toBe(false);
  });
});
