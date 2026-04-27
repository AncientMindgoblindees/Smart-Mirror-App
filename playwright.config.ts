import { defineConfig } from '@playwright/test';


export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:3001',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3001',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

