import { defineConfig, devices } from '@playwright/test';

/** Un port à part : le serveur de développement (5183) et l'aperçu (5184) peuvent rester ouverts. */
const PORT = 5186;

/**
 * Les parcours se jouent sur le site construit, celui qui part sur la console.
 * Chaque lancement reconstruit `dist/` : un parcours ne tourne jamais sur une version périmée.
 */
export default defineConfig({
  testDir: 'tests/integration',
  outputDir: 'test-results',
  // Les parcours se jouent en temps réel : un seul à la fois, pour que l'image reste à 60 par seconde.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // 1280 × 720 : l'image native de 640 × 360, à l'échelle 2.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
