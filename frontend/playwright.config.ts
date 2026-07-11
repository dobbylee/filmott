import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT ?? '3000';
const baseURL =
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;
const fixtureBackendURL =
  process.env.E2E_FIXTURE_BACKEND_URL ?? 'http://127.0.0.1:3101';

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
      reuseExistingServer: false,
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
      timeout: 180_000,
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
