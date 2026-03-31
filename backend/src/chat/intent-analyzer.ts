import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CHAT_MODEL } from './chat.constants';
import { ChatHistoryMessageDto } from './dto/send-message.dto';

export interface ParsedIntent {
  ottProviderNames: string[];
  countries: string[];
  excludeCountries: string[];
  personNames: string[];
  referenceTitles: string[];
  dateRange: { from: string | null; to: string | null } | null;
  contentType: 'movie' | 'tv' | null;
  genres: string[];
  confidence: 'high' | 'low';
}

const EMPTY_INTENT: ParsedIntent = {
  ottProviderNames: [],
  countries: [],
  excludeCountries: [],
  personNames: [],
  referenceTitles: [],
  dateRange: null,
  contentType: null,
  genres: [],
  confidence: 'low',
};

function buildIntentSystemPrompt(): string {
  const now = new Date();
  const year = now.getFullYear();
  const oneYearAgo = `${year - 1}-01-01`;
  const thisYear = `${year}-01-01`;

  return `오늘 날짜: ${now.toISOString().split('T')[0]}

사용자 메시지에서 영화/시리즈 추천에 필요한 조건을 JSON으로 추출하세요.
- ottProviderNames: OTT 플랫폼 (Netflix, Tving, wavve, Watcha, Disney Plus, Coupang Play). 없으면 빈 배열.
- countries: 제작 국가 ISO 코드 (KR, US, JP, GB 등). 없으면 빈 배열.
- excludeCountries: 제외할 국가 ISO 코드. "외국"/"해외" → ["KR"] (한국 제외), "비영어권" → ["US", "GB", "CA", "AU"]. 없으면 빈 배열.
- personNames: 감독/배우 이름. "기생충 감독" → "봉준호"처럼 작품으로 유추 가능하면 실제 이름으로. 없으면 빈 배열.
- dateRange: 연도/연대/시기 조건. "최신"/"요즘"/"최근" → {"from":"${oneYearAgo}","to":null}, "90년대" → {"from":"1990-01-01","to":"1999-12-31"}, "올해" → {"from":"${thisYear}","to":null}. 없으면 null.
- contentType: "영화"/"무비" → "movie", "드라마"/"시리즈"/"TV"/"예능" → "tv". 이 단어가 메시지에 직접 포함된 경우에만 설정. 장르명(스릴러, 코미디, 로맨스, 액션, 호러, 공포, SF, 판타지, 애니메이션 등)으로는 절대 contentType을 추론하지 마세요. 확실하지 않으면 null.
- genres: 사용자가 언급한 장르명을 배열로 추출. 사용자 표현 그대로 반환 (예: "호러" → ["호러"], "느와르" → ["느와르"], "SF 스릴러" → ["SF", "스릴러"]). 장르 언급이 없으면 빈 배열.
- referenceTitles: "X 같은", "X 비슷한", "X 느낌의" 등에서 참조 작품명 X를 배열로 추출. 단순 언급("X 봤어")은 포함하지 않고, "~같은/비슷한/느낌의" 맥락에서만 추출. 없으면 빈 배열.
- confidence: "high" 또는 "low"
  - high: 구체적 필터(장르, OTT, 국가, 인물, 연대, 참조 작품 등)가 1개 이상 명시된 경우
  - low: "재밌는", "좋은", "추천해줘", "뭐 볼까" 등 모호한 요청. 필터 조건이 없는 경우

이전 대화가 주어진 경우:
- 이전 대화에서 언급된 조건(장르, 국가, OTT, 인물, 연대 등)이 현재 메시지에서 명시적으로 변경되지 않았다면 계속 유효한 것으로 간주하세요.
- 현재 메시지가 "더", "다른", "비슷한" 등으로 시작하면 이전 조건을 유지하세요.
- 사용자가 완전히 새로운 주제를 요청하면("아, 그건 됐고 코미디 추천해줘") 이전 조건을 무시하세요.
- 현재 메시지의 의도를 중심으로 분석하되, 이전 대화에서 유지되는 조건만 보충하세요.

JSON만 출력하세요.`;
}

function sliceRecentHistory(
  history: ChatHistoryMessageDto[] | undefined,
  maxTurns: number,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (!history || history.length === 0) return [];
  const sliced = history.slice(-(maxTurns * 2));
  return sliced.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}

