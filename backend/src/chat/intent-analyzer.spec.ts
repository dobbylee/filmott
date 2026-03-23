import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntentAnalyzerService, ParsedIntent, GENRE_ALIAS_MAP } from './intent-analyzer';
import { GENRE_NAME_MAP } from '../common/constants';
import { CHAT_MODEL } from './chat.constants';

// OpenAI SDK mock
const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

const EMPTY_INTENT: ParsedIntent = {
  ottProviderNames: [],
  countries: [],
  excludeCountries: [],
  personNames: [],
  referenceTitles: [],
  dateRange: null,
  contentType: null,
  genres: [],
};

describe('IntentAnalyzerService', () => {
  let service: IntentAnalyzerService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-openai-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentAnalyzerService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<IntentAnalyzerService>(IntentAnalyzerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockLlmResponse = (content: string): void => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content } }],
    });
  };

  const mockIntent = (overrides: Partial<ParsedIntent> = {}): void => {
    mockLlmResponse(JSON.stringify({
      ottProviderNames: [],
      countries: [],
      excludeCountries: [],
      personNames: [],
      dateRange: null,
      contentType: null,
      genres: [],
      ...overrides,
    }));
  };

  describe('analyzeIntent', () => {
    it('OTT 플랫폼을 올바르게 추출해야 한다', async () => {
      mockIntent({ ottProviderNames: ['Netflix'] });

      const result = await service.analyzeIntent('넷플릭스에서 볼만한 영화');

      expect(result.ottProviderNames).toEqual(['Netflix']);
      expect(result.countries).toEqual([]);
      expect(result.personNames).toEqual([]);
      expect(result.dateRange).toBeNull();
      expect(result.contentType).toBe('movie');
    });

    it('제작 국가를 올바르게 추출해야 한다', async () => {
      mockIntent({ countries: ['KR'] });

      const result = await service.analyzeIntent('한국 영화 추천해줘');

      expect(result.countries).toEqual(['KR']);
    });

    it('인물 이름을 올바르게 추출해야 한다', async () => {
      mockIntent({ personNames: ['봉준호'] });

      const result = await service.analyzeIntent('기생충 감독의 다른 작품');

      expect(result.personNames).toEqual(['봉준호']);
    });

    it('연도 범위를 올바르게 추출해야 한다', async () => {
      mockIntent({ dateRange: { from: '1990-01-01', to: '1999-12-31' } });

      const result = await service.analyzeIntent('90년대 느와르 영화');

      expect(result.dateRange).toEqual({ from: '1990-01-01', to: '1999-12-31' });
    });

    it('최신 키워드의 연도 범위를 올바르게 추출해야 한다', async () => {
      mockIntent({ dateRange: { from: '2024-01-01', to: null } });

      const result = await service.analyzeIntent('최신 영화 추천해줘');

      expect(result.dateRange).toEqual({ from: '2024-01-01', to: null });
    });

    it('콘텐츠 타입을 올바르게 추출해야 한다', async () => {
      mockIntent({ contentType: 'tv' });

      const result = await service.analyzeIntent('재밌는 드라마 추천해줘');

      expect(result.contentType).toBe('tv');
    });

    it('복합 의도를 모두 추출해야 한다', async () => {
      mockIntent({
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        dateRange: { from: '2024-01-01', to: null },
        contentType: 'tv',
      });

      const result = await service.analyzeIntent(
        '넷플릭스에서 볼 수 있는 한국 최신 드라마',
      );

      expect(result.ottProviderNames).toEqual(['Netflix']);
      expect(result.countries).toEqual(['KR']);
      expect(result.dateRange).toEqual({ from: '2024-01-01', to: null });
      expect(result.contentType).toBe('tv');
    });

    it('의도가 없는 메시지는 빈 ParsedIntent를 반환해야 한다', async () => {
      mockIntent();

      const result = await service.analyzeIntent('안녕하세요');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
    });

    it('CHAT_MODEL을 response_format json_object로 호출해야 한다', async () => {
      mockIntent();

      await service.analyzeIntent('테스트');

      expect(mockCreate).toHaveBeenCalledWith({
        model: CHAT_MODEL,
        reasoning_effort: 'minimal',
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: expect.stringContaining('JSON으로 추출') },
          { role: 'user', content: '테스트' },
        ],
      });
    });

    it('여러 OTT 플랫폼을 동시에 추출해야 한다', async () => {
      mockIntent({ ottProviderNames: ['Netflix', 'Tving'] });

      const result = await service.analyzeIntent('넷플릭스나 티빙에서 볼만한 영화');

      expect(result.ottProviderNames).toEqual(['Netflix', 'Tving']);
    });

    it('여러 인물을 동시에 추출해야 한다', async () => {
      mockIntent({ personNames: ['송강호', '최민식'] });

      const result = await service.analyzeIntent('송강호와 최민식이 나오는 영화');

      expect(result.personNames).toEqual(['송강호', '최민식']);
    });

    it('OPENAI_API_KEY가 없으면 빈 ParsedIntent를 반환해야 한다', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IntentAnalyzerService,
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        ],
      }).compile();

      const noKeyService = module.get<IntentAnalyzerService>(IntentAnalyzerService);

      const result = await noKeyService.analyzeIntent('넷플릭스 영화');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('장르를 올바르게 추출해야 한다 (호러 -> 공포)', async () => {
      mockIntent({ genres: ['호러'] });

      const result = await service.analyzeIntent('호러 영화 추천해줘');

      expect(result.genres).toEqual(['공포']);
    });

    it('느와르를 범죄+액션으로 매핑해야 한다', async () => {
      mockIntent({ genres: ['느와르'] });

      const result = await service.analyzeIntent('90년대 느와르 영화');

      expect(result.genres).toContain('범죄');
      expect(result.genres).toContain('액션');
    });

    it.each([
      { genre: '액션', expanded: '액션 & 어드벤처', type: 'tv' as const },
      { genre: 'SF', expanded: 'SF & 판타지', type: 'tv' as const },
      { genre: '판타지', expanded: 'SF & 판타지', type: 'tv' as const },
      { genre: '액션', expanded: '액션 & 어드벤처', type: null },
      { genre: 'SF', expanded: 'SF & 판타지', type: null },
    ])('$genre -> $expanded 확장 (contentType=$type)', async ({ genre, expanded, type }) => {
      mockIntent({ contentType: type, genres: [genre] });

      const result = await service.analyzeIntent(
        type === 'tv' ? `${genre} 드라마 추천해줘` : `${genre}물 추천해줘`,
      );

      expect(result.genres).toContain(genre);
      expect(result.genres).toContain(expanded);
    });

    it('참조 작품명을 올바르게 추출해야 한다', async () => {
      mockIntent({ referenceTitles: ['영야성하'] });

      const result = await service.analyzeIntent('영야성하 같은 드라마 추천해줘');

      expect(result.referenceTitles).toEqual(['영야성하']);
    });

    it('여러 참조 작품명을 추출해야 한다', async () => {
      mockIntent({ referenceTitles: ['기생충', '옥자'] });

      const result = await service.analyzeIntent('기생충이나 옥자 같은 영화');

      expect(result.referenceTitles).toEqual(['기생충', '옥자']);
    });

    it('referenceTitles가 잘못된 타입이면 빈 배열로 처리해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: '기생충',
        dateRange: null,
        contentType: null,
        genres: [],
      }));

      const result = await service.analyzeIntent('기생충 같은 영화');

      expect(result.referenceTitles).toEqual([]);
    });

    it('매핑에 없는 장르명은 그대로 유지해야 한다', async () => {
      mockIntent({ genres: ['뮤지컬'] });

      const result = await service.analyzeIntent('뮤지컬 영화 추천해줘');

      expect(result.genres).toEqual(['뮤지컬']);
    });

    it('movie 타입에서는 TV 전용 장르를 확장하지 않아야 한다', async () => {
      mockIntent({ contentType: 'movie', genres: ['액션'] });

      const result = await service.analyzeIntent('액션 영화 추천해줘');

      expect(result.genres).toEqual(['액션']);
      expect(result.genres).not.toContain('액션 & 어드벤처');
    });
  });

  describe('fallback 처리', () => {
    it('JSON 파싱 실패 시 빈 ParsedIntent를 반환해야 한다', async () => {
      mockLlmResponse('이것은 유효하지 않은 JSON입니다');

      const result = await service.analyzeIntent('넷플릭스 영화 추천');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
    });

    it('LLM 호출 에러 시 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockRejectedValue(new Error('API 오류'));

      const result = await service.analyzeIntent('넷플릭스 영화 추천');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
    });

    it('응답이 비어있으면 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const result = await service.analyzeIntent('테스트');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
    });

    it('choices가 비어있으면 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      const result = await service.analyzeIntent('테스트');

      expect(result).toEqual<ParsedIntent>(EMPTY_INTENT);
    });

    it('잘못된 타입의 필드가 있으면 기본값으로 처리해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: 'Netflix',
        countries: 123,
        personNames: null,
        dateRange: 'invalid',
        contentType: 'anime',
      }));

      const result = await service.analyzeIntent('테스트');

      expect(result.ottProviderNames).toEqual([]);
      expect(result.countries).toEqual([]);
      expect(result.personNames).toEqual([]);
      expect(result.dateRange).toBeNull();
      expect(result.contentType).toBeNull();
    });

    it('dateRange의 from/to가 모두 null이면 dateRange를 null로 처리해야 한다', async () => {
      mockIntent({ dateRange: { from: null, to: null } });

      const result = await service.analyzeIntent('테스트');

      expect(result.dateRange).toBeNull();
    });
  });

  describe('buildSemanticQuery', () => {
    const emptyIntent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      excludeCountries: [],
      personNames: [],
      referenceTitles: [],
      dateRange: null,
      contentType: null,
      genres: [],
    };

    it('OTT명을 쿼리에서 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, ottProviderNames: ['Netflix'] };
      const result = service.buildSemanticQuery('넷플릭스에서 볼 수 있는 따뜻한 가족 영화', intent);

      expect(result).not.toMatch(/넷플릭스/);
      expect(result).toContain('따뜻한');
      expect(result).toContain('가족');
      expect(result).toContain('영화');
    });

    it('인물명을 쿼리에서 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, personNames: ['봉준호'] };
      const result = service.buildSemanticQuery('봉준호 감독의 사회 풍자 영화', intent);

      expect(result).not.toMatch(/봉준호/);
      expect(result).toContain('사회');
      expect(result).toContain('풍자');
      expect(result).toContain('영화');
    });

    it('국가명을 쿼리에서 제거해야 한다 (intent.countries에 값이 있을 때)', () => {
      const intent: ParsedIntent = { ...emptyIntent, countries: ['KR'] };
      const result = service.buildSemanticQuery('한국 로맨스 드라마', intent);

      expect(result).not.toMatch(/한국/);
      expect(result).toContain('로맨스');
      expect(result).toContain('드라마');
    });

    it('intent.countries가 비어있으면 국가명을 제거하지 않아야 한다', () => {
      const result = service.buildSemanticQuery('한국 로맨스 드라마', emptyIntent);

      expect(result).toContain('한국');
    });

    it('연도/시기 표현을 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        dateRange: { from: '2024-01-01', to: null },
      };
      const result = service.buildSemanticQuery('최신 스릴러 영화', intent);

      expect(result).not.toMatch(/최신/);
      expect(result).toContain('스릴러');
      expect(result).toContain('영화');
    });

    it('요청 표현을 제거해야 한다', () => {
      const result = service.buildSemanticQuery('스릴러 영화 추천해줘', emptyIntent);

      expect(result).not.toMatch(/추천해줘/);
      expect(result).toContain('스릴러');
      expect(result).toContain('영화');
    });

    it('메타데이터 + 요청 표현을 모두 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        countries: ['KR'],
        dateRange: { from: '2024-01-01', to: null },
        contentType: 'tv',
      };
      const result = service.buildSemanticQuery('최신 한국 로맨스 드라마 추천해줘', intent);

      expect(result).not.toMatch(/최신/);
      expect(result).not.toMatch(/한국/);
      expect(result).not.toMatch(/추천해줘/);
      // 장르/타입 표현은 유지
      expect(result).toContain('로맨스');
      expect(result).toContain('드라마');
    });

    it('정제 결과가 너무 짧으면 원본을 반환해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        countries: ['KR'],
        dateRange: { from: '2024-01-01', to: null },
        contentType: 'tv',
      };
      // "드라마"만 남으므로 (3자 이하) 원본 반환
      const result = service.buildSemanticQuery('최신 한국 드라마 추천해줘', intent);

      expect(result).toBe('최신 한국 드라마 추천해줘');
    });

    it('모든 키워드가 메타데이터인 경우 원본을 반환해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
      };
      const result = service.buildSemanticQuery('넷플릭스 한국', intent);

      // 정제 후 빈 문자열이면 원본 반환
      expect(result).toBe('넷플릭스 한국');
    });

    it('intent가 빈 경우 원본 그대로 반환해야 한다 (요청 표현 제외)', () => {
      const result = service.buildSemanticQuery('따뜻한 가족 영화', emptyIntent);

      expect(result).toBe('따뜻한 가족 영화');
    });

    it('다양한 OTT명 변형을 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, ottProviderNames: ['Netflix'] };

      expect(service.buildSemanticQuery('넷플 액션 영화', intent)).not.toMatch(/넷플/);
      expect(service.buildSemanticQuery('Netflix 액션 영화', intent)).not.toMatch(/Netflix/i);
    });

    it('90년대 같은 연대 표현도 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        dateRange: { from: '1990-01-01', to: '1999-12-31' },
      };
      const result = service.buildSemanticQuery('90년대 느와르 영화', intent);

      expect(result).not.toMatch(/90년대/);
      expect(result).toContain('느와르');
    });

    it('2024년 같은 구체적 연도도 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        dateRange: { from: '2024-01-01', to: '2024-12-31' },
      };
      const result = service.buildSemanticQuery('2024년 개봉 액션 영화', intent);

      expect(result).not.toMatch(/2024년/);
      expect(result).toContain('개봉');
      expect(result).toContain('액션');
    });

    it('다중 공백을 정리해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        personNames: ['봉준호'],
      };
      const result = service.buildSemanticQuery('넷플릭스 봉준호 감독 스릴러 영화', intent);

      expect(result).not.toMatch(/\s{2,}/);
    });

    it('"추천" 단독도 제거해야 한다', () => {
      const result = service.buildSemanticQuery('SF 영화 추천', emptyIntent);

      expect(result).toBe('SF 영화');
    });

    it('인물 제거 후 고립된 "감독"을 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, personNames: ['봉준호'] };
      // "봉준호 감독 사회 풍자 영화" → "사회 풍자 영화" (감독 제거, 충분한 길이)
      const result = service.buildSemanticQuery('봉준호 감독 사회 풍자 영화', intent);

      expect(result).not.toMatch(/감독/);
      expect(result).not.toMatch(/봉준호/);
      expect(result).toContain('사회');
      expect(result).toContain('풍자');
    });

    it('인물 제거 후 고립된 "나오는"을 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, personNames: ['송강호'] };
      const result = service.buildSemanticQuery('송강호 나오는 영화 재밌는 거', intent);

      expect(result).not.toMatch(/나오는/);
      expect(result).toContain('영화');
      expect(result).toContain('재밌는 거');
    });

    it('인물이 없으면 "감독"을 유지해야 한다', () => {
      const result = service.buildSemanticQuery('유명한 감독의 영화', emptyIntent);

      expect(result).toContain('감독');
    });

    it('"중에"를 제거하고 앞뒤 공백을 보존해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, countries: ['FR'] };
      const result = service.buildSemanticQuery('프랑스 영화 중에 로맨틱한 거', intent);

      expect(result).toBe('영화 로맨틱한 거');
      expect(result).not.toMatch(/중에/);
    });

    it('분위기 쿼리에서 "거/것"을 보존해야 한다', () => {
      const result1 = service.buildSemanticQuery('밤에 볼 만한 무서운 거', emptyIntent);
      expect(result1).toBe('밤에 볼 만한 무서운 거');

      const result2 = service.buildSemanticQuery('잠 안 올 때 볼 만한 것', emptyIntent);
      expect(result2).toBe('잠 안 올 때 볼 만한 것');
    });

    it('"에서 볼 수 있는 거"를 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
      };
      const result = service.buildSemanticQuery(
        '넷플릭스에서 볼 수 있는 거 따뜻한 영화',
        intent,
      );

      expect(result).not.toMatch(/에서 볼 수 있는/);
      expect(result).toContain('따뜻한');
      expect(result).toContain('영화');
    });

    it('복합 조건 쿼리에서 핵심 장르만 남겨야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        dateRange: { from: '2024-01-01', to: null },
        contentType: 'movie',
      };
      const result = service.buildSemanticQuery(
        '넷플릭스에서 볼 수 있는 최신 한국 스릴러 영화',
        intent,
      );

      expect(result).toContain('스릴러');
      expect(result).toContain('영화');
      expect(result).not.toMatch(/넷플릭스/);
      expect(result).not.toMatch(/한국/);
      expect(result).not.toMatch(/최신/);
    });

    it('장르 키워드를 쿼리에서 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        genres: ['공포'],
      };
      const result = service.buildSemanticQuery('무서운 호러 영화', intent);

      expect(result).not.toMatch(/호러/);
      expect(result).not.toMatch(/공포/);
      expect(result).toContain('무서운');
      expect(result).toContain('영화');
    });

    it('느와르 장르 키워드를 제거해야 한다 (역방향 매핑)', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        genres: ['범죄', '액션'],
      };
      const result = service.buildSemanticQuery('90년대 느와르 영화 스타일', intent);

      expect(result).not.toMatch(/느와르/);
      expect(result).not.toMatch(/범죄/);
      expect(result).not.toMatch(/액션/);
      expect(result).toContain('영화');
      expect(result).toContain('스타일');
    });

    it('genres가 비어있으면 장르 키워드를 제거하지 않아야 한다', () => {
      const result = service.buildSemanticQuery('무서운 호러 영화', emptyIntent);

      expect(result).toContain('호러');
    });

    it('참조 작품명을 쿼리에서 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, referenceTitles: ['영야성하'] };
      const result = service.buildSemanticQuery('영야성하 같은 분위기 드라마', intent);

      expect(result).not.toMatch(/영야성하/);
      expect(result).not.toMatch(/같은/);
      expect(result).toContain('분위기');
      expect(result).toContain('드라마');
    });

    it('참조 작품 제거 후 "비슷한" 고립 수식어를 제거해야 한다', () => {
      const intent: ParsedIntent = { ...emptyIntent, referenceTitles: ['기생충'] };
      const result = service.buildSemanticQuery('기생충 비슷한 사회 풍자 영화', intent);

      expect(result).not.toMatch(/기생충/);
      expect(result).not.toMatch(/비슷한/);
      expect(result).toContain('사회');
      expect(result).toContain('풍자');
      expect(result).toContain('영화');
    });

    it('참조 작품이 없으면 "같은"을 유지해야 한다', () => {
      const result = service.buildSemanticQuery('같은 분위기 영화', emptyIntent);

      expect(result).toContain('같은');
    });

    it('복합 조건에서 장르 + 기타 메타데이터를 모두 제거해야 한다', () => {
      const intent: ParsedIntent = {
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        genres: ['스릴러'],
      };
      const result = service.buildSemanticQuery(
        '넷플릭스에서 볼 수 있는 한국 스릴러 반전 영화',
        intent,
      );

      expect(result).not.toMatch(/넷플릭스/);
      expect(result).not.toMatch(/한국/);
      expect(result).not.toMatch(/스릴러/);
      expect(result).toContain('반전');
      expect(result).toContain('영화');
    });
  });

  describe('GENRE_ALIAS_MAP / GENRE_NAME_MAP 동기화', () => {
    it('GENRE_ALIAS_MAP의 모든 매핑 값이 GENRE_NAME_MAP의 values에 존재해야 한다', () => {
      const validGenreNames = new Set(Object.values(GENRE_NAME_MAP));

      for (const [alias, dbNames] of Object.entries(GENRE_ALIAS_MAP)) {
        for (const dbName of dbNames) {
          expect(validGenreNames.has(dbName)).toBe(true);
          if (!validGenreNames.has(dbName)) {
            // 실패 시 어떤 alias의 어떤 값이 문제인지 명확히 표시
            fail(`GENRE_ALIAS_MAP["${alias}"]의 값 "${dbName}"이 GENRE_NAME_MAP에 존재하지 않음`);
          }
        }
      }
    });
  });
});
