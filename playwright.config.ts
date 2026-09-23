/**
 * Browser checks of the demo build — every screen the demo card can open,
 * driven through the card's own messages (`e2e/demo-a11y.e2e.ts`).
 *
 * The build is the one that ships to the website (`vite build`: no Adminium
 * behind it, the demo's own data), served by `vite preview`. `*.e2e.ts`, not
 * `*.spec.ts`, so vitest never picks these up.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npx vite build --logLevel warn && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
