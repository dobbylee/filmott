import type { SimilarContent } from '../embedding/embedding.service';
import {
  CHAT_RESPONSE_FORMAT,
  extractPreviouslyRecommendedTitles,
  parseStructuredChatResponse,
  resolveStructuredChatResponse,
  sanitizeRecommendationReason,
} from './structured-chat-response';

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

describe('구조화 채팅 응답', () => {
  it('스트리밍 검증 순서대로 추천을 먼저 생성하는 schema여야 한다', () => {
    const schemaText = JSON.stringify(CHAT_RESPONSE_FORMAT.json_schema.schema);

    expect(schemaText.indexOf('"recommendations"')).toBeLessThan(
      schemaText.indexOf('"message"'),
    );
    expect(schemaText.indexOf('"message"')).toBeLessThan(
      schemaText.indexOf('"followUpQuestion"'),
    );
  });

  it('strict 응답을 unknown에서 검증해 파싱해야 한다', () => {
    expect(
      parseStructuredChatResponse(
        JSON.stringify({
          message: '',
          recommendations: [
            { tmdbId: 496243, contentType: 'movie', reason: '강렬해요.' },
          ],
          followUpQuestion: '다른 분위기도 원하세요?',
        }),
      ),
    ).toEqual({
      message: '',
      recommendations: [
        { tmdbId: 496243, contentType: 'movie', reason: '강렬해요.' },
      ],
      followUpQuestion: '다른 분위기도 원하세요?',
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ message: '', recommendations: [] }),
    JSON.stringify({
      message: '',
      recommendations: [],
      followUpQuestion: '',
      unknown: true,
    }),
    JSON.stringify({
      message: '',
      recommendations: [
        { tmdbId: '496243', contentType: 'movie', reason: '좋아요.' },
      ],
      followUpQuestion: '',
    }),
  ])('잘못된 JSON 계약은 거부해야 한다', (text) => {
    expect(() => parseStructuredChatResponse(text)).toThrow(
      'AI 응답 형식이 올바르지 않습니다',
    );
  });

  it('서버 후보의 canonical 제목과 빈 줄로 최종 본문을 만들어야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '',
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            reason: '첫 번째 이유예요. (wavve 가능) (액션+모험 톤)',
          },
          {
            tmdbId: 27205,
            contentType: 'movie',
            reason: '두 번째 이유예요.',
          },
        ],
        followUpQuestion: '어느 쪽이 더 끌리세요?',
      }),
    );

    expect(resolveStructuredChatResponse(response, candidates)).toEqual({
      text: '**기생충** - 첫 번째 이유예요.\n\n**인셉션** - 두 번째 이유예요.\n\n어느 쪽이 더 끌리세요?',
      recommendations: [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          posterUrl: '/parasite.jpg',
        },
        {
          tmdbId: 27205,
          contentType: 'movie',
          title: '인셉션',
          posterUrl: '/inception.jpg',
        },
      ],
    });
  });

  it('사용자 샘플처럼 제목 없는 이유를 받아도 서버 제목으로 출력해야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '',
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            reason:
              '사막을 가르는 추격전과 폭발적인 액션이 시원하게 터져요. (wavve 가능) (액션+모험+SF 톤/질주 액션)',
          },
        ],
        followUpQuestion: '',
      }),
    );

    expect(resolveStructuredChatResponse(response, candidates).text).toBe(
      '**기생충** - 사막을 가르는 추격전과 폭발적인 액션이 시원하게 터져요.',
    );
  });

  it('서버 후보에 없는 ID가 하나라도 있으면 전체 응답을 거부해야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '',
        recommendations: [
          { tmdbId: 999999, contentType: 'movie', reason: '좋아요.' },
        ],
        followUpQuestion: '',
      }),
    );

    expect(() => resolveStructuredChatResponse(response, candidates)).toThrow(
      'AI 응답 형식이 올바르지 않습니다',
    );
  });

  it('빈 추천은 일반 message와 후속 질문으로 응답할 수 있어야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '조건에 맞는 후보가 부족해요.',
        recommendations: [],
        followUpQuestion: '선호하는 분위기를 더 알려주시겠어요?',
      }),
    );

    expect(resolveStructuredChatResponse(response, candidates)).toEqual({
      text: '조건에 맞는 후보가 부족해요.\n\n선호하는 분위기를 더 알려주시겠어요?',
      recommendations: [],
    });
  });

  it('추천이 있으면 자유 형식 message를 노출하지 않아야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '**서버 후보 밖 작품** - 노출되면 안 돼요.',
        recommendations: [
          { tmdbId: 496243, contentType: 'movie', reason: '강렬해요.' },
        ],
        followUpQuestion: '다른 분위기도 원하세요?',
      }),
    );

    expect(resolveStructuredChatResponse(response, candidates).text).toBe(
      '**기생충** - 강렬해요.\n\n다른 분위기도 원하세요?',
    );
  });

  it('명시적 추천 요청에 확정 후보가 있으면 빈 추천을 거부해야 한다', () => {
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '추천을 준비했어요.',
        recommendations: [],
        followUpQuestion: '',
      }),
    );

    expect(() =>
      resolveStructuredChatResponse(response, candidates, {
        requireRecommendations: true,
      }),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('최종 본문이 history 제한을 넘으면 거부해야 한다', () => {
    const longCandidates = Array.from({ length: 5 }, (_, index) => ({
      ...candidates[0],
      contentId: index + 1,
      tmdbId: index + 1,
      title: `긴 제목 ${'가'.repeat(80)} ${index}`,
    }));
    const response = parseStructuredChatResponse(
      JSON.stringify({
        message: '',
        recommendations: longCandidates.map((candidate) => ({
          tmdbId: candidate.tmdbId,
          contentType: 'movie',
          reason: '나'.repeat(300),
        })),
        followUpQuestion: '다'.repeat(300),
      }),
    );

    expect(() =>
      resolveStructuredChatResponse(response, longCandidates),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('내용이 전부 빈 응답은 empty-empty 성공으로 처리하지 않아야 한다', () => {
    expect(() =>
      parseStructuredChatResponse(
        JSON.stringify({
          message: '',
          recommendations: [],
          followUpQuestion: '',
        }),
      ),
    ).toThrow('AI 응답 형식이 올바르지 않습니다');
  });

  it('추천 이유 끝의 OTT와 톤 메타만 제한적으로 제거해야 한다', () => {
    expect(
      sanitizeRecommendationReason(
        '전투가 시원하고 인물의 선택도 흥미로워요. (OTT 정보 없음) (액션+SF 톤)',
      ),
    ).toBe('전투가 시원하고 인물의 선택도 흥미로워요.');
    expect(sanitizeRecommendationReason('괄호(설명)가 있는 이유예요.')).toBe(
      '괄호(설명)가 있는 이유예요.',
    );
    expect(
      sanitizeRecommendationReason(
        'Scott Adkins의 액션이 인상적이에요. (속편 가능성도 있어요)',
      ),
    ).toBe('Scott Adkins의 액션이 인상적이에요. (속편 가능성도 있어요)');
    expect(
      sanitizeRecommendationReason(
        '속도감 있는 전개가 좋아요. (넷플릭스에서 볼 수 있어요)',
      ),
    ).toBe('속도감 있는 전개가 좋아요.');
    expect(
      sanitizeRecommendationReason(
        '액션 장면이 시원해요. (웨이브에서 시청 가능해요)',
      ),
    ).toBe('액션 장면이 시원해요.');
  });

  it.each([
    {
      name: 'message',
      value: {
        message: '가'.repeat(501),
        recommendations: [],
        followUpQuestion: '',
      },
    },
    {
      name: '추천 이유',
      value: {
        message: '',
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            reason: '가'.repeat(301),
          },
        ],
        followUpQuestion: '',
      },
    },
    {
      name: '후속 질문',
      value: {
        message: '',
        recommendations: [],
        followUpQuestion: ` ${'가'.repeat(300)} `,
      },
    },
  ])('$name 길이가 schema 제한을 넘으면 거부해야 한다', ({ value }) => {
    expect(() => parseStructuredChatResponse(JSON.stringify(value))).toThrow(
      'AI 응답 형식이 올바르지 않습니다',
    );
  });
});