interface RawIntentResponse {
  ottProviderNames?: unknown;
  countries?: unknown;
  excludeCountries?: unknown;
  personNames?: unknown;
  referenceTitles?: unknown;
  dateRange?: unknown;
  contentType?: unknown;
  genres?: unknown;
  confidence?: unknown;
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

  const excludeCountries = isStringArray(raw.excludeCountries)
    ? raw.excludeCountries
    : [];

  const personNames = isStringArray(raw.personNames)
    ? raw.personNames
    : [];

  const referenceTitles = isStringArray(raw.referenceTitles)
    ? raw.referenceTitles
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

  const genres = isStringArray(raw.genres) ? raw.genres : [];

  const confidence: ParsedIntent['confidence'] = raw.confidence === 'high' ? 'high' : 'low';

  return { ottProviderNames, countries, excludeCountries, personNames, referenceTitles, dateRange, contentType, genres, confidence };
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

// 참조 작품 제거 후 남는 고립 수식어 정규식
const ORPHAN_REFERENCE_MODIFIER = /(?:같은|비슷한|느낌의|느낌인|스타일의|류의|종류의)\s*/g;

// 메타데이터 제거 후 남는 고립 잔여 표현 정규식 ("볼만한거" 등은 의미적 표현이므로 제외)
// 문두: "이후 ..." / 문중: "... 중에 ..." / 문미: "... 이전"
const ORPHAN_RESIDUAL_START = /^(?:중에|이후|이전)\s+/;
const ORPHAN_RESIDUAL_MID = /\s+(?:중에|이후|이전)\s+/g;
const ORPHAN_RESIDUAL_END = /\s+(?:중에|이후|이전)$/;

// 사용자 표현 -> DB 장르명 매핑
// DB 장르명: GENRE_NAME_MAP (backend/src/common/constants.ts) 참조
// TV 전용 장르: "액션 & 어드벤처", "SF & 판타지" 등은 contentType=tv일 때 자동 포함
export const GENRE_ALIAS_MAP: Record<string, string[]> = {
  '호러': ['공포'],
  '공포': ['공포'],
  '느와르': ['범죄', '액션'],
  '액션': ['액션'],
  '판타지': ['판타지'],
  '스릴러': ['스릴러'],
  '코미디': ['코미디'],
  '로맨스': ['로맨스'],
  'SF': ['SF'],
  '드라마': ['드라마'],
  '애니메이션': ['애니메이션'],
  '다큐멘터리': ['다큐멘터리'],
  '범죄': ['범죄'],
  '미스터리': ['미스터리'],
  '전쟁': ['전쟁'],
  '역사': ['역사'],
  '가족': ['가족'],
  '음악': ['음악'],
  '모험': ['모험'],
  '서부': ['서부'],
};

// TV contentType일 때 추가할 TV 전용 장르 매핑
const TV_GENRE_EXPANSION: Record<string, string> = {
  '액션': '액션 & 어드벤처',
  '판타지': 'SF & 판타지',
  'SF': 'SF & 판타지',
};

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

