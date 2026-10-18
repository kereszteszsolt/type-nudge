import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/desktop',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
