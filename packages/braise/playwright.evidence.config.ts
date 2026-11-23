import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * Même parcours, mais les captures sont écrites dans `production/qa/evidence/`.
 * `pnpm evidence` s'en sert ; `pnpm test:e2e` ne touche jamais aux captures gardées.
 */
export default defineConfig({ ...base, metadata: { ...base.metadata, evidence: true } });
