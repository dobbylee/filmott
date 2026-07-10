import { ConfigService } from '@nestjs/config';
import { CHAT_QUALITY_CASES } from './chat-quality-cases';
import { IntentAnalyzerService, type ParsedIntent } from './intent-analyzer';

const LIVE_EVAL_OPT_IN_ENV = 'RUN_CHAT_QUALITY_LIVE_EVAL';
const MAX_LIVE_EVAL_CASES = 10;

function intentsMatch(actual: ParsedIntent, expected: ParsedIntent): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function runLiveEval(): Promise<void> {
  if (process.env[LIVE_EVAL_OPT_IN_ENV] !== 'true') {
    throw new Error(
      `${LIVE_EVAL_OPT_IN_ENV}=true를 명시해야 live eval을 실행할 수 있습니다.`,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 필요합니다.');
  }

  if (CHAT_QUALITY_CASES.length > MAX_LIVE_EVAL_CASES) {
    throw new Error(
      `live eval 비용 상한은 ${MAX_LIVE_EVAL_CASES}개 케이스입니다. 케이스를 나눠 실행해주세요.`,
    );
  }

  const analyzer = new IntentAnalyzerService(
    new ConfigService({ OPENAI_API_KEY: apiKey }),
  );
  let failedCount = 0;

  for (const testCase of CHAT_QUALITY_CASES) {
    const actual = await analyzer.analyzeIntent(
      testCase.userMessage,
      testCase.history,
    );
    const passed = intentsMatch(actual, testCase.recordedStructuredOutput);
    if (!passed) failedCount += 1;

    process.stdout.write(
      `${passed ? 'PASS' : 'FAIL'} ${testCase.id}\n` +
        `${JSON.stringify({ expected: testCase.recordedStructuredOutput, actual })}\n`,
    );
  }

  if (failedCount > 0) {
    throw new Error(
      `채팅 품질 live eval ${failedCount}개 케이스가 실패했습니다.`,
    );
  }
}

runLiveEval().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
