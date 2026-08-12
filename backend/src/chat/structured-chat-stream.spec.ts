import type { SimilarContent } from '../embedding/embedding.service';
import { StructuredChatStreamAccumulator } from './structured-chat-stream';

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

describe('StructuredChatStreamAccumulator', () => {
  it('다음 추천이 시작되면 첫 추천의 canonical 제목만 조기 출력해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '한국 사회를 날카롭게 보여줘요.',
            },
          ],
        },
        candidates,
      ),
    ).toEqual([]);

    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '한국 사회를 날카롭게 보여줘요.',
            },
            {
              tmdbId: 27205,
              contentType: 'movie',
              reason: '꿈과 현실을 오가는',
            },
          ],
        },
        candidates,
      ),
    ).toEqual(['**기생충**']);

    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '한국 사회를 날카롭게 보여줘요.',
            },
            {
              tmdbId: 27205,
              contentType: 'movie',
              reason: '꿈과 현실을 오가는 전개가 인상적이에요. 🎬',
            },
          ],
          message: '',
        },
        candidates,
        true,
      ),
    ).toEqual([]);
  });

  it('추천 배열이 끝나기 전의 마지막 미완성 객체는 노출하지 않아야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '아직 생성 중인 이유',
            },
          ],
        },
        candidates,
      ),
    ).toEqual([]);
    expect(accumulator.getEmittedText()).toBe('');
  });

  it('추천이 없으면 finish_reason 확인 전 모델 생성 텍스트를 노출하지 않아야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(
      accumulator.consume(
        {
          recommendations: [],
          message: '  조건에 맞는 후보',
        },
        candidates,
      ),
    ).toEqual([]);
    expect(
      accumulator.finalize(
        {
          recommendations: [],
          message: '조건에 맞는 후보가 부족해요.',
          followUpQuestion: '선호 장르를 알려주시겠어요?',
        },
        candidates,
      ),
    ).toEqual({
      remainingText:
        '조건에 맞는 후보가 부족해요.\n\n선호 장르를 알려주시겠어요?',
      text: '조건에 맞는 후보가 부족해요.\n\n선호 장르를 알려주시겠어요?',
      recommendations: [],
    });
  });

  it('추천 뒤 모델 생성 reason과 follow-up은 최종 검증 전 노출하지 않아야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '강렬해요.',
            },
          ],
          message: '',
          followUpQuestion: '다른 분위기도',
        },
        candidates,
        true,
      ),
    ).toEqual(['**기생충**']);
    expect(
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '강렬해요.',
            },
          ],
          message: '',
          followUpQuestion: '다른 분위기도 원하세요?',
        },
        candidates,
        true,
      ),
    ).toEqual([]);
  });

  it('후보 밖 추천은 사용자에게 노출하기 전에 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(() =>
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 999999,
              contentType: 'movie',
              reason: '후보 밖 작품이에요.',
            },
          ],
          message: '',
        },
        candidates,
        true,
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
    expect(accumulator.getEmittedText()).toBe('');
  });

  it('이미 출력한 추천 snapshot이 바뀌면 append-only 위반으로 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    accumulator.consume(
      {
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            reason: '처음 확정된 이유예요.',
          },
        ],
        message: '',
      },
      candidates,
      true,
    );

    expect(() =>
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '나중에 바뀐 이유예요.',
            },
          ],
          message: '',
        },
        candidates,
        true,
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('중복 추천은 두 번째 항목을 노출하기 전에 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(() =>
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '첫 번째 이유예요.',
            },
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '중복 이유예요.',
            },
          ],
          message: '',
        },
        candidates,
        true,
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('한번 닫힌 추천 배열의 길이가 바뀌면 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    accumulator.consume(
      { recommendations: [], message: '일반 답변을 생성 중이에요.' },
      candidates,
      true,
    );

    expect(() =>
      accumulator.consume(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '뒤늦게 추가된 추천이에요.',
            },
          ],
          message: '',
        },
        candidates,
        true,
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('추천 최대 개수를 넘긴 partial snapshot은 거부해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(() =>
      accumulator.consume(
        {
          recommendations: Array.from({ length: 6 }, (_, index) => ({
            tmdbId: index + 1,
            contentType: 'movie',
            reason: '추천 이유예요.',
          })),
        },
        candidates,
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('최종 검증 결과에서 이미 출력한 prefix를 제외한 나머지만 반환해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();
    accumulator.consume(
      {
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            reason: '강렬해요.',
          },
        ],
        message: '',
      },
      candidates,
      true,
    );

    expect(
      accumulator.finalize(
        {
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              reason: '강렬해요.',
            },
          ],
          message: '',
          followUpQuestion: '다른 분위기도 원하세요?',
        },
        candidates,
      ),
    ).toEqual({
      remainingText: ' - 강렬해요.\n\n다른 분위기도 원하세요?',
      text: '**기생충** - 강렬해요.\n\n다른 분위기도 원하세요?',
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

  it('추천이 없는 일반 message는 최종 검증에서 그대로 반환해야 한다', () => {
    const accumulator = new StructuredChatStreamAccumulator();

    expect(
      accumulator.finalize(
        {
          recommendations: [],
          message: '조건에 맞는 후보가 부족해요.',
          followUpQuestion: '선호 장르를 알려주시겠어요?',
        },
        candidates,
      ),
    ).toEqual({
      remainingText:
        '조건에 맞는 후보가 부족해요.\n\n선호 장르를 알려주시겠어요?',
      text: '조건에 맞는 후보가 부족해요.\n\n선호 장르를 알려주시겠어요?',
      recommendations: [],
    });
  });
});
