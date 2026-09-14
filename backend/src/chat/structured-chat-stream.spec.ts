import type { SimilarContent } from '../recommendation/recommendation.types';
import { StructuredChatStreamAccumulator } from './structured-chat-stream';
import { getStructuredChatProgress } from './structured-chat-progress';
import { partialParse } from 'openai/_vendor/partial-json-parser/parser';

const candidates: SimilarContent[] = [
  {
    contentId: 1,
    tmdbId: 496243,
    contentType: 'movie',
    title: '기생충',
    posterUrl: '/parasite.jpg',
    genres: [],
    voteAverage: 8.5,
    description: '',
    similarity: 0.9,
    director: null,
    originCountry: 'KR',
    overview: null,
  },
  {
    contentId: 2,
    tmdbId: 27205,
    contentType: 'movie',
    title: '인셉션',
    posterUrl: '/inception.jpg',
    genres: [],
    voteAverage: 8.4,
    description: '',
    similarity: 0.8,
    director: null,
    originCountry: 'US',
    overview: null,
  },
];

const first = {
  tmdbId: 496243,
  contentType: 'movie' as const,
  reason: '강렬해요.',
};
const second = {
  tmdbId: 27205,
  contentType: 'movie' as const,
  reason: '꿈과 현실을 오가요.',
};

function consume(
  accumulator: StructuredChatStreamAccumulator,
  snapshot: unknown,
  raw = JSON.stringify(snapshot),
) {
  return accumulator.consume(
    snapshot,
    candidates,
    getStructuredChatProgress(raw),
  );
}

