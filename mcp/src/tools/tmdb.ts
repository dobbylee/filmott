import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmdbFetch } from '../utils/http.js';

export function registerTmdbTools(server: McpServer): void {
  server.tool(
    'get_now_playing',
    '현재 상영 중인 영화 목록을 조회합니다.',
    {
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
      page: z.number().int().positive().optional().default(1).describe('페이지 번호 (기본: 1)'),
      region: z.string().optional().default('KR').describe('지역 코드 (기본: KR)'),
    },
    async ({ language, page, region }) => {
      const data = await tmdbFetch('/movie/now_playing', { language, page, region });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'get_popular_movies',
    '인기 영화 목록을 조회합니다.',
    {
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
      page: z.number().int().positive().optional().default(1).describe('페이지 번호 (기본: 1)'),
      region: z.string().optional().default('KR').describe('지역 코드 (기본: KR)'),
    },
    async ({ language, page, region }) => {
      const data = await tmdbFetch('/movie/popular', { language, page, region });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'get_upcoming_movies',
    '개봉 예정 영화 목록을 조회합니다.',
    {
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
      page: z.number().int().positive().optional().default(1).describe('페이지 번호 (기본: 1)'),
      region: z.string().optional().default('KR').describe('지역 코드 (기본: KR)'),
    },
    async ({ language, page, region }) => {
      const data = await tmdbFetch('/movie/upcoming', { language, page, region });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'search_movie',
    '영화를 검색합니다.',
    {
      query: z.string().describe('검색어 (필수)'),
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
      page: z.number().int().positive().optional().default(1).describe('페이지 번호 (기본: 1)'),
      year: z.number().int().optional().describe('개봉 연도 필터'),
    },
    async ({ query, language, page, year }) => {
      const data = await tmdbFetch('/search/movie', { query, language, page, year });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'get_movie_details',
    '영화 상세 정보를 조회합니다.',
    {
      movie_id: z.number().int().describe('TMDB 영화 ID (필수)'),
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
      append_to_response: z
        .string()
        .optional()
        .describe('추가 응답 데이터 (예: videos,images)'),
    },
    async ({ movie_id, language, append_to_response }) => {
      const data = await tmdbFetch(`/movie/${movie_id}`, { language, append_to_response });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'get_movie_credits',
    '영화의 출연진 및 제작진 정보를 조회합니다.',
    {
      movie_id: z.number().int().describe('TMDB 영화 ID (필수)'),
      language: z.string().optional().default('ko-KR').describe('언어 코드 (기본: ko-KR)'),
    },
    async ({ movie_id, language }) => {
      const data = await tmdbFetch(`/movie/${movie_id}/credits`, { language });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'get_movie_watch_providers',
    '영화의 한국 OTT/스트리밍 서비스 제공 정보를 조회합니다.',
    {
      movie_id: z.number().int().describe('TMDB 영화 ID (필수)'),
    },
    async ({ movie_id }) => {
      const data = await tmdbFetch<{ results: Record<string, unknown> }>(
        `/movie/${movie_id}/watch/providers`,
      );
      const krProviders = data.results?.KR ?? null;
      return {
        content: [{ type: 'text', text: JSON.stringify(krProviders, null, 2) }],
      };
    },
  );
}
