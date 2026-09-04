import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkDocuments } from './check-harness.mjs';

async function fixture(t, document) {
  const root = await mkdtemp(join(tmpdir(), 'filmott-harness-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'backend'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { check: 'node check.mjs' } }));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { test: 'jest', 'test:e2e': 'jest' } }));
  await writeFile(join(root, 'guide.md'), document);
  return root;
}

test('실제 파일과 package의 명령을 참조하면 통과한다', async (t) => {
  const root = await fixture(t, '[package](package.json)\n`npm run check`\n`npm --prefix backend run test:e2e`\n`npm --prefix backend test`\n');
  assert.deepEqual(await checkDocuments(root, ['guide.md']), []);
});

test('깨진 링크와 잘못된 실행 package를 발견한다', async (t) => {
  const root = await fixture(t, '[missing](old-plan.md)\n`npm run test:e2e`\n');
  const errors = await checkDocuments(root, ['guide.md']);
  assert.ok(errors.some((error) => error.includes('존재하지 않는 링크 old-plan.md')));
  assert.ok(errors.some((error) => error.includes('./package.json에 없는 script test:e2e')));
});

test('문서 누락과 닫히지 않은 fence를 성공으로 처리하지 않는다', async (t) => {
  const root = await fixture(t, '```bash\n');
  const errors = await checkDocuments(root, ['guide.md', 'missing.md']);
  assert.ok(errors.some((error) => error.includes('code fence')));
  assert.ok(errors.some((error) => error.includes('문서를 읽을 수 없습니다')));
});
