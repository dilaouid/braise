import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, capture, expectFocus, fixtureSave, plantSave, saveView, settle, skipDepartCinematic, storedSave, watch,
} from './harness.ts';

const SHOTS = 'lanterne';

interface Lantern { owned: string[]; seen: string[]; faces: Array<string | null>; opened: number; wins: number }

/** Une sauvegarde jouée, au souvenir déjà repris, avec cette Lanterne. « Inverser A et B » est à faux : ici A valide. */
function saveWith(lantern: Partial<Lantern>): string {
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.settings.swapAB = false;
  save.version = 2;
  save.run = null;
  save.account.unlocks.push('memory.meeting');
  for (const hero of Object.values<any>(save.heroes)) Object.assign(hero, { loadouts: [], equipment: {} });
  save.account.lantern = { owned: [], seen: [], faces: [null, null, null, null], opened: 1, wins: 0, ...lantern };
  return JSON.stringify(save);
}

const run = <T>(page: Page, f: (r: any) => T): Promise<T> =>
  page.evaluate(`(${f.toString()})(window.__braise.run)`) as Promise<T>;

async function toCamp(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  await settle(page);
}

async function toLantern(page: Page, pad: SimPad): Promise<void> {
  await pad.press('DOWN');
  await expectFocus(page, 'altar');
  await pad.press('DOWN');
  await expectFocus(page, 'lantern');
  await pad.press('A');
  await expect(page.locator('.screen.lantern')).toBeVisible();
  await expectFocus(page, 'face-1');
  await settle(page);
}

async function depart(page: Page, pad: SimPad): Promise<void> {
  await settle(page);
  while ((await page.locator('#ui .is-focused').getAttribute('data-focus')) !== 'depart') await pad.press('UP');
  await pad.down('A');
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await pad.up('A');
  await skipDepartCinematic(page, pad);
  await page.waitForFunction(() => (window as any).__braise.run !== null);
}

const faces = async (page: Page): Promise<Array<string | null>> => (await saveView<any>(page)).account.lantern.faces;

test('à la manette : poser, échanger, retirer, partir, pause', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({ owned: ['rune.hunger', 'rune.call', 'glass.polished'], opened: 2 }));
  await toCamp(page, pad);
  await expect(page.locator('.badge-lantern')).toBeVisible();
  await toLantern(page, pad);

  // Poser la première rune sur la face 1.
  await pad.press('A');
  await expectFocus(page, 'rune.hunger');
  await settle(page);
  await pad.press('A');
  await expectFocus(page, 'face-1');
  expect(await faces(page)).toEqual(['rune.hunger', null, null, null]);
  await expect(page.locator('[data-focus="face-1"]')).toContainText(`${FR['rune.hunger.name']} I`);

  // Le Verre poli sur la face 2 : l'aperçu montre déjà le niveau II, avant de valider.
  await settle(page);
  await pad.press('RIGHT');
  await expectFocus(page, 'face-2');
  await settle(page);
  await pad.press('A');
  await settle(page);
  while ((await page.locator('#ui .is-focused').getAttribute('data-focus')) !== 'glass.polished') {
    await pad.press((await page.locator('#ui .is-focused').getAttribute('data-focus')) === 'rune.call' ? 'LEFT' : 'DOWN');
  }
  await expect(page.locator('.lantern-face.face-1')).toContainText(`${FR['rune.hunger.name']} II`);
  expect(await faces(page)).toEqual(['rune.hunger', null, null, null]);
  await capture(page, info, SHOTS, 'apercu');
  await pad.press('A');
  await expectFocus(page, 'face-2');
  expect(await faces(page)).toEqual(['rune.hunger', 'glass.polished', null, null]);

  // Une pièce déjà posée échange les deux faces ; B ferme la liste sans rien changer.
  await settle(page);
  await pad.press('A');
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.screen.lantern')).toBeVisible();
  await expectFocus(page, 'face-2');
  expect(await faces(page)).toEqual(['rune.hunger', 'glass.polished', null, null]);
  await settle(page);
  await pad.press('A');
  await settle(page);
  while ((await page.locator('#ui .is-focused').getAttribute('data-focus')) !== 'rune.hunger') await pad.press('UP');
  await pad.press('A');
  await expectFocus(page, 'face-2');
  expect(await faces(page)).toEqual(['glass.polished', 'rune.hunger', null, null]);

  // Retirer, depuis la tête de la liste.
  await settle(page);
  await pad.press('A');
  await settle(page);
  while ((await page.locator('#ui .is-focused').getAttribute('data-focus')) !== 'remove') {
    await pad.press((await page.locator('#ui .is-focused').getAttribute('data-focus')) === 'rune.hunger' ? 'LEFT' : 'UP');
  }
  await pad.press('A');
  await expectFocus(page, 'face-2');
  expect(await faces(page)).toEqual(['glass.polished', null, null, null]);

  // Reposer la Faim, revenir au camp : la pastille a disparu, le focus est sur la Lanterne.
  await settle(page);
  await pad.press('A');
  await settle(page);
  while ((await page.locator('#ui .is-focused').getAttribute('data-focus')) !== 'rune.hunger') await pad.press('UP');
  await pad.press('A');
  await expectFocus(page, 'face-2');
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.badge-lantern')).toHaveCount(0);
  await depart(page, pad);
  expect(await run(page, (r) => ({ mods: r.mods, placed: r.cfg.lantern.placed }))).toMatchObject({
    mods: { gemsPerHeal: 4, noFlask: true }, placed: 2,
  });
  await expect(page.locator('.flasks .spent')).not.toHaveCount(0);

  // La fiole ne sert plus : rien n'est bu.
  await run(page, (r) => {
    r.hero.hp = 10;
    r.hero.stats.regen = 0;
    r.hero.invuln = 99;
  });
  const before = await run(page, (r) => r.hero.flasks);
  await settle(page);
  await pad.press('LB');
  await page.waitForTimeout(200);
  expect(await run(page, (r) => r.hero.flasks)).toBe(before);

  await pad.press('START');
  await expect(page.locator('.lantern-slots .lantern-slot')).toHaveCount(2);
  await capture(page, info, SHOTS, 'pause');
  expect(seen).toEqual({ errors: [], foreign: [] });
});

