import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddingClient } from './openai-embedding.client';
import { OpenAISdkProvider } from './openai-sdk.provider';

const mockCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest
    .fn()
    .mockImplementation(() => ({ embeddings: { create: mockCreate } })),
}));

describe('OpenAI embedding 호출 경계', () => {
  afterEach(() => jest.clearAllMocks());

  it('본문과 signal/timeout 및 응답을 그대로 전달해야 한다', async () => {
    const client = new OpenAIEmbeddingClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const body = { model: 'text-embedding-3-small', input: '입력' };
    const options = { timeout: 10_000, signal: new AbortController().signal };
    const response = { data: [{ embedding: [0.1, 0.2] }] };
    const pending = Promise.resolve(response);
    mockCreate.mockReturnValueOnce(pending);
    const result = client.createEmbedding(body, options);
    expect(client.isAvailable()).toBe(true);
    expect(result).toBe(pending);
    expect(mockCreate.mock.calls[0][0]).toBe(body);
    expect(mockCreate.mock.calls[0][1]).toBe(options);
    await expect(result).resolves.toBe(response);
  });

  it('SDK 실패를 변환하거나 재시도하지 않아야 한다', async () => {
    const client = new OpenAIEmbeddingClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const error = new Error('fixture 오류');
    mockCreate.mockRejectedValueOnce(error);
    await expect(
      client.createEmbedding({
        model: 'text-embedding-3-small',
        input: '입력',
      }),
    ).rejects.toBe(error);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
