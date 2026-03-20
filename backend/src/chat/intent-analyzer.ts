import { Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface ParsedIntent {
  ottProviderNames: string[];
  countries: string[];
  personNames: string[];
  dateRange: { from: string | null; to: string | null } | null;
  contentType: 'movie' | 'tv' | null;
}

const EMPTY_INTENT: ParsedIntent = {
  ottProviderNames: [],
  countries: [],
  personNames: [],
  dateRange: null,
  contentType: null,
};

const INTENT_SYSTEM_PROMPT = `사용자 메시지에서 영화/시리즈 추천에 필요한 조건을 JSON으로 추출하세요.
- ottProviderNames: OTT 플랫폼 (Netflix, Tving, wavve, Watcha, Disney Plus, Coupang Play). 없으면 빈 배열.
- countries: 제작 국가 ISO 코드 (KR, US, JP, GB 등). 없으면 빈 배열.
- personNames: 감독/배우 이름. "기생충 감독" → "봉준호"처럼 작품으로 유추 가능하면 실제 이름으로. 없으면 빈 배열.
- dateRange: 연도/연대 조건. "최신" → {"from":"2024-01-01","to":null}, "90년대" → {"from":"1990-01-01","to":"1999-12-31"}. 없으면 null.
- contentType: "movie" 또는 "tv". 명시되지 않으면 null.

JSON만 출력하세요.`;

interface RawIntentResponse {
  ottProviderNames?: unknown;
  countries?: unknown;
  personNames?: unknown;
  dateRange?: unknown;
  contentType?: unknown;
}

interface RawDateRange {
  from?: unknown;
  to?: unknown;
}

const logger = new Logger('IntentAnalyzer');

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseIntentResponse(raw: RawIntentResponse): ParsedIntent {
  const ottProviderNames = isStringArray(raw.ottProviderNames)
    ? raw.ottProviderNames
    : [];

  const countries = isStringArray(raw.countries)
    ? raw.countries
    : [];

  const personNames = isStringArray(raw.personNames)
    ? raw.personNames
    : [];

  let dateRange: ParsedIntent['dateRange'] = null;
  if (raw.dateRange && typeof raw.dateRange === 'object') {
    const dr = raw.dateRange as RawDateRange;
    dateRange = {
      from: typeof dr.from === 'string' ? dr.from : null,
      to: typeof dr.to === 'string' ? dr.to : null,
    };
    if (dateRange.from === null && dateRange.to === null) {
      dateRange = null;
    }
  }

  let contentType: ParsedIntent['contentType'] = null;
  if (raw.contentType === 'movie' || raw.contentType === 'tv') {
    contentType = raw.contentType;
  }

  return { ottProviderNames, countries, personNames, dateRange, contentType };
}

export async function analyzeIntent(
  userMessage: string,
  openai: OpenAI,
): Promise<ParsedIntent> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      return { ...EMPTY_INTENT };
    }

    const parsed: RawIntentResponse = JSON.parse(text);
    return parseIntentResponse(parsed);
  } catch (error) {
    logger.warn(
      `의도 분석 실패, 빈 ParsedIntent 반환: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ...EMPTY_INTENT };
  }
}
