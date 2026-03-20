import { analyzeIntent, ParsedIntent } from './intent-analyzer';
import OpenAI from 'openai';

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

describe('IntentAnalyzer', () => {
  let openai: OpenAI;

  beforeEach(() => {
    openai = new OpenAI({ apiKey: 'test-key' });
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

      const result = await analyzeIntent('넷플릭스에서 볼만한 영화', openai);

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

      const result = await analyzeIntent('한국 영화 추천해줘', openai);

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

      const result = await analyzeIntent('기생충 감독의 다른 작품', openai);

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

      const result = await analyzeIntent('90년대 느와르 영화', openai);

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

      const result = await analyzeIntent('최신 영화 추천해줘', openai);

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

      const result = await analyzeIntent('재밌는 드라마 추천해줘', openai);

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

      const result = await analyzeIntent(
        '넷플릭스에서 볼 수 있는 한국 최신 드라마',
        openai,
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

      const result = await analyzeIntent('안녕하세요', openai);

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

      await analyzeIntent('테스트', openai);

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

      const result = await analyzeIntent('넷플릭스나 티빙에서 볼만한 영화', openai);

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

      const result = await analyzeIntent('송강호와 최민식이 나오는 영화', openai);

      expect(result.personNames).toEqual(['송강호', '최민식']);
    });
  });

  describe('fallback 처리', () => {
    it('JSON 파싱 실패 시 빈 ParsedIntent를 반환해야 한다', async () => {
      mockLlmResponse('이것은 유효하지 않은 JSON입니다');

      const result = await analyzeIntent('넷플릭스 영화 추천', openai);

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

      const result = await analyzeIntent('넷플릭스 영화 추천', openai);

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

      const result = await analyzeIntent('테스트', openai);

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

      const result = await analyzeIntent('테스트', openai);

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

      const result = await analyzeIntent('테스트', openai);

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

      const result = await analyzeIntent('테스트', openai);

      expect(result.dateRange).toBeNull();
    });
  });
});
