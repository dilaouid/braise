import { expect, test, type Page } from '@playwright/test';
import { FR, SimPad, capture, expectFocus, fixtureSave, saveView, settle, storageKey, watch } from './harness.ts';

const SHOTS = 'sauvegardes';
const CLASS = 'class.ash-blade';

/** Dépose un fichier de sauvegarde avant le premier chargement de la page, et seulement celui-là. */
async function plantSave(page: Page, text: string): Promise<void> {
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('planted')) return;
    sessionStorage.setItem('planted', '1');
    localStorage.setItem(key!, value!);
  }, [storageKey('save.json'), text] as const);
}

test('une sauvegarde du jalon M1 se charge : héros, Cendres, Autel, réglages', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  const m1 = JSON.parse(fixtureSave('v1-m1-played'));
  await plantSave(page, fixtureSave('v1-m1-played'));
  await page.goto('./');

  await expect(page.locator('.screen.title')).toBeVisible();
  await expect(page.locator('.notice')).toHaveCount(0);
  await settle(page);
  // Cette sauvegarde a « Inverser A et B » : c'est donc B qui valide.
  await pad.press('A');
  await expect(page.locator('.screen.title')).toBeVisible();
  await pad.press('B');

  await expect(page.locator('.screen.camp')).toBeVisible();
  const info1 = page.locator('.camp-info');
  await expect(info1).toContainText(FR['camp.hero']!.replace('{level}', String(m1.heroes[CLASS].level)));
  await expect(info1).toContainText(FR['camp.brazierLit']!);
  await expect(info1).toContainText(String(m1.account.ashes));
  await capture(page, info, SHOTS, '01-m1-camp');

  const loaded = await saveView(page);
  expect(loaded.account.gold).toBe(m1.account.gold);
  expect(loaded.account.ashes).toBe(m1.account.ashes);
  expect(loaded.account.altar).toEqual(m1.account.altar);
  expect(loaded.account.altarDisabled).toEqual(m1.account.altarDisabled);
  expect(loaded.account.regions).toEqual(m1.account.regions);
  expect(loaded.account.codex.kills).toEqual(m1.account.codex.kills);
  expect(loaded.account.stats).toEqual(m1.account.stats);
  expect(loaded.heroes[CLASS].level).toBe(m1.heroes[CLASS].level);
  expect(loaded.heroes[CLASS].xp).toBe(m1.heroes[CLASS].xp);
  expect(loaded.heroes[CLASS].freeAttributes).toEqual(m1.heroes[CLASS].freeAttributes);
  expect(loaded.settings).toMatchObject(m1.settings);
  expect(loaded.createdAt).toBe(m1.createdAt);

  // L'Autel montre les rangs achetés, et le boost désactivé.
  await settle(page);
  await pad.press('DOWN');
  await expectFocus(page, 'altar');
  await pad.press('B');
  await expect(page.locator('.screen.altar')).toBeVisible();
  await expect(page.locator('[data-focus="altar.wisdom"]')).toContainText(FR['altar.disabled']!);
  await expect(page.locator('[data-focus="altar.ardor"] .pip.on')).toHaveCount(m1.account.altar['altar.ardor']);
  await capture(page, info, SHOTS, '02-m1-autel');

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('une sauvegarde plus récente que le jeu est refusée, et rien n\'est écrasé', async ({ page }, info) => {
  const future = JSON.stringify({ version: 999, account: { ashes: 123 }, future: true });
  await plantSave(page, future);
  await page.goto('./');

  await expect(page.locator('.screen.title')).toBeVisible();
  await expect(page.locator('.notice')).toHaveText(FR['save.newer']!);
  await capture(page, info, SHOTS, '03-plus-recente');

  // Le jeu reste jouable sur une partie neuve, mais n'écrit rien par-dessus.
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await page.keyboard.press('ArrowDown', { delay: 60 });
  await page.keyboard.press('ArrowDown', { delay: 60 });
  await expectFocus(page, 'settings');
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.settings')).toBeVisible();
  await page.keyboard.press('ArrowLeft', { delay: 60 });
  // L'écriture est différée de 400 ms : on lui laisse le temps de (ne pas) se faire.
  await page.waitForTimeout(1200);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey('save.json'))).toBe(future);
});

test('une sauvegarde illisible n\'empêche pas de jouer', async ({ page }) => {
  await plantSave(page, '{ ceci n\'est pas du JSON');
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Enter', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.camp-info')).toContainText(FR['camp.hero']!.replace('{level}', '1'));
});
