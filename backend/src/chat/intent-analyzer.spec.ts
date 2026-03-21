import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';

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

  describe('analyzeIntent', () => {
    it('OTT 플랫폼을 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: ['Netflix'],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      }));

      const result = await service.analyzeIntent('넷플릭스에서 볼만한 영화');

      expect(result.ottProviderNames).toEqual(['Netflix']);
      expect(result.countries).toEqual([]);
      expect(result.personNames).toEqual([]);
      expect(result.dateRange).toBeNull();
      expect(result.contentType).toBeNull();
    });

    it('제작 국가를 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: ['KR'],
        personNames: [],
        dateRange: null,
        contentType: null,
      }));

      const result = await service.analyzeIntent('한국 영화 추천해줘');

      expect(result.countries).toEqual(['KR']);
    });

    it('인물 이름을 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: ['봉준호'],
        dateRange: null,
        contentType: null,
      }));

      const result = await service.analyzeIntent('기생충 감독의 다른 작품');

      expect(result.personNames).toEqual(['봉준호']);
    });

    it('연도 범위를 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: { from: '1990-01-01', to: '1999-12-31' },
        contentType: null,
      }));

      const result = await service.analyzeIntent('90년대 느와르 영화');

      expect(result.dateRange).toEqual({ from: '1990-01-01', to: '1999-12-31' });
    });

    it('최신 키워드의 연도 범위를 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: { from: '2024-01-01', to: null },
        contentType: null,
      }));

      const result = await service.analyzeIntent('최신 영화 추천해줘');

      expect(result.dateRange).toEqual({ from: '2024-01-01', to: null });
    });

    it('콘텐츠 타입을 올바르게 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: 'tv',
      }));

      const result = await service.analyzeIntent('재밌는 드라마 추천해줘');

      expect(result.contentType).toBe('tv');
    });

    it('복합 의도를 모두 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        personNames: [],
        dateRange: { from: '2024-01-01', to: null },
        contentType: 'tv',
      }));

      const result = await service.analyzeIntent(
        '넷플릭스에서 볼 수 있는 한국 최신 드라마',
      );

      expect(result.ottProviderNames).toEqual(['Netflix']);
      expect(result.countries).toEqual(['KR']);
      expect(result.dateRange).toEqual({ from: '2024-01-01', to: null });
      expect(result.contentType).toBe('tv');
    });

    it('의도가 없는 메시지는 빈 ParsedIntent를 반환해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      }));

      const result = await service.analyzeIntent('안녕하세요');

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
    });

    it('gpt-4o-mini 모델을 response_format json_object로 호출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      }));

      await service.analyzeIntent('테스트');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: expect.stringContaining('JSON으로 추출') },
          { role: 'user', content: '테스트' },
        ],
      });
    });

    it('여러 OTT 플랫폼을 동시에 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: ['Netflix', 'Tving'],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      }));

      const result = await service.analyzeIntent('넷플릭스나 티빙에서 볼만한 영화');

      expect(result.ottProviderNames).toEqual(['Netflix', 'Tving']);
    });

    it('여러 인물을 동시에 추출해야 한다', async () => {
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: ['송강호', '최민식'],
        dateRange: null,
        contentType: null,
      }));

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

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('fallback 처리', () => {
    it('JSON 파싱 실패 시 빈 ParsedIntent를 반환해야 한다', async () => {
      mockLlmResponse('이것은 유효하지 않은 JSON입니다');

      const result = await service.analyzeIntent('넷플릭스 영화 추천');

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
    });

    it('LLM 호출 에러 시 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockRejectedValue(new Error('API 오류'));

      const result = await service.analyzeIntent('넷플릭스 영화 추천');

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
    });

    it('응답이 비어있으면 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const result = await service.analyzeIntent('테스트');

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
    });

    it('choices가 비어있으면 빈 ParsedIntent를 반환해야 한다', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      const result = await service.analyzeIntent('테스트');

      expect(result).toEqual<ParsedIntent>({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: null,
        contentType: null,
      });
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
      mockLlmResponse(JSON.stringify({
        ottProviderNames: [],
        countries: [],
        personNames: [],
        dateRange: { from: null, to: null },
        contentType: null,
      }));

      const result = await service.analyzeIntent('테스트');

      expect(result.dateRange).toBeNull();
    });
  });

  describe('buildSemanticQuery', () => {
    const emptyIntent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      personNames: [],
      dateRange: null,
      contentType: null,
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
      const result = service.buildSemanticQuery('최신 한국 드라마 추천해줘', intent);

      expect(result).not.toMatch(/최신/);
      expect(result).not.toMatch(/한국/);
      expect(result).not.toMatch(/추천해줘/);
      // 드라마는 contentType 표현이므로 유지
      expect(result).toContain('드라마');
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
  });
});
