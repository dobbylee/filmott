import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT ?? '3200';
const fixtureBackendPort = process.env.E2E_FIXTURE_BACKEND_PORT ?? '3201';
const baseURL =
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;
const fixtureBackendURL =
  process.env.E2E_FIXTURE_BACKEND_URL ?? `http://127.0.0.1:${fixtureBackendPort}`;

for (const [name, value, port] of [
  ['E2E_BASE_URL', baseURL, frontendPort],
  ['E2E_FIXTURE_BACKEND_URL', fixtureBackendURL, fixtureBackendPort],
]) {
  const url = new URL(value);
  if (
    !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535 ||
    url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== port || url.pathname !== '/' || url.search || url.hash || url.username || url.password
  ) {
    throw new Error(`${name}는 해당 테스트 포트의 로컬 HTTP origin이어야 합니다.`);
  }
}
if (frontendPort === fixtureBackendPort) {
  throw new Error('app과 fixture 테스트 포트는 달라야 합니다.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: [
    {
      command: 'npm run test:e2e:fixture',
      url: `${fixtureBackendURL}/health`,
      env: { E2E_FIXTURE_BACKEND_PORT: fixtureBackendPort },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 30_000,
    },
    {
      command: 'npm run test:e2e:app',
      url: baseURL,
      env: {
        NEXT_PUBLIC_API_URL: `${fixtureBackendURL}/api`,
        PORT: frontendPort,
      },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 300_000,
    },
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
