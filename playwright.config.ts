import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const launchOptions = {
  executablePath: chromePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', launchOptions },
  webServer: {
    command: 'pnpm exec vite preview packages/client --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, launchOptions } },
  ],
});
