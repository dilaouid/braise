import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, capture, departFromCamp, expectFocus, fixtureSave, plantSave, saveView, settle, skipDepartCinematic, toObject, watch,
} from './harness.ts';

const SHOTS = 'armes';
const WAKE = 'altar.weapon-wake';

/** Une sauvegarde jouée, avec ces Cendres et ces achats. « Inverser A et B » est à faux : ici A valide. */
function saveWith(ashes: number, altar: Record<string, number> = {}): string {
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.settings.swapAB = false;
  save.version = 2;
  save.run = null;
  save.account.ashes = ashes;
  save.account.altar = altar;
  for (const hero of Object.values<any>(save.heroes)) Object.assign(hero, { loadouts: [], equipment: {} });
  return JSON.stringify(save);
}

async function toCamp(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await settle(page);
}

/** Déplace le focus, une direction à la fois, jusqu'à cet élément (d'après sa place à l'écran). */
async function focusTo(page: Page, pad: SimPad, id: string): Promise<void> {
  for (let k = 0; k < 14; k++) {
    const from = page.locator('#ui .is-focused');
    if ((await from.getAttribute('data-focus')) === id) return;
    const a = (await from.boundingBox())!;
    const b = (await page.locator(`[data-focus="${id}"]`).boundingBox())!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    await pad.press(Math.abs(dy) > 20 ? (dy > 0 ? 'DOWN' : 'UP') : dx > 0 ? 'RIGHT' : 'LEFT');
    await page.waitForTimeout(150);
  }
  await expectFocus(page, id);
}

test('à la manette : acheter Sillage à l\'Autel, le désactiver, le rendre au tirage', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith(70));
  await toCamp(page, pad);
  await toObject(page, pad, 'altar');
  await pad.press('A');
  await expect(page.locator('.screen.altar')).toBeVisible();
  await settle(page);

  // Tout l'écran tient dans le panneau, quatre armes comprises.
  const panel = (await page.locator('.altar-panel').boundingBox())!;
  for (const id of ['wake', 'verge', 'storm-watch', 'nightlights']) {
    const box = (await page.locator(`[data-focus="altar.weapon-${id}"]`).boundingBox())!;
    expect(box.y + box.height, id).toBeLessThanOrEqual(panel.y + panel.height);
  }

  await focusTo(page, pad, WAKE);
  await settle(page);
  await expect(page.locator(`[data-focus="${WAKE}"]`)).toContainText(FR[`${WAKE}.desc`]!);
  await pad.press('A');
  await expect(page.locator(`[data-focus="${WAKE}"]`)).toContainText(FR['altar.unlock.open']!);
  const account = (await saveView<any>(page)).account;
  expect(account.altar[WAKE]).toBe(1);
  expect(account.ashes).toBe(40);
  await capture(page, info, SHOTS, 'autel');

  // Trop cher : rien n'est pris.
  await focusTo(page, pad, 'altar.weapon-verge');
  await pad.press('A');
  await page.waitForTimeout(150);
  expect((await saveView<any>(page)).account.ashes).toBe(40);

  // Y la retire du tirage, sans la rendre ; la partie suivante ne la propose pas.
  await focusTo(page, pad, WAKE);
  await pad.press('Y');
  await expect(page.locator(`[data-focus="${WAKE}"]`)).toContainText(FR['altar.disabled']!);
  await pad.press('Y');
  await expect(page.locator(`[data-focus="${WAKE}"]`)).toContainText(FR['altar.unlock.open']!);
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();

  await departFromCamp(page, pad);
  await skipDepartCinematic(page, pad);
  await page.waitForFunction(() => (window as any).__braise.run !== null);
  const pool = await page.evaluate(() => {
    const r = (window as any).__braise.run;
    return { weapons: r.weaponPool.map((i: number) => r.data.weapons[i].id), relics: r.relicPool.map((i: number) => r.data.relics[i].id) };
  });
  expect(pool.weapons).toContain('weapon.wake');
  expect(pool.relics).toContain('relic.copper-sole');
  expect(pool.weapons).not.toContain('weapon.verge');
  expect(seen).toEqual({ errors: [], foreign: [] });
});

test('chaque arme se voit en partie', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith(0));
  await toCamp(page, pad);
  await departFromCamp(page, pad);
  await skipDepartCinematic(page, pad);
  await page.waitForFunction(() => (window as any).__braise.run !== null);
  for (const id of ['verge', 'solstice', 'storm-watch', 'black-storm', 'nightlights', 'garland', 'wake', 'web']) {
    await page.evaluate((weapon) => {
      const braise = (window as any).__braise;
      const r = braise.run;
      const def = r.data.weapons.findIndex((w: any) => w.id === `weapon.${weapon}`);
      Object.assign(r.weapons[0], { def, level: r.data.weapons[def].levels.length, cd: 0, damageDone: 0 });
      r.lamps.length = 0;
      r.threads.length = 0;
      r.cfg.sheet.maxHp = 1e6;
      r.hero.stats.maxHp = 1e6;
      r.hero.hp = 1e6;
      // Assez d'Éteints autour pour voir l'arme frapper : deux minutes de horde.
      for (let k = 0; k < 40 && (r.enemies.count < 40 || r.weapons[0].damageDone === 0); k++) {
        r.hero.hp = 1e6;
        r.hero.dashCharges = 1;
        braise.advance(30, true);
        if (r.phase === 'levelup') braise.actions.takeCard(0);
        else if (r.phase === 'chest') braise.actions.closeChest();
        if (r.data.weapons[r.weapons[0].def].id !== `weapon.${weapon}`) break;
      }
    }, id);
    // Deux vraies ruées, pour tendre des fils (et les croiser).
    await pad.press('A');
    await page.waitForTimeout(350);
    await page.evaluate(() => { const h = (window as any).__braise.run.hero; h.dashCharges = 1; h.hp = 1e6; });
    await pad.press('A');
    await page.waitForTimeout(220);
    const seenInRun = await page.evaluate(() => {
      const r = (window as any).__braise.run;
      // L'éclair ne dure qu'un instant : il repart juste avant la capture.
      r.weapons[0].cd = 0;
      return { done: r.weapons[0].damageDone, threads: r.threads.length };
    });
    if (id === 'wake' || id === 'web') expect(seenInRun.threads, id).toBeGreaterThan(0);
    else expect(seenInRun.done, id).toBeGreaterThan(0);
    await capture(page, info, SHOTS, `arme-${id}`);
  }
  expect(seen).toEqual({ errors: [], foreign: [] });
});
