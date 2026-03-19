import Anthropic from '@anthropic-ai/sdk';

export const recommendMoviesTool: Anthropic.Tool = {
  name: 'recommend_movies',
  description: '사용자에게 추천할 영화/시리즈 목록을 반환합니다. 추천할 때 반드시 이 도구를 사용하세요.',
  input_schema: {
    type: 'object' as const,
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tmdbId: { type: 'number', description: 'TMDB ID' },
            contentType: { type: 'string', enum: ['movie', 'tv'], description: '콘텐츠 타입' },
            title: { type: 'string', description: '작품 제목 (한국어)' },
            reason: { type: 'string', description: '이 작품을 추천하는 이유 (1~2문장)' },
          },
          required: ['tmdbId', 'contentType', 'title', 'reason'],
        },
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ['recommendations'],
  },
};
