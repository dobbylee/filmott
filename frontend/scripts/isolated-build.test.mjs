import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { prepareWorkspace, runIsolated } from './isolated-build.mjs';

test('Playwright가 다른 서버 URL과 겹치는 포트를 거부한다', () => {
  const configUrl = new URL('../playwright.config.ts', import.meta.url).href;
  const script = `import ${JSON.stringify(configUrl)};`;
  const env = { ...process.env, E2E_FRONTEND_PORT: '3200', E2E_FIXTURE_BACKEND_PORT: '3201', E2E_BASE_URL: 'http://127.0.0.1:3200', E2E_FIXTURE_BACKEND_URL: 'http://127.0.0.1:3201' };
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, stdio: 'pipe' }));
  for (const override of [
    { E2E_BASE_URL: 'https://filmott.kr' },
    { E2E_FIXTURE_BACKEND_URL: 'http://127.0.0.1:3301' },
    { E2E_FRONTEND_PORT: '3201', E2E_BASE_URL: 'http://127.0.0.1:3201' },
  ]) {
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...env, ...override }, stdio: 'pipe' }));
  }
});

async function fixture(t, buildSource) {
  const root = await mkdtemp(join(tmpdir(), 'filmott-isolation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'node_modules/next/dist/bin'), { recursive: true });
  await mkdir(join(root, '.next'), { recursive: true });
  await mkdir(join(root, 'public'));
  await writeFile(join(root, '.next/development-marker'), 'developer output');
  await writeFile(join(root, 'next-env.d.ts'), 'developer types');
  await writeFile(join(root, '.env.local'), 'LOCAL_ONLY=do-not-copy');
  await writeFile(join(root, 'node_modules/next/dist/bin/next'), buildSource);
  return root;
}

test('소스와 생성 파일을 격리하고 로컬 환경 파일은 복사하지 않는다', async (t) => {
  const root = await fixture(t, '');
  const workspace = await prepareWorkspace(root);
  const entries = await readdir(workspace);
  assert.ok(entries.includes('node_modules'));
  assert.ok(!entries.includes('.env.local'));
  assert.ok(!entries.includes('.next'));
  assert.ok(!entries.includes('next-env.d.ts'));
  assert.ok(!entries.includes('.harness'));
});

test('빌드가 생성 타입을 쓰더라도 개발 산출물은 유지하고 임시 작업을 정리한다', async (t) => {
  const root = await fixture(t, "require('node:fs').writeFileSync('next-env.d.ts', 'test types');");
  await runIsolated({ sourceRoot: root });
  assert.equal(await readFile(join(root, 'next-env.d.ts'), 'utf8'), 'developer types');
  assert.equal(await readFile(join(root, '.next/development-marker'), 'utf8'), 'developer output');
  assert.deepEqual(await readdir(join(root, '.harness')), []);
});

test('실패한 빌드는 성공으로 처리하지 않고 작업 디렉터리를 정리한다', async (t) => {
  const root = await fixture(t, 'process.exit(7);');
  await assert.rejects(runIsolated({ sourceRoot: root }), /7/);
  assert.deepEqual(await readdir(join(root, '.harness')), []);
});

test('서버 중단 시 종료 신호를 무시하는 하위 process와 작업 디렉터리까지 정리한다', { timeout: 15000 }, async (t) => {
  const descendantSource = "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.env.FILMOTT_HARNESS_ROOT + '/descendant.pid', String(process.pid)); setInterval(() => {}, 1000);";
  const serverSource = `
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}], { stdio: 'inherit' });
    require('node:fs').writeFileSync(process.env.FILMOTT_HARNESS_ROOT + '/server.pid', String(process.pid));
    setInterval(() => {}, 1000);
  `;
  const root = await fixture(t, `
    const fs = require('node:fs');
    const path = require('node:path');
    const app = path.join('.next/standalone', path.relative(process.env.FILMOTT_HARNESS_ROOT, process.cwd()));
    fs.mkdirSync(app, { recursive: true });
    fs.mkdirSync('.next/static', { recursive: true });
    fs.writeFileSync(path.join(app, 'server.js'), ${JSON.stringify(serverSource)});
  `);
  const script = `import { runIsolated } from ${JSON.stringify(new URL('./isolated-build.mjs', import.meta.url).href)}; await runIsolated({ sourceRoot: ${JSON.stringify(root)}, serve: true }).catch(() => { process.exitCode = 1; });`;
  const runner = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' });
  let output = '';
  runner.stdout.on('data', (data) => { output += data; });
  runner.stderr.on('data', (data) => { output += data; });
  const closed = once(runner, 'close');
  t.after(() => { if (runner.exitCode === null) runner.kill('SIGTERM'); });
  let serverPid;
  let descendantPid;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      serverPid = Number(await readFile(join(root, 'server.pid'), 'utf8'));
      descendantPid = Number(await readFile(join(root, 'descendant.pid'), 'utf8'));
      break;
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(50);
  }
  assert.ok(serverPid && descendantPid, `격리 서버와 하위 process가 시작되어야 한다: ${output}`);
  t.after(() => {
    try { process.kill(descendantPid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
  runner.kill('SIGTERM');
  await closed;
  assert.throws(() => process.kill(serverPid, 0), { code: 'ESRCH' });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { process.kill(descendantPid, 0); }
    catch (error) { if (error.code === 'ESRCH') break; throw error; }
    await delay(20);
  }
  assert.throws(() => process.kill(descendantPid, 0), { code: 'ESRCH' });
  assert.deepEqual(await readdir(join(root, '.harness')), []);
});