  async analyzeIntent(
    userMessage: string,
    recentHistory?: ChatHistoryMessageDto[],
  ): Promise<ParsedIntent> {
    if (!this.openai) {
      return { ...EMPTY_INTENT };
    }

    try {
      const historyMessages = sliceRecentHistory(recentHistory, 2);

      const response = await this.openai.chat.completions.create({
        model: CHAT_MODEL,
        reasoning_effort: 'low',
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildIntentSystemPrompt() },
          ...historyMessages,
          { role: 'user', content: userMessage },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim();
      if (!text) {
        return { ...EMPTY_INTENT };
      }

      const parsed: RawIntentResponse = JSON.parse(text);
      const intent = parseIntentResponse(parsed);

      // contentType 후처리: 메시지 키워드와 LLM 결과 교차 검증
      // 멀티턴: 히스토리의 마지막 user 메시지도 키워드 검사 대상에 포함
      const textToCheck = recentHistory?.length
        ? `${recentHistory.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? ''} ${userMessage}`
        : userMessage;
      const hasMovieKeyword = /영화|무비/i.test(textToCheck);
      const hasTvKeyword = /드라마|시리즈|TV|예능/i.test(textToCheck);
      if (intent.contentType) {
        // LLM이 타입을 추출했지만 메시지에 키워드가 없으면 null로 강제
        if (!hasMovieKeyword && !hasTvKeyword) {
          intent.contentType = null;
        }
      } else {
        // LLM이 타입을 놓쳤지만 메시지에 키워드가 있으면 보정
        if (hasMovieKeyword && !hasTvKeyword) intent.contentType = 'movie';
        if (hasTvKeyword && !hasMovieKeyword) intent.contentType = 'tv';
      }

      // "드라마"가 contentType=tv로 잡혔으면 genres에서 제거 (장르 Drama 필터 방지)
      if (intent.contentType === 'tv' && hasTvKeyword) {
        intent.genres = intent.genres.filter(
          (g) => !/^드라마$/i.test(g),
        );
      }

      // confidence 후처리: 코드에서 교차 검증
      const hasFilters =
        intent.ottProviderNames.length > 0 ||
        intent.countries.length > 0 ||
        intent.excludeCountries.length > 0 ||
        intent.personNames.length > 0 ||
        intent.dateRange !== null ||
        intent.genres.length > 0 ||
        intent.referenceTitles.length > 0 ||
        intent.contentType !== null;

      if (hasFilters && intent.confidence === 'low') {
        intent.confidence = 'high';
      } else if (!hasFilters && intent.confidence === 'high') {
        intent.confidence = 'low';
      }

      // genres 후처리: GENRE_ALIAS_MAP으로 DB 장르명 변환 + TV 확장
      if (intent.genres.length > 0) {
        const mappedGenres = new Set<string>();
        for (const genre of intent.genres) {
          const mapped = GENRE_ALIAS_MAP[genre];
          if (mapped) {
            for (const g of mapped) {
              mappedGenres.add(g);
            }
          } else {
            // 매핑에 없는 장르명은 그대로 유지 (DB에 직접 존재할 수 있음)
            mappedGenres.add(genre);
          }
        }

        // TV 전용 장르 확장: contentType이 tv이거나 null(모든 타입 검색)일 때 확장
        // movie에서 "액션 & 어드벤처" 등은 존재하지 않으므로 ANY 조건에서 자연스럽게 무시됨
        if (intent.contentType !== 'movie') {
          for (const genre of [...mappedGenres]) {
            const tvGenre = TV_GENRE_EXPANSION[genre];
            if (tvGenre) {
              mappedGenres.add(tvGenre);
            }
          }
        }

        intent.genres = [...mappedGenres];
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

    // 참조 작품명 제거 (intent에서 추출된 제목)
    for (const title of intent.referenceTitles) {
      cleaned = cleaned.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
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

    // 장르 키워드 제거 (intent.genres에 값이 있을 때만)
    if (intent.genres.length > 0) {
      // GENRE_ALIAS_MAP 키 (사용자 표현) + DB 장르명 모두 수집
      const genreKeywords = new Set<string>();
      for (const genre of intent.genres) {
        genreKeywords.add(genre);
      }
      for (const [alias, dbNames] of Object.entries(GENRE_ALIAS_MAP)) {
        if (dbNames.some((name) => intent.genres.includes(name))) {
          genreKeywords.add(alias);
        }
      }
      // 길이 역순 정렬 (긴 키워드부터 제거하여 부분 매칭 방지)
      const sortedKeywords = [...genreKeywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedKeywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(new RegExp(escaped, 'g'), '');
      }
    }

    // OTT/국가 제거 후 남은 잔여 구문 정리 ("에서 볼 수 있는" 등)
    cleaned = cleaned.replace(/에서\s*볼\s*수\s*있는\s*(?:거|것)?/g, '');
    cleaned = cleaned.replace(/에서\s*볼\s*만한/g, '');
    cleaned = cleaned.replace(/에서\s*볼만한/g, '');

    // 인물 제거 후 남는 고립 수식어 제거 ("감독", "나오는" 등)
    if (intent.personNames.length > 0) {
      cleaned = cleaned.replace(ORPHAN_PERSON_MODIFIER, '');
    }

    // 참조 작품 제거 후 남는 고립 수식어 제거 ("같은", "비슷한", "느낌의" 등)
    if (intent.referenceTitles.length > 0) {
      cleaned = cleaned.replace(ORPHAN_REFERENCE_MODIFIER, '');
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
