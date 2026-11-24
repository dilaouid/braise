import { expect, test, type Page } from '@playwright/test';
import { SimPad, capture, expectFocus, fixtureSave, plantSave, settle, skipDepartCinematic, watch } from './harness.ts';

const SHOTS = 'cerf';

type Braise = { run: any; cinematic: { shot: string | null } };

/** Une sauvegarde d'exemple, A pour valider. `beaten` : le Cerf déjà battu deux fois. */
function save(beaten: boolean, unlocks: string[] = []): string {
  const s = JSON.parse(fixtureSave(beaten ? 'v1-m1-played' : 'v1-m1-new'));
  s.settings.swapAB = false;
  s.account.unlocks.push(...unlocks);
  return JSON.stringify(s);
}

const shot = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.cinematic.shot);
const bossId = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    return run ? run.data.enemies[run.region.bossIdx].id : null;
  });

/** Du titre au camp, puis « Partir » maintenu jusqu'à ce que l'écran change. */
async function depart(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  await settle(page);
  await pad.down('A');
  await expect(page.locator('.screen.cinematic, .hud').first()).toBeVisible();
  await pad.up('A');
}

test('Cerf jamais battu : l\'appel du Cerf, puis l\'expédition contre le Cerf vivant', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, save(false));
  await depart(page, pad);
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect.poll(() => shot(page)).toBe('p01-loin');
  await capture(page, info, SHOTS, '01-appel');
  await skipDepartCinematic(page, pad);
  expect(await bossId(page)).toBe('boss.lightless-stag');
  expect(seen.errors).toEqual([]);
});

test('Cerf battu : la Cendre, puis l\'expédition contre le Cerf de Cendre', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, save(true));
  await depart(page, pad);
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect.poll(() => shot(page)).toBe('p01-tas');
  await capture(page, info, SHOTS, '02-cendre');
  await skipDepartCinematic(page, pad);
  expect(await bossId(page)).toBe('boss.ash-stag');
  expect(seen.errors).toEqual([]);
});

test('déjà vue : un seul appui sur B passe la cinématique', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, save(true, ['seen.stag-ash']));
  await depart(page, pad);
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.hud')).toBeVisible({ timeout: 1500 });
});

test('les images ne chargent pas : l\'expédition part quand même', async ({ page }) => {
  const pad = await SimPad.install(page);
  await page.route('**/cinematics/stag-call/**', (route) => route.abort());
  await plantSave(page, save(false));
  await depart(page, pad);
  await expect(page.locator('.hud')).toBeVisible();
  expect(await bossId(page)).toBe('boss.lightless-stag');
});