describe('StructuredChatStreamAccumulator', () => {
  it.each([false, true])(
    '실제 SDK parser의 모든 글자 단위 snapshot에서 공백과 필드 순서를 처리해야 한다 (역순=%s)',
    (reversed) => {
      const recommendation = reversed
        ? {
            reason: '차분해요. 🎬 (OTT 정보 없음)',
            contentType: 'movie',
            tmdbId: 496243,
          }
        : {
            tmdbId: 496243,
            contentType: 'movie',
            reason: '차분해요. 🎬 (OTT 정보 없음)',
          };
      const response = reversed
        ? {
            followUpQuestion: '더 원하세요?',
            message: '',
            recommendations: [recommendation],
          }
        : {
            recommendations: [recommendation],
            message: '',
            followUpQuestion: '더 원하세요?',
          };
      const json = JSON.stringify(response, null, 2);
      const accumulator = new StructuredChatStreamAccumulator();
      for (let index = 1; index <= json.length; index++) {
        const raw = json.slice(0, index);
        const snapshot: unknown = partialParse(raw);
        consume(accumulator, snapshot, raw);
      }
      expect(accumulator.getEmittedText()).toBe(
        '**기생충** - 차분해요. 🎬\n\n더 원하세요?',
      );
    },
  );

  it('추천 이유가 생성되는 동안 제목 이후 본문을 계속 이어서 출력해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        { recommendations: [{ ...first, reason: '강렬' }] },
        '{"recommendations":[{"tmdbId":496243,"contentType":"movie","reason":"강렬',
      ),
    ).toEqual(['**기생충** - 강렬']);
    expect(
      consume(
        accumulator,
        { recommendations: [{ ...first, reason: '강렬해요.' }] },
        '{"recommendations":[{"tmdbId":496243,"contentType":"movie","reason":"강렬해요.',
      ),
    ).toEqual(['해요.']);
    expect(
      consume(accumulator, {
        recommendations: [first, second],
        message: '',
        followUpQuestion: '더 원하세요?',
      }),
    ).toEqual(['\n\n**인셉션** - 꿈과 현실을 오가요.\n\n더 원하세요?']);
  });

  it('reason이 먼저 나와도 숫자 ID가 닫히기 전에는 후보를 선택하거나 출력하지 않아야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        {
          recommendations: [
            { reason: '강렬해요.', contentType: 'movie', tmdbId: 496 },
          ],
        },
        '{"recommendations":[{"reason":"강렬해요.","contentType":"movie","tmdbId":496',
      ),
    ).toEqual([]);
    expect(
      consume(
        accumulator,
        { recommendations: [first] },
        '{"recommendations":[{"reason":"강렬해요.","contentType":"movie","tmdbId":496243}',
      ),
    ).toEqual(['**기생충** - 강렬해요.']);
  });

  it('일반 message와 후속 질문도 생성 중 prefix를 이어서 출력해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        { recommendations: [], message: '  조건에 맞는 후보' },
        '{"recommendations":[],"message":"  조건에 맞는 후보',
      ),
    ).toEqual(['조건에 맞는 후보']);
    expect(
      consume(
        accumulator,
        {
          recommendations: [],
          message: '  조건에 맞는 후보가 부족해요.  ',
          followUpQuestion: '선호 장르를',
        },
        '{"recommendations":[],"message":"  조건에 맞는 후보가 부족해요.  ","followUpQuestion":"선호 장르를',
      ),
    ).toEqual(['가 부족해요.\n\n선호 장르를']);
    expect(
      consume(accumulator, {
        recommendations: [],
        message: '조건에 맞는 후보가 부족해요.',
        followUpQuestion: '선호 장르를 알려주세요?',
      }),
    ).toEqual([' 알려주세요?']);
  });

  it('추천 배열보다 먼저 온 일반 message는 추천 여부가 확정될 때까지 보류해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        { message: '모델 서문', recommendations: [] },
        '{"message":"모델 서문","recommendations":[',
      ),
    ).toEqual([]);
    expect(
      consume(accumulator, {
        message: '모델 서문',
        recommendations: [first],
        followUpQuestion: '',
      }),
    ).toEqual(['**기생충** - 강렬해요.']);
    expect(accumulator.getEmittedText()).not.toContain('모델 서문');
  });

  it('후속 질문이 먼저 생성돼도 추천 본문 다음 순서로 표시해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        {
          followUpQuestion: '더 원하세요?',
          message: '',
          recommendations: [first],
        },
        '{"followUpQuestion":"더 원하세요?","message":"","recommendations":[{"contentType":"movie","reason":"강렬해요.","tmdbId":496243}',
      ),
    ).toEqual(['**기생충** - 강렬해요.']);
    expect(
      consume(accumulator, {
        followUpQuestion: '더 원하세요?',
        message: '',
        recommendations: [first],
      }),
    ).toEqual(['\n\n더 원하세요?']);
  });

  it('정규화로 제거될 수 있는 괄호 suffix는 스트리밍 중 노출하지 않아야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    const reason = '강렬해요.  (넷플릭스 시청 가능)';
    expect(
      consume(
        accumulator,
        { recommendations: [{ ...first, reason }] },
        '{"recommendations":[{"tmdbId":496243,"contentType":"movie","reason":"강렬해요.  (넷플릭스 시청 가능)',
      ),
    ).toEqual(['**기생충** - 강렬해요.']);
    expect(
      consume(accumulator, {
        recommendations: [{ ...first, reason }],
        message: '',
        followUpQuestion: '',
      }),
    ).toEqual([]);
    expect(
      accumulator.finalize(
        {
          recommendations: [{ ...first, reason }],
          message: '',
          followUpQuestion: '',
        },
        candidates,
      ).remainingText,
    ).toBe('');
  });

  it('제거 대상이 아닌 괄호와 이모지는 완성 후 유실 없이 출력해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    const reason = '강렬해요. (가족 이야기) 🎬';
    expect(
      consume(
        accumulator,
        { recommendations: [{ ...first, reason }] },
        '{"recommendations":[{"tmdbId":496243,"contentType":"movie","reason":"강렬해요. (가족 이야기) 🎬',
      ),
    ).toEqual(['**기생충** - 강렬해요.']);
    expect(
      consume(accumulator, {
        recommendations: [{ ...first, reason }],
        message: '',
        followUpQuestion: '',
      }),
    ).toEqual([' (가족 이야기) 🎬']);
  });

  it('이모지의 상위 surrogate만 들어오면 다음 chunk까지 보류해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(
      consume(
        accumulator,
        { recommendations: [], message: '안녕 \ud83c' },
        '{"recommendations":[],"message":"안녕 \\ud83c',
      ),
    ).toEqual(['안녕']);
    expect(
      consume(accumulator, {
        recommendations: [],
        message: '안녕 🎬',
        followUpQuestion: '',
      }),
    ).toEqual([' 🎬']);
  });

  it('후보 밖 추천은 사용자에게 노출하기 전에 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    expect(() =>
      consume(accumulator, { recommendations: [{ ...first, tmdbId: 999999 }] }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
    expect(accumulator.getEmittedText()).toBe('');
  });

  it('확정된 추천 snapshot이 바뀌면 append-only 위반으로 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    consume(accumulator, { recommendations: [first] });
    expect(() =>
      consume(accumulator, {
        recommendations: [{ ...first, reason: '바뀐 이유' }],
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('생성 중 이미 출력한 일반 본문 prefix가 바뀌면 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    consume(
      accumulator,
      { recommendations: [], message: '처음' },
      '{"recommendations":[],"message":"처음',
    );
    expect(() =>
      consume(
        accumulator,
        { recommendations: [], message: '다른' },
        '{"recommendations":[],"message":"다른',
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('중복 추천은 두 번째 항목을 노출하기 전에 거부해야 한다', () => {
    expect(() =>
      consume(new StructuredChatStreamAccumulator(), {
        recommendations: [first, first],
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('한번 닫힌 추천 배열의 길이가 바뀌면 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    consume(accumulator, { recommendations: [], message: '일반 답변' });
    expect(() => consume(accumulator, { recommendations: [first] })).toThrow(
      'AI 응답 형식이 올바르지 않습니다',
    );
  });

  it('추천 최대 개수와 본문 길이 제한을 유지해야 한다', () => {
    expect(() =>
      consume(new StructuredChatStreamAccumulator(), {
        recommendations: Array.from({ length: 6 }, () => first),
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
    expect(() =>
      consume(new StructuredChatStreamAccumulator(), {
        recommendations: [{ ...first, reason: '가'.repeat(301) }],
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
    expect(() =>
      consume(new StructuredChatStreamAccumulator(), {
        recommendations: [],
        message: '가'.repeat(501),
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('최종 검증 결과에서 이미 출력한 prefix를 제외한 나머지만 반환해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    consume(accumulator, { recommendations: [first] });
    expect(
      accumulator.finalize(
        {
          recommendations: [first],
          message: '',
          followUpQuestion: '더 원하세요?',
        },
        candidates,
      ),
    ).toEqual({
      remainingText: '\n\n더 원하세요?',
      text: '**기생충** - 강렬해요.\n\n더 원하세요?',
      recommendations: [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          posterUrl: '/parasite.jpg',
        },
      ],
    });
  });

  it('partial 이벤트가 없는 일반 message도 최종 검증에서 그대로 반환해야 한다', () => {
    expect(
      new StructuredChatStreamAccumulator().finalize(
        { recommendations: [], message: '일반 답변', followUpQuestion: '' },
        candidates,
      ),
    ).toEqual({
      remainingText: '일반 답변',
      text: '일반 답변',
      recommendations: [],
    });
  });
});
