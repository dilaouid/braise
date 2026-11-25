import { expect, test } from '@playwright/test';
import {
  SimPad, departFromCamp, expectFocus, fastForward, fixtureSave, plantSave, runView, settle, skipDepartCinematic, watch,
} from './harness.ts';

const STEPS_PER_SECOND = 60;

/** A valide une carte et lance aussi la ruée : choisir une carte ne doit pas faire courir le héros. */
test('choisir une carte avec A maintenu ne lance pas de ruée', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  const s = JSON.parse(fixtureSave('v1-m1-played'));
  s.settings.swapAB = false;
  s.account.unlocks.push('seen.stag-ash');
  await plantSave(page, JSON.stringify(s));

  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'door');
  await departFromCamp(page, pad);
  await skipDepartCinematic(page, pad);

  const view = await fastForward(page, 3 * 60 * STEPS_PER_SECOND, true);
  expect(view.phase).toBe('levelup');
  await expect(page.locator('.backdrop.levelup')).toBeVisible();
  await settle(page);
  const before = (await runView(page))!;
  expect(before.dashCd).toBe(0);

  // A reste enfoncé : il choisit la carte, puis la partie reprend avec A toujours maintenu.
  await pad.down('A');
  await expect.poll(async () => (await runView(page))!.phase).toBe('playing');
  const after = (await runView(page))!;
  expect(after.dashCd).toBe(0);
  await page.waitForTimeout(500);
  // Même au-delà de la garde, le bouton maintenu depuis le choix reste ignoré jusqu'à son relâchement.
  expect((await runView(page))!.dashCd).toBe(0);
  await pad.up('A');

  expect(seen.errors).toEqual([]);
});
