import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, capture, expectFocus, fixtureSave, openDoor, plantSave, runView, settle, skipIntro, skipTutorial, toObject, waitFrames, watch,
} from './harness.ts';

const SHOTS = 'refuge';

/** Une sauvegarde jouée, au souvenir déjà repris. « Inverser A et B » est à faux : ici A valide. */
function played(): string {
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.settings.swapAB = false;
  save.account.unlocks.push('memory.meeting');
  return JSON.stringify(save);
}

async function toCamp(page: Page, pad: SimPad | null): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  if (pad) await pad.press('A');
  else await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await settle(page);
}

const moon = (page: Page): Promise<{ x: number; y: number; goal: unknown }> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as any).__braise.camp)));

test('Moon marche au stick, et A n\'ouvre que ce qui est près de lui', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, played());
  await toCamp(page, pad);
  await expectFocus(page, 'door');
  await capture(page, info, SHOTS, '01-arrivee');
  // Plus de menu : les objets seulement.
  await expect(page.locator('.menu-button')).toHaveCount(0);
  await expect(page.locator('.camp-object')).toHaveCount(5);

  // Vers le bas, loin de tout : rien au focus, et A ne fait rien.
  const before = await moon(page);
  await pad.stick(0, 1);
  await page.waitForTimeout(900);
  await pad.stick(0, 0);
  expect((await moon(page)).y).toBeGreaterThan(before.y + 50);
  await expect(page.locator('#ui .is-focused')).toHaveCount(0);
  await pad.press('A');
  await waitFrames(page, 5);
  await expect(page.locator('.screen.camp')).toBeVisible();
  // B non plus.
  await pad.press('B');
  await waitFrames(page, 5);
  await expect(page.locator('.screen.camp')).toBeVisible();

  // De retour vers le haut : la porte de nouveau.
  await pad.stick(-0.4, -1);
  await page.waitForTimeout(700);
  await pad.stick(0, 0);
  await expectFocus(page, 'door');
  expect(seen).toEqual({ errors: [], foreign: [] });
});

test('la croix saute d\'un objet à l\'autre et Moon y marche ; chaque objet s\'ouvre', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, played());
  await toCamp(page, pad);
  await pad.press('LEFT');
  await waitFrames(page, 3);
  const first = await page.locator('#ui .is-focused').getAttribute('data-focus');
  expect(['cream', 'lantern', 'memories', 'altar']).toContain(first);
  expect((await moon(page)).goal).not.toBeNull();
  // Le stick reprend la main.
  await pad.stick(1, 0);
  await waitFrames(page, 3);
  expect((await moon(page)).goal).toBeNull();
  await pad.stick(0, 0);

  for (const [id, screen] of [['altar', 'altar'], ['lantern', 'lantern'], ['memories', 'memories'], ['door', 'door']] as const) {
    await toObject(page, pad, id);
    await pad.press('A');
    await expect(page.locator(`.screen.${screen}`)).toBeVisible();
    await settle(page);
    await pad.press('B');
    await expect(page.locator('.screen.camp')).toBeVisible();
    // Moon est à côté de ce qu'il a ouvert, et ne repart pas.
    await expectFocus(page, id);
    const here = await moon(page);
    await page.waitForTimeout(300);
    expect(await moon(page)).toEqual(here);
  }
});

test('rester appuyé sur A ne fait pas partir', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, played());
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.down('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await pad.up('A');
  await settle(page);
  // À la porte : le A qui l'ouvre, gardé appuyé, ne compte pas comme le maintien du départ.
  await pad.down('A');
  await expect(page.locator('.screen.door')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.screen.door')).toBeVisible();
  expect(await runView(page)).toBeNull();
  await pad.up('A');
});

test('pendant une réplique, Moon ne bouge pas', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, played());
  await toCamp(page, pad);
  await toObject(page, pad, 'cream');
  await expect.poll(async () => (await moon(page)).goal).toBeNull();
  await pad.press('A');
  await expect(page.locator('.dialogue')).toBeVisible();
  const here = await moon(page);
  await pad.stick(1, 0);
  await page.waitForTimeout(500);
  expect((await moon(page)).x).toBe(here.x);
  await pad.stick(0, 0);
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.dialogue')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect((await moon(page)).x).toBe(here.x);
});

test('sauvegarde neuve, au clavier : porte, Autel, Lanterne, Cream ; pas de Souvenirs', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await skipIntro(page);
  await skipTutorial(page);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await settle(page);
  await expect(page.locator('[data-focus="memories"]')).toHaveCount(0);
  for (const id of ['altar', 'lantern', 'cream', 'door']) await toObject(page, null, id);
  // Les objets sont apparus après la scène.
  await page.waitForTimeout(1200);
  await capture(page, info, SHOTS, '02-neuf');
  // Les flèches font marcher Moon.
  const before = await moon(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  expect((await moon(page)).y).toBeGreaterThan(before.y + 15);
  // Échap ouvre les réglages, et en revient.
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.screen.settings')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
});

test('à la souris : un objet, la porte, les réglages', async ({ page }) => {
  await plantSave(page, played());
  await toCamp(page, null);
  await page.locator('[data-focus="altar"]').hover();
  await expectFocus(page, 'altar');
  await page.locator('[data-focus="altar"]').click();
  await expect(page.locator('.screen.altar')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await page.locator('.camp-settings').click();
  await expect(page.locator('.screen.settings')).toBeVisible();
});

test('la porte : une région, quatre cartes fermées, les records', async ({ page }, info) => {
  const pad = await SimPad.install(page);
  await plantSave(page, played());
  await toCamp(page, pad);
  await openDoor(page, pad);
  await expect(page.locator('.door-card')).toHaveCount(5);
  await expect(page.locator('.door-card.closed')).toHaveCount(4);
  await expect(page.locator('[data-focus="region.ash-woods"]')).toContainText(FR['region.ash-woods.name']!);
  await expect(page.locator('.door-records')).toContainText('24');
  // Les cartes fermées ne prennent pas le focus.
  await pad.press('RIGHT');
  await expectFocus(page, 'region.ash-woods');
  await capture(page, info, SHOTS, '03-porte');
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();
});
