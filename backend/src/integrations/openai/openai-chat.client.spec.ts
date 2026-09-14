import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import OpenAI from 'openai';
import { OpenAIModule } from './openai.module';
import { OpenAISdkProvider } from './openai-sdk.provider';
import { OpenAIChatClient } from './openai-chat.client';

const mockCreate = jest.fn();
const mockStream = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate, stream: mockStream } },
  })),
}));

describe('OpenAI 공통 구성과 completion 경계', () => {
  afterEach(() => jest.clearAllMocks());

  it('키가 없어도 module을 구성하고 SDK 생성과 호출은 하지 않아야 한다', async () => {
    const module = await Test.createTestingModule({ imports: [OpenAIModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ OPENAI_API_KEY: '' }))
      .compile();
    try {
      const client = module.get(OpenAIChatClient);
      expect(client.isAvailable()).toBe(false);
      expect(() =>
        client.createCompletion({ model: 'fixture', messages: [] }),
      ).toThrow('OpenAI API key가 설정되지 않았습니다.');
      expect(OpenAI).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('설정된 키만 전달해 SDK를 한 번 생성하고 같은 인스턴스를 사용해야 한다', () => {
    const sdk = new OpenAISdkProvider(
      new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
    );
    expect(sdk.isAvailable()).toBe(true);
    expect(sdk.getClient()).toBe(sdk.getClient());
    expect(OpenAI).toHaveBeenCalledTimes(1);
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'fixture-key' });
  });

  it('요청과 옵션 및 반환 promise를 변경 없이 전달해야 한다', async () => {
    const client = new OpenAIChatClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const body = { model: 'fixture', messages: [] };
    const options = { timeout: 10_000, signal: new AbortController().signal };
    const response = { choices: [] };
    const pending = Promise.resolve(response);
    mockCreate.mockReturnValue(pending);
    const result = client.createCompletion(body, options);
    expect(result).toBe(pending);
    expect(mockCreate.mock.calls[0][0]).toBe(body);
    expect(mockCreate.mock.calls[0][1]).toBe(options);
    await expect(result).resolves.toBe(response);
  });

  it('SDK 오류를 새 오류로 감싸거나 재시도하지 않아야 한다', async () => {
    const client = new OpenAIChatClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const error = new Error('fixture failure');
    mockCreate.mockRejectedValueOnce(error);
    await expect(
      client.createCompletion({ model: 'fixture', messages: [] }),
    ).rejects.toBe(error);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('stream과 요청 옵션을 즉시 그대로 전달하고 이벤트를 미리 소비하지 않아야 한다', () => {
    const client = new OpenAIChatClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const stream = { on: jest.fn(), [Symbol.asyncIterator]: jest.fn() };
    const body = { model: 'fixture', messages: [] };
    const options = { timeout: 30_000, signal: new AbortController().signal };
    mockStream.mockReturnValueOnce(stream);
    expect(client.stream(body, options)).toBe(stream);
    expect(mockStream.mock.calls[0][0]).toBe(body);
    expect(mockStream.mock.calls[0][1]).toBe(options);
    expect(stream.on).not.toHaveBeenCalled();
    expect(stream[Symbol.asyncIterator]).not.toHaveBeenCalled();
  });

  it('stream 생성의 동기 오류를 그대로 전달해야 한다', () => {
    const client = new OpenAIChatClient(
      new OpenAISdkProvider(
        new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
      ),
    );
    const error = new Error('stream 생성 실패');
    mockStream.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => client.stream({ model: 'fixture', messages: [] })).toThrow(
      error,
    );
    expect(mockStream).toHaveBeenCalledTimes(1);
  });
});
