import { expect, test } from '@playwright/test';
import { FR, SimPad, capture, expectFocus, fixtureSave, plantSave, saveView, settle, skipIntro, skipTutorial, storageKey, watch } from './harness.ts';

const SHOTS = 'sauvegardes';
const CLASS = 'class.ash-blade';

test('une sauvegarde du jalon M1 se charge en v2, et son fichier d\'origine est gardé en copie de secours', async ({ page }, info) => {
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
  // Le format est celui du jalon M2 : les héros ont leurs dispositions et leur équipement, vides.
  expect(loaded.version).toBe(2);
  expect(loaded.run).toBeNull();
  expect(loaded.heroes[CLASS].talents).toEqual({});
  expect(loaded.heroes[CLASS].loadouts).toEqual([]);
  expect(loaded.heroes[CLASS].equipment).toEqual({});
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

  // Tant que rien ne change, le fichier de M1 reste tel quel sur le disque.
  const stored = (file: string): Promise<string | null> => page.evaluate((key) => localStorage.getItem(key), storageKey(file));
  expect(await stored('save.json')).toBe(fixtureSave('v1-m1-played'));
  // Un changement (Y réactive Sagesse) : le fichier est réécrit en v2, et l'original v1 part dans save.bak1.
  await pad.press('DOWN');
  await pad.press('RIGHT');
  await expectFocus(page, 'altar.wisdom');
  await pad.press('Y');
  expect((await saveView(page)).account.altarDisabled).toEqual([]);
  await expect.poll(async () => JSON.parse((await stored('save.json'))!).version).toBe(2);
  const written = JSON.parse((await stored('save.json'))!);
  expect(written.account.altarDisabled).toEqual([]);
  expect(written.account.ashes).toBe(m1.account.ashes);
  expect(written.heroes[CLASS]).toMatchObject({ level: m1.heroes[CLASS].level, loadouts: [], equipment: {} });
  expect(await stored('save.bak1')).toBe(fixtureSave('v1-m1-played'));

  // Au rechargement, c'est la v2 qui est lue.
  await page.reload();
  await expect(page.locator('.screen.title')).toBeVisible();
  await expect(page.locator('.notice')).toHaveCount(0);
  const again = await saveView(page);
  expect(again.version).toBe(2);
  expect(again.account.altarDisabled).toEqual([]);
  expect(again.heroes[CLASS].level).toBe(m1.heroes[CLASS].level);

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
  await skipIntro(page);
  await skipTutorial(page);
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
  await skipIntro(page);
  await skipTutorial(page);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.camp-info')).toContainText(FR['camp.hero']!.replace('{level}', '1'));
});
