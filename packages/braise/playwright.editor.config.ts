import { defineConfig, devices } from '@playwright/test';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Les parcours de l'éditeur de texte (`pnpm test:editor`), contre le serveur de développement.
 * Ils n'écrivent jamais dans le vrai `content/` : le serveur lit une copie temporaire,
 * désignée par BRAISE_CONTENT_DIR (les processus des tests en héritent).
 */
const PORT = 5187;
const HERE = dirname(fileURLToPath(import.meta.url));

if (!process.env.BRAISE_CONTENT_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'braise-editeur-e2e-'));
  cpSync(join(HERE, 'content'), dir, { recursive: true });
  process.env.BRAISE_CONTENT_DIR = dir;
}

export default defineConfig({
  testDir: 'tests/editor',
  globalTeardown: './tests/editor/teardown.ts',
  outputDir: 'test-results/editor',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/editor.html`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BRAISE_CONTENT_DIR: process.env.BRAISE_CONTENT_DIR },
  },
});
