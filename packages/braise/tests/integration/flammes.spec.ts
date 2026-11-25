import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, capture, departFromCamp, expectFocus, fixtureSave, plantSave, saveView, settle, skipDepartCinematic, toObject, watch,
} from './harness.ts';

const SHOTS = 'flammes';
const EPIC = 'altar.flames-epic';

/** Une sauvegarde jouée, avec assez de Cendres pour un déblocage. « Inverser A et B » est à faux : ici A valide. */
function saveWith(ashes: number): string {
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.settings.swapAB = false;
  save.version = 2;
  save.run = null;
  save.account.ashes = ashes;
  save.account.altar = {};
  for (const hero of Object.values<any>(save.heroes)) Object.assign(hero, { loadouts: [], equipment: {} });
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
  await settle(page);
}

/** Déplace le focus, une direction à la fois, jusqu'à cet élément (d'après sa place à l'écran). */
async function focusTo(page: Page, pad: SimPad, id: string): Promise<void> {
  for (let k = 0; k < 12; k++) {
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

/** Pose Moon sur un totem et avance la partie jusqu'à ce que son écran s'ouvre. */
async function chargeTotem(page: Page): Promise<void> {
  await page.evaluate(() => {
    const braise = (window as any).__braise;
    const r = braise.run;
    r.cfg.sheet.maxHp = 1e6;
    const poi = r.map.pois.find((p: any) => p.kind === 'totem');
    for (let i = 0; i < 600 && r.phase !== 'totem'; i++) {
      r.hero.hp = 1e6;
      r.hero.x = poi.x;
      r.hero.y = poi.y + 4;
      braise.advance(2, true);
      if (r.phase === 'levelup') braise.actions.takeCard(0);
      else if (r.phase === 'chest') braise.actions.closeChest();
    }
  });
  await expect(page.locator('.backdrop.totem')).toBeVisible();
}

test('à la manette : ouvrir Épique à l\'Autel, nourrir une Flamme au totem, la retrouver en pause', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith(100));
  await toCamp(page, pad);

  // L'Autel : Légendaire demande Épique ; Épique s'achète 60 Cendres.
  await toObject(page, pad, 'altar');
  await pad.press('A');
  await expect(page.locator('.screen.altar')).toBeVisible();
  await settle(page);
  await expect(page.locator('[data-focus="altar.flames-legendary"]')).toContainText(FR['altar.flames-epic.name']!);
  await focusTo(page, pad, EPIC);
  await settle(page);
  await pad.press('A');
  await expect(page.locator(`[data-focus="${EPIC}"]`)).toContainText(FR['altar.unlock.open']!);
  const account = (await saveView<any>(page)).account;
  expect(account.altar[EPIC]).toBe(1);
  expect(account.ashes).toBe(40);
  await capture(page, info, SHOTS, 'autel');
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();

  // La porte montre le porteur et son trait.
  await departFromCamp(page, pad);
  await skipDepartCinematic(page, pad);
  await page.waitForFunction(() => (window as any).__braise.run !== null);
  expect(await run(page, (r) => r.cfg.flameRarity)).toBe(2);

  // Le totem : trois Flammes ; X nourrit la première jusqu'à Épique, pas plus haut.
  await chargeTotem(page);
  await settle(page);
  const cards = page.locator('.card-flame');
  await expect(cards).toHaveCount(3);
  await expectFocus(page, 'flame0');
  const first = cards.nth(0);
  for (let k = 0; k < 3 && (await first.getAttribute('data-rarity')) !== 'epic'; k++) {
    await pad.press('X');
    await page.waitForTimeout(150);
  }
  await expect(first).toHaveAttribute('data-rarity', 'epic');
  await expect(first).toContainText(FR['rarity.epic']!);
  const cost = await page.evaluate(() => {
    const r = (window as any).__braise.run;
    const o = r.totemOffers[0];
    const costs = r.data.flames.costs;
    let total = 0;
    for (let x = 1; x <= o.rarity; x++) total += costs[x];
    return total - (o.gift ? costs[r.data.flames.lines[o.line].first + 1] : 0);
  });
  expect(cost).toBeGreaterThan(0);
  await expect(first).toContainText(FR['totem.cost']!.replace('{points}', String(cost)));
  await expect(page.locator('.totem-glow')).toContainText(`${100 - cost} %`);
  // Rien n'est encore payé ; un cran de plus est fermé à l'Autel.
  expect(await run(page, (r) => r.glowBurned)).toBe(0);
  await pad.press('X');
  await page.waitForTimeout(150);
  await expect(first).toHaveAttribute('data-rarity', 'epic');
  await expect(first).toContainText(FR['totem.block.locked']!);
  // Y reprend un cran, X le remet.
  await pad.press('Y');
  await expect(first).toHaveAttribute('data-rarity', 'rare');
  await pad.press('X');
  await expect(first).toHaveAttribute('data-rarity', 'epic');
  await capture(page, info, SHOTS, 'totem');

  // A prend : la mise est payée, la lanterne rétrécit.
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.backdrop.totem')).toHaveCount(0);
  const after = await run(page, (r) => ({ flames: r.flames, burned: r.glowBurned, glow: r.hero.stats.glow, base: r.data.tuning.hero.glow }));
  expect(after.flames).toHaveLength(1);
  expect(after.flames[0].rarity).toBe(2);
  expect(after.burned).toBe(cost);
  expect(after.glow).toBeLessThan(after.base);

  // La pause montre la Flamme, à sa rareté, et la Lueur qui reste.
  await settle(page);
  await pad.press('START');
  await expect(page.locator('.backdrop.pause .slot.flame.rarity-2')).toHaveCount(1);
  await expect(page.locator('.backdrop.pause .stats')).toContainText('%');
  await capture(page, info, SHOTS, 'pause');
  expect(seen).toEqual({ errors: [], foreign: [] });
});

test('la porte montre le porteur et son trait', async ({ page }, info) => {
  const pad = await SimPad.install(page);
  await plantSave(page, saveWith(0));
  await toCamp(page, pad);
  await toObject(page, pad, 'door');
  await pad.press('A');
  await expect(page.locator('.screen.door')).toBeVisible();
  const carrier = page.locator('.carrier');
  await expect(carrier).toContainText(FR['class.ash-blade.who']!);
  await expect(carrier.locator('.carrier-bonus')).toHaveText(FR['class.ash-blade.trait.bonus']!);
  await expect(carrier.locator('.carrier-malus')).toHaveText(FR['class.ash-blade.trait.malus']!);
  await expect(carrier.locator('.carrier-slot.closed')).toHaveCount(2);
  // Le bandeau ne prend pas le focus : la région reste choisie.
  await expectFocus(page, 'region.ash-woods');
  await capture(page, info, SHOTS, 'porte');
});