describe('이전 추천 제목 추출', () => {
  it('recommendations 메타데이터를 우선 사용해야 한다', () => {
    expect(
      extractPreviouslyRecommendedTitles([
        {
          role: 'assistant',
          content: '**청춘** 키워드로 골라봤어요.',
          recommendations: [
            { tmdbId: 496243, contentType: 'movie', title: '기생충' },
          ],
        },
      ]),
    ).toEqual(['기생충']);
  });

  it('오래된 history는 기존 Markdown 제목을 fallback으로 추출해야 한다', () => {
    expect(
      extractPreviouslyRecommendedTitles([
        {
          role: 'assistant',
          content: '**기생충 (Parasite)** - 강렬한 영화예요.',
        },
      ]),
    ).toEqual(['기생충']);
  });

  it('공백뿐인 추천 메타데이터 제목은 Markdown 본문으로 fallback해야 한다', () => {
    expect(
      extractPreviouslyRecommendedTitles([
        {
          role: 'assistant',
          content: '**기생충** - 강렬한 영화예요.',
          recommendations: [
            { tmdbId: 496243, contentType: 'movie', title: '   ' },
          ],
        },
      ]),
    ).toEqual(['기생충']);
  });

  it('구형 번호와 불릿 Markdown 추천 제목도 추출해야 한다', () => {
    expect(
      extractPreviouslyRecommendedTitles([
        {
          role: 'assistant',
          content:
            '1. **기생충** - 강렬한 영화예요.\n\n- **인셉션** - 상상력이 돋보여요.',
        },
      ]),
    ).toEqual(['기생충', '인셉션']);
  });
});
