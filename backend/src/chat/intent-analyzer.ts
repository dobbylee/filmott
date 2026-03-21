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
- dateRange: 연도/연대/시기 조건. "최신"/"요즘"/"최근" → {"from":"2024-01-01","to":null}, "90년대" → {"from":"1990-01-01","to":"1999-12-31"}, "올해" → {"from":"2026-01-01","to":null}. 없으면 null.
- contentType: "영화"/"무비" → "movie", "드라마"/"시리즈"/"TV"/"예능" → "tv". 이 단어가 메시지에 직접 포함된 경우에만 설정. 장르명(스릴러, 코미디, 로맨스, 액션, 호러, 공포, SF, 판타지, 애니메이션 등)으로는 절대 contentType을 추론하지 마세요. 확실하지 않으면 null.

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
const DATE_PATTERN = /(?:최신|요즘|올해|작년|재작년|신작|근작|최근|\d{4}년?(?:\s*대)?|\d{2}년대)/g;

// 요청 표현 정규식 (독립적인 요청 표현만. "볼 만한", "볼 수 있는" 등 문맥 의존 표현 제외)
const REQUEST_PATTERN = /(?:추천해\s*(?:줘|주세요|줄래|줄\s*수\s*있어)?|추천|알려\s*(?:줘|주세요)|보여\s*(?:줘|주세요)|찾아\s*(?:줘|주세요)|있을까\??|있나요\??|뭐\s*있어\??|어때\??)/g;

// 인물 제거 후 남는 고립 수식어 정규식
const ORPHAN_PERSON_MODIFIER = /(?:감독(?:의)?|배우|나오는|주연의?|출연(?:하는|한)?)\s*/g;

// 메타데이터 제거 후 남는 고립 잔여 표현 정규식 ("볼만한거" 등은 의미적 표현이므로 제외)
// 문두: "이후 ..." / 문중: "... 중에 ..." / 문미: "... 이전"
const ORPHAN_RESIDUAL_START = /^(?:중에|이후|이전)\s+/;
const ORPHAN_RESIDUAL_MID = /\s+(?:중에|이후|이전)\s+/g;
const ORPHAN_RESIDUAL_END = /\s+(?:중에|이후|이전)$/;

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
      const intent = parseIntentResponse(parsed);

      // contentType 후처리: 메시지에 명시적 타입 키워드가 없으면 null로 강제
      if (intent.contentType) {
        const hasMovieKeyword = /영화|무비/i.test(userMessage);
        const hasTvKeyword = /드라마|시리즈|TV|예능/i.test(userMessage);
        if (!hasMovieKeyword && !hasTvKeyword) {
          intent.contentType = null;
        }
      }

      return intent;
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

    // OTT/국가 제거 후 남은 잔여 구문 정리 ("에서 볼 수 있는" 등)
    cleaned = cleaned.replace(/에서\s*볼\s*수\s*있는\s*(?:거|것)?/g, '');
    cleaned = cleaned.replace(/에서\s*볼\s*만한/g, '');
    cleaned = cleaned.replace(/에서\s*볼만한/g, '');

    // 인물 제거 후 남는 고립 수식어 제거 ("감독", "나오는" 등)
    if (intent.personNames.length > 0) {
      cleaned = cleaned.replace(ORPHAN_PERSON_MODIFIER, '');
    }

    // 메타데이터 제거 후 남는 고립 잔여 표현 제거
    cleaned = cleaned.replace(ORPHAN_RESIDUAL_START, '');
    cleaned = cleaned.replace(ORPHAN_RESIDUAL_MID, ' ');
    cleaned = cleaned.replace(ORPHAN_RESIDUAL_END, '');

    // 문두/문미에 남은 고립 조사 제거 (문맥 중간의 조사는 유지)
    cleaned = cleaned.replace(/^\s*(?:에서|에|의|을|를|이|가|은|는)\s+/g, '');
    cleaned = cleaned.replace(/\s+(?:에서|에)\s*$/g, '');

    // 다중 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 정제 결과가 너무 짧으면 (빈 문자열 또는 의미 부족) 원본 반환
    // 벡터 검색에서 "영화", "드라마" 같은 단일 단어보다 원본이 더 유용
    if (!cleaned || cleaned.length <= 3) {
      return originalQuery;
    }

    return cleaned;
  }
}
