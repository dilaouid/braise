import { expect, test } from '@playwright/test';
import { FR, capture, expectFocus, fixtureSave, plantSave, settle, toObject, watch } from './harness.ts';

const SHOTS = 'autel';

test('au clavier puis à la souris : une seule infobulle, lisible et dans l\'écran, et l\'évolution réelle', async ({ page }, info) => {
  const seen = watch(page);
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.account.ashes = 100;
  save.account.altar = {};
  save.account.altarDisabled = [];
  await plantSave(page, JSON.stringify(save));
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await settle(page);
  await toObject(page, null, 'altar');
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.altar')).toBeVisible();
  await settle(page);

  await expectFocus(page, 'altar.ardor');
  await expect(page.locator('[data-focus="altar.ardor"] .tip')).toHaveText(FR['altar.ardor.desc']!);
  await expect(page.locator('[data-focus="altar.ardor"] .real')).toHaveText(/100 % → 103 %/);
  const hp = page.locator('[data-focus="altar.endurance"] .real');
  const [from, to] = (await hp.innerText()).match(/\d+/g)!.map(Number);
  expect(to).toBe(Math.round(from! * 1.05));

  const stage = (await page.locator('#stage').boundingBox())!;
  for (const id of await page.locator('.altar [data-focus]').evaluateAll((els) => els.map((e) => e.getAttribute('data-focus')!))) {
    await page.locator(`[data-focus="${id}"]`).hover();
    await expectFocus(page, id);
    const tips = page.locator('.altar .tip:visible');
    await expect(tips).toHaveCount(1);
    const box = (await tips.boundingBox())!;
    expect(box.y, id).toBeGreaterThanOrEqual(stage.y);
    expect(box.x + box.width, id).toBeLessThanOrEqual(stage.x + stage.width);
    await capture(page, info, SHOTS, id.replace('altar.', ''));
  }

  // L'achat fait de la valeur annoncée la nouvelle valeur de départ.
  await page.locator('[data-focus="altar.endurance"]').click();
  await expect(hp).toHaveText(new RegExp(`${to} → `));
  expect(seen).toEqual({ errors: [], foreign: [] });
});