test('une face fermée dit sa condition et refuse A', async ({ page }, info) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({ owned: ['rune.call'], wins: 2 }));
  await toCamp(page, pad);
  await toLantern(page, pad);
  await pad.press('RIGHT');
  await expectFocus(page, 'face-2');
  await expect(page.locator('.lantern-detail')).toContainText(FR['lantern.unlock.2']!);
  await settle(page);
  await pad.press('A');
  await expectFocus(page, 'face-2');
  await expect(page.locator('.lantern-list.active')).toHaveCount(0);
  await pad.press('DOWN');
  await expectFocus(page, 'face-3');
  await expect(page.locator('.lantern-detail')).toContainText('2 / 3');
  await capture(page, info, SHOTS, 'fermee');
  expect(await faces(page)).toEqual([null, null, null, null]);
});

test('une Lanterne vide le dit, et A n\'ouvre rien', async ({ page }, info) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({}));
  await toCamp(page, pad);
  await expect(page.locator('.badge-lantern')).toHaveCount(0);
  await toLantern(page, pad);
  await expect(page.locator('.lantern-right')).toContainText(FR['lantern.empty']!);
  await pad.press('A');
  await expect(page.locator('.lantern-list.active')).toHaveCount(0);
  await capture(page, info, SHOTS, 'vide');
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();
});

test('à la souris : poser et retirer ; recharger la page garde la pose', async ({ page }) => {
  const seen = watch(page);
  await plantSave(page, saveWith({ owned: ['rune.call'] }));
  await page.goto('./');
  await page.locator('[data-focus="start"]').click();
  await expect(page.locator('.screen.camp')).toBeVisible();
  await page.locator('[data-focus="lantern"]').click();
  await page.locator('[data-focus="face-1"]').click();
  await page.locator('[data-focus="rune.call"]').click();
  // La pose est écrite aussitôt : la page peut se fermer juste après.
  await expect.poll(async () => (await storedSave<any>(page))?.account.lantern.faces[0]).toBe('rune.call');
  await page.reload();
  await page.locator('[data-focus="start"]').click();
  await expect(page.locator('.screen.camp')).toBeVisible();
  await page.locator('[data-focus="lantern"]').click();
  await expect(page.locator('[data-focus="face-1"]')).toContainText(FR['rune.call.name']!);
  await page.locator('[data-focus="face-1"]').click();
  await page.locator('[data-focus="remove"]').click();
  expect(await faces(page)).toEqual([null, null, null, null]);
  expect(seen).toEqual({ errors: [], foreign: [] });
});

test('une première victoire donne une rune : bilan, Lanterne, pastille', async ({ page }, info) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({}));
  await toCamp(page, pad);
  await depart(page, pad);
  expect(await run(page, (r) => r.cfg.lantern.guaranteed)).toBe(true);
  // Le boss tombe pour de bon. Moon est au centre de l'arène : le portail s'ouvre sous ses pieds, et la
  // partie finit avant que la pièce n'ait volé jusqu'à lui. Elle est gardée quand même.
  await page.evaluate(() => {
    const b = (window as any).__braise;
    b.bossNow();
    const r = b.run;
    r.hero.x = r.director.arenaX;
    r.hero.y = r.director.arenaY;
    for (let i = 0; i < r.enemies.count; i++) if (r.enemies.uid[i] === r.director.bossUid) r.enemies.hp[i] = 0;
  });
  await expect(page.locator('.screen.end')).toBeVisible({ timeout: 20_000 });
  const owned = (await saveView<any>(page)).account.lantern.owned as string[];
  expect(owned).toHaveLength(1);
  expect(owned[0]).toMatch(/^rune\./);
  await expect(page.locator('.end-piece').first()).toContainText(FR[`${owned[0]}.name`]!);
  // Le boss battu était le Cerf de Cendre : la deuxième face s'ouvre aussi.
  await expect(page.locator('.end-piece').last()).toContainText('2');
  await capture(page, info, SHOTS, 'bilan');
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.badge-lantern')).toBeVisible();
});

test('mourir avec une pièce la perd', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({ owned: ['rune.call'] }));
  await toCamp(page, pad);
  await depart(page, pad);
  await run(page, (r) => {
    r.piece = { index: 0, taken: true, fromBoss: false };
    r.hero.revives = 0;
    r.hero.stats.regen = 0;
    r.hero.hp = -1;
  });
  await expect(page.locator('.screen.end')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.end-piece.lost')).toContainText(FR['rune.hunger.name']!);
  expect((await saveView<any>(page)).account.lantern.owned).toEqual(['rune.call']);
});

test('rejouer une graine ne donne pas de pièce', async ({ page }) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith({}));
  await toCamp(page, pad);
  await page.evaluate(() => (window as any).__braise.actions.depart(42));
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await skipDepartCinematic(page, pad);
  await page.waitForFunction(() => (window as any).__braise.run !== null);
  expect(await run(page, (r) => r.cfg.lantern)).toMatchObject({ pool: [], guaranteed: false });
});
