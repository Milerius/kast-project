import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../docker',
  testMatch: 'smoke.spec.ts',
  use: { baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:3000' },
});
