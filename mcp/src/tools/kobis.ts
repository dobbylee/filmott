import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { kobisFetch } from '../utils/http.js';

export function registerKobisTools(server: McpServer): void {
  server.tool(
    'get_daily_box_office',
    '일별 박스오피스 순위를 조회합니다.',
    {
      targetDt: z
        .string()
        .regex(/^\d{8}$/, 'YYYYMMDD 형식이어야 합니다.')
        .describe('조회 기준일 (YYYYMMDD, 필수)'),
      repNationCd: z
        .enum(['K', 'F'])
        .optional()
        .describe('대표국적 코드 (K: 한국, F: 외국)'),
      itemPerPage: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe('결과 건수 (기본: 10)'),
    },
    async ({ targetDt, repNationCd, itemPerPage }) => {
      const data = await kobisFetch<{
        boxOfficeResult: { dailyBoxOfficeList: unknown[] };
      }>('/boxoffice/searchDailyBoxOfficeList.json', {
        targetDt,
        repNationCd,
        itemPerPage,
      });
      const list = data.boxOfficeResult?.dailyBoxOfficeList ?? [];
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    },
  );

  server.tool(
    'get_weekly_box_office',
    '주간/주말/주중 박스오피스 순위를 조회합니다.',
    {
      targetDt: z
        .string()
        .regex(/^\d{8}$/, 'YYYYMMDD 형식이어야 합니다.')
        .describe('조회 기준일 (YYYYMMDD, 필수)'),
      weekGb: z
        .enum(['0', '1', '2'])
        .optional()
        .default('0')
        .describe('주간 구분 (0: 주간, 1: 주말, 2: 주중, 기본: 0)'),
      repNationCd: z
        .enum(['K', 'F'])
        .optional()
        .describe('대표국적 코드 (K: 한국, F: 외국)'),
      itemPerPage: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe('결과 건수 (기본: 10)'),
    },
    async ({ targetDt, weekGb, repNationCd, itemPerPage }) => {
      const data = await kobisFetch<{
        boxOfficeResult: { weeklyBoxOfficeList: unknown[] };
      }>('/boxoffice/searchWeeklyBoxOfficeList.json', {
        targetDt,
        weekGb,
        repNationCd,
        itemPerPage,
      });
      const list = data.boxOfficeResult?.weeklyBoxOfficeList ?? [];
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    },
  );
}
