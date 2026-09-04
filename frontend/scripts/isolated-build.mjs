import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set([
  '.git', '.harness', '.next', 'node_modules', 'coverage',
  'playwright-report', 'test-results', 'next-env.d.ts', '.DS_Store',
]);

export async function prepareWorkspace(sourceRoot) {
  const parent = join(sourceRoot, '.harness');
  await mkdir(parent, { recursive: true });
  if ((await lstat(parent)).isSymbolicLink()) {
    throw new Error('격리 작업 디렉터리는 symlink일 수 없습니다.');
  }
  const workspace = await mkdtemp(join(parent, 'build-'));
  try {
    for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.name.startsWith('.env') || entry.name.endsWith('.tsbuildinfo')) continue;
      if (entry.isSymbolicLink()) throw new Error(`소스 symlink를 복사하지 않습니다: ${entry.name}`);
      await cp(join(sourceRoot, entry.name), join(workspace, entry.name), { recursive: true });
    }
    await symlink(join(sourceRoot, 'node_modules'), join(workspace, 'node_modules'), 'dir');
    return workspace;
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

function signalChild(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function runIsolated({ sourceRoot = frontendRoot, serve = false } = {}) {
  sourceRoot = await realpath(sourceRoot);
  let workspace;
  let child;
  let interrupted;
  let killTimer;
  const stop = (signal) => {
    interrupted ??= signal;
    signalChild(child, signal);
    if (child && !killTimer) {
      killTimer = setTimeout(() => signalChild(child, 'SIGKILL'), 5000);
      killTimer.unref();
    }
  };
  const onTerm = () => stop('SIGTERM');
  const onInt = () => stop('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);

  const run = async (args, cwd, env) => {
    if (interrupted) throw new Error(`격리 검증 중단: ${interrupted}`);
    await new Promise((resolveRun, rejectRun) => {
      const launchedChild = spawn(process.execPath, args, {
        cwd, env, stdio: 'inherit', detached: process.platform !== 'win32',
      });
      child = launchedChild;
      launchedChild.once('error', rejectRun);
      launchedChild.once('close', (code, signal) => {
        // 대표 process가 먼저 끝나도 같은 그룹의 worker는 남을 수 있다.
        // workspace를 삭제하기 전에 이 실행이 만든 잔여 그룹을 종료한다.
        signalChild(launchedChild, 'SIGKILL');
        clearTimeout(killTimer);
        killTimer = undefined;
        child = undefined;
        if (code === 0 && !interrupted) resolveRun();
        else rejectRun(new Error(`격리 검증 종료: ${signal ?? code}${interrupted ? ` (${interrupted})` : ''}`));
      });
    });
  };

  try {
    workspace = await prepareWorkspace(sourceRoot);
    const env = {
      ...process.env,
      FILMOTT_HARNESS_ROOT: sourceRoot,
      NEXT_TELEMETRY_DISABLED: '1',
    };
    await run([join(sourceRoot, 'node_modules/next/dist/bin/next'), 'build'], workspace, env);
    if (serve) {
      const standalone = join(workspace, '.next/standalone', relative(sourceRoot, workspace));
      await cp(join(workspace, '.next/static'), join(standalone, '.next/static'), { recursive: true });
      await cp(join(workspace, 'public'), join(standalone, 'public'), { recursive: true });
      await run([join(standalone, 'server.js')], standalone, { ...env, HOSTNAME: '127.0.0.1' });
    }
  } finally {
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
    clearTimeout(killTimer);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== 'build' && mode !== 'serve') {
    console.error('Usage: isolated-build.mjs build|serve');
    process.exitCode = 1;
  } else {
    await runIsolated({ serve: mode === 'serve' }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
