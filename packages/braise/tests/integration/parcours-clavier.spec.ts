import { expect, test } from '@playwright/test';
import { expectFocus, runView, settle, watch } from './harness.ts';

/** Le même jeu au clavier seul : menus, départ maintenu, pause. */
test('au clavier : titre, camp, Autel, départ maintenu, pause', async ({ page }) => {
  const seen = watch(page);
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });

  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  // Les invites montrent des touches, pas des boutons de manette.
  await expect(page.locator('.helpbar .glyph-confirm')).toHaveText('Entrée');

  await page.keyboard.press('ArrowDown', { delay: 60 });
  await expectFocus(page, 'altar');
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.altar')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'altar');

  await page.keyboard.press('ArrowUp', { delay: 60 });
  await expectFocus(page, 'depart');
  await settle(page);
  await page.keyboard.down('Enter');
  await expect(page.locator('.hud')).toBeVisible();
  await page.keyboard.up('Enter');
  await settle(page);

  const start = (await runView(page))!;
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  expect((await runView(page))!.x).toBeGreaterThan(start.x + 30);

  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  await expectFocus(page, 'resume');
  await settle(page);
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.backdrop.pause')).toBeHidden();

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});
