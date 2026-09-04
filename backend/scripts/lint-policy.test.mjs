import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({ cwd, cache: false });

for (const [name, rule, source] of [
  ['프로덕션 any', '@typescript-eslint/no-explicit-any', 'export type Probe = any;\n'],
  ['미처리 Promise', '@typescript-eslint/no-floating-promises', 'export function probe(): void {\n  Promise.resolve();\n}\n'],
  ['검증하지 않은 인자', '@typescript-eslint/no-unsafe-argument', 'declare const input: any;\nexport const output = decodeURIComponent(input);\n'],
]) {
  test(`${name}를 경고가 아닌 오류로 거부한다`, async () => {
    const [result] = await eslint.lintText(source, { filePath: `${cwd}/src/app.service.ts` });
    assert.ok(result.messages.some((message) => message.ruleId === rule && message.severity === 2));
  });
}

test('타입을 좁힌 입력과 기다린 Promise는 통과한다', async () => {
  const [result] = await eslint.lintText(
    "export async function probe(input: unknown): Promise<string> {\n  await Promise.resolve();\n  return typeof input === 'string' ? decodeURIComponent(input) : '';\n}\n",
    { filePath: `${cwd}/src/app.service.ts` },
  );
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test('any와 unsafe 인자 예외는 unit 및 DB 테스트에만 적용된다', async () => {
  for (const file of ['src/app.service.spec.ts', 'test/app.e2e-spec.ts', 'test/integration/helpers/database.ts']) {
    const config = await eslint.calculateConfigForFile(`${cwd}/${file}`);
    assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 0);
    assert.equal(config.rules['@typescript-eslint/no-unsafe-argument'][0], 0);
    assert.equal(config.rules['@typescript-eslint/no-floating-promises'][0], 2);
  }
});
