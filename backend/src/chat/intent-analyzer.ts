import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

// OTT명 정규식: 한/영 변형 포함
const OTT_PATTERN = /(?:넷플릭스|넷플|netflix|티빙|tving|웨이브|wavve|왓챠|watcha|디즈니플러스|디즈니\+|disney\s*plus|disney\+|쿠팡플레이|쿠팡|coupang\s*play)/gi;

// 국가명 매핑 (한국어 → ISO)
const COUNTRY_NAMES: Record<string, string> = {
  '한국': 'KR', '미국': 'US', '일본': 'JP', '영국': 'GB',
  '프랑스': 'FR', '독일': 'DE', '중국': 'CN', '대만': 'TW',
  '홍콩': 'HK', '인도': 'IN', '스페인': 'ES', '이탈리아': 'IT',
  '캐나다': 'CA', '호주': 'AU', '태국': 'TH',
};

// 연도/시기 표현 정규식
const DATE_PATTERN = /(?:최신|요즘|올해|작년|재작년|신작|근작|\d{4}년?(?:\s*대)?|\d{2}년대)/g;

// 요청 표현 정규식
const REQUEST_PATTERN = /(?:추천해\s*(?:줘|주세요|줄래|줄\s*수\s*있어)?|알려\s*(?:줘|주세요)|보여\s*(?:줘|주세요)|찾아\s*(?:줘|주세요)|있을까|있나요|있어\?|뭐\s*있어|어때|볼\s*만한|볼만한|볼\s*수\s*있는|에서\s*볼)/g;

@Injectable()
export class IntentAnalyzerService {
  private readonly logger = new Logger(IntentAnalyzerService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey
      ? new OpenAI({ apiKey })
      : null;
  }

  async analyzeIntent(userMessage: string): Promise<ParsedIntent> {
    if (!this.openai) {
      return { ...EMPTY_INTENT };
    }

    try {
      const response = await this.openai.chat.completions.create({
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
      this.logger.warn(
        `의도 분석 실패, 빈 ParsedIntent 반환: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ...EMPTY_INTENT };
    }
  }

  buildSemanticQuery(originalQuery: string, intent: ParsedIntent): string {
    let cleaned = originalQuery;

    // OTT명 제거
    cleaned = cleaned.replace(OTT_PATTERN, '');

    // 인물명 제거 (intent에서 추출된 이름)
    for (const name of intent.personNames) {
      cleaned = cleaned.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    }

    // 국가 관련 표현 제거 (intent.countries에 값이 있을 때만)
    if (intent.countries.length > 0) {
      // 한국어 국가명 제거
      for (const [korName, isoCode] of Object.entries(COUNTRY_NAMES)) {
        if (intent.countries.includes(isoCode)) {
          cleaned = cleaned.replace(new RegExp(korName, 'g'), '');
        }
      }
      // 영문 ISO 코드 제거
      for (const code of intent.countries) {
        cleaned = cleaned.replace(new RegExp(`\\b${code}\\b`, 'gi'), '');
      }
    }

    // 연도/시기 표현 제거
    cleaned = cleaned.replace(DATE_PATTERN, '');

    // 요청 표현 제거
    cleaned = cleaned.replace(REQUEST_PATTERN, '');

    // 조사/접속사 정리 ("에서", "의", "나", "이랑" 등 — 앞뒤 공백 있을 때만)
    cleaned = cleaned.replace(/\s+(?:에서|에|의|나|이랑|하고|랑|으로|로|을|를|이|가|은|는|도|만)\s+/g, ' ');

    // 다중 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 정제 결과가 빈 문자열이면 원본 반환
    return cleaned || originalQuery;
  }
}
