import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3101', viewport: { width: 1440, height: 1000 }, browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node build/server/index.js', url: 'http://127.0.0.1:3101/api/health', reuseExistingServer: false, timeout: 30000, env: { PORT: '3101', DATA_DIR: './.e2e-data', DEMO_MODE: 'true' } },
})
