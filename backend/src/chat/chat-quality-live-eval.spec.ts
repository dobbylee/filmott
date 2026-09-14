import { CHAT_QUALITY_CASES } from './chat-quality-cases';

describe('live eval 실행 경계', () => {
  const originalOptIn = process.env.RUN_CHAT_QUALITY_LIVE_EVAL;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalExitCode = process.exitCode;
  let mockCreate: jest.Mock;
  let stderr: jest.SpyInstance;
  let stdout: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.RUN_CHAT_QUALITY_LIVE_EVAL;
    delete process.env.OPENAI_API_KEY;
    process.exitCode = undefined;
    mockCreate = jest.fn();
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.doMock('openai', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      })),
    }));
  });

  afterEach(() => {
    if (originalOptIn === undefined)
      delete process.env.RUN_CHAT_QUALITY_LIVE_EVAL;
    else process.env.RUN_CHAT_QUALITY_LIVE_EVAL = originalOptIn;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
    jest.dontMock('openai');
    jest.dontMock('./chat-quality-cases');
  });

  async function execute(cases = CHAT_QUALITY_CASES): Promise<void> {
    jest.doMock('./chat-quality-cases', () => ({ CHAT_QUALITY_CASES: cases }));
    await jest.isolateModulesAsync(async () => {
      jest.requireActual('./chat-quality-live-eval');
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }

  it('명시적 opt-in 없이는 SDK 호출 전에 실패해야 한다', async () => {
    await execute();
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('RUN_CHAT_QUALITY_LIVE_EVAL=true'),
    );
    expect(process.exitCode).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('opt-in 후에도 키가 없으면 SDK 호출 전에 실패해야 한다', async () => {
    process.env.RUN_CHAT_QUALITY_LIVE_EVAL = 'true';
    await execute();
    expect(stderr).toHaveBeenCalledWith('OPENAI_API_KEY가 필요합니다.\n');
    expect(process.exitCode).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('10개를 넘는 케이스는 SDK 호출 전에 거절해야 한다', async () => {
    process.env.RUN_CHAT_QUALITY_LIVE_EVAL = 'true';
    process.env.OPENAI_API_KEY = 'fixture-key';
    await execute(Array.from({ length: 11 }, () => CHAT_QUALITY_CASES[0]));
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('비용 상한은 10개'),
    );
    expect(process.exitCode).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('guard 통과 후 새 client로 의도를 분석하고 기존 결과를 출력해야 한다', async () => {
    process.env.RUN_CHAT_QUALITY_LIVE_EVAL = 'true';
    process.env.OPENAI_API_KEY = 'fixture-key';
    const testCase = CHAT_QUALITY_CASES[0];
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(testCase.recordedStructuredOutput),
          },
        },
      ],
    });
    await execute([testCase]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining(`PASS ${testCase.id}`),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('명시적으로 변경한 live 기대값은 과거 recorded 출력과 분리해 평가해야 한다', async () => {
    process.env.RUN_CHAT_QUALITY_LIVE_EVAL = 'true';
    process.env.OPENAI_API_KEY = 'fixture-key';
    const testCase = CHAT_QUALITY_CASES.find(
      (item) => item.id === 'netflix-latest-thriller-tv',
    )!;
    expect(testCase.recordedStructuredOutput.genres).toEqual(['스릴러']);
    expect(testCase.expectedLiveIntent?.genres).toEqual([]);
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify(testCase.expectedLiveIntent) } },
      ],
    });
    await execute([testCase]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining(`PASS ${testCase.id}`),
    );
    expect(process.exitCode).toBeUndefined();
  });
});
