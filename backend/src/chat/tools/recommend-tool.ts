import Anthropic from '@anthropic-ai/sdk';

export const searchTmdbTool: Anthropic.Tool = {
  name: 'search_tmdb',
  description: 'TMDB에서 영화/시리즈를 검색합니다. 추천하기 전에 반드시 이 도구로 먼저 검색하세요. 장르 ID로 검색하면 해당 장르의 인기 작품을 찾을 수 있습니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '검색어 (작품 제목). genre_id를 사용할 때는 빈 문자열로 설정',
      },
      type: {
        type: 'string',
        enum: ['movie', 'tv'],
        description: '콘텐츠 타입',
      },
      genre_id: {
        type: 'number',
        description: '장르 ID로 필터링. 주요 장르: 28(액션), 35(코미디), 18(드라마), 27(공포), 53(스릴러), 10749(로맨스), 878(SF), 16(애니메이션), 80(범죄), 99(다큐), 14(판타지), 36(역사), 10402(음악), 9648(미스터리), 10752(전쟁), 37(서부)',
      },
      year: {
        type: 'number',
        description: '개봉/방영 연도 필터 (선택)',
      },
      page: {
        type: 'number',
        description: '페이지 번호 (기본 1)',
      },
    },
    required: ['type'],
  },
};

export const recommendMoviesTool: Anthropic.Tool = {
  name: 'recommend_movies',
  description: 'search_tmdb 검색 결과에서 사용자에게 추천할 작품을 선택합니다. 반드시 search_tmdb로 검색한 후에 사용하세요. tmdbId는 검색 결과에서 가져온 정확한 ID를 사용하세요.',
  input_schema: {
    type: 'object' as const,
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tmdbId: { type: 'number', description: '검색 결과에서 가져온 정확한 TMDB ID' },
            contentType: { type: 'string', enum: ['movie', 'tv'], description: '콘텐츠 타입' },
            title: { type: 'string', description: '검색 결과의 정확한 제목' },
            reason: { type: 'string', description: '사용자 취향을 반영한 추천 이유 (1~2문장)' },
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
