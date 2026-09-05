import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({ cwd, cache: false });

// CI의 단일 실행 project service에서 같은 가상 파일을 반복 교체하지 않는다.
const source = `export type Probe = any;
export function unhandled(): void {
  Promise.resolve();
}
declare const input: Probe;
export const output = decodeURIComponent(input);
export async function safe(input: unknown): Promise<string> {
  await Promise.resolve();
  return typeof input === 'string' ? decodeURIComponent(input) : '';
}
`;
const [result] = await eslint.lintText(source, { filePath: join(cwd, 'src/app.service.ts') });

for (const [name, rule] of [
  ['프로덕션 any', '@typescript-eslint/no-explicit-any'],
  ['미처리 Promise', '@typescript-eslint/no-floating-promises'],
  ['검증하지 않은 인자', '@typescript-eslint/no-unsafe-argument'],
]) {
  test(`${name}를 경고가 아닌 오류로 거부한다`, () => {
    assert.ok(result.messages.some((message) => message.ruleId === rule && message.severity === 2), JSON.stringify(result.messages));
  });
}

test('타입을 좁힌 입력과 기다린 Promise는 통과한다', () => {
  const safeStartLine = source.slice(0, source.indexOf('export async function safe')).split('\n').length;
  assert.deepEqual(result.messages.filter((message) => message.line >= safeStartLine), []);
  assert.equal(result.errorCount, 3);
  assert.equal(result.warningCount, 0);
});

test('any와 unsafe 인자 예외는 unit 및 DB 테스트에만 적용된다', async () => {
  for (const file of ['src/app.service.spec.ts', 'test/app.e2e-spec.ts', 'test/integration/helpers/database.ts']) {
    const config = await eslint.calculateConfigForFile(join(cwd, file));
    assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 0);
    assert.equal(config.rules['@typescript-eslint/no-unsafe-argument'][0], 0);
    assert.equal(config.rules['@typescript-eslint/no-floating-promises'][0], 2);
  }
});
