import { expect, test, type Page } from '@playwright/test';
import { FR, SimPad, capture, expectFocus, runView, settle, skipIntro, watch } from './harness.ts';

const SHOTS = 'carte-vivante';

type Kind = 'totem' | 'smith' | 'herbalist' | 'treasure';

/** Pose le héros sur le n-ième lieu de la sorte demandée, et le soigne. */
function goTo(page: Page, kind: Kind, n = 0): Promise<void> {
  return page.evaluate(([k, index]) => {
    const run = (window as unknown as { __braise: { run: any } }).__braise.run;
    const poi = run.map.pois.filter((p: { kind: string }) => p.kind === k)[index as number];
    run.hero.x = poi.x;
    run.hero.y = poi.y + 4;
    run.hero.px = run.hero.x;
    run.hero.py = run.hero.y;
    run.hero.hp = run.hero.stats.maxHp;
  }, [kind, n] as const);
}

/** Ce que la carte vivante ajoute à l'état d'une expédition. */
function placesView(page: Page): Promise<{ boons: number; finds: number; gold: number; spent: number; flasks: number }> {
  return page.evaluate(() => {
    const run = (window as unknown as { __braise: { run: any } }).__braise.run;
    return { boons: run.boons.length, finds: run.finds.length, gold: run.hero.gold, spent: run.hero.goldSpent, flasks: run.hero.stats.flasks };
  });
}

/**
 * Laisse la partie tourner jusqu'à la phase attendue. Le héros est soigné en chemin, et une montée
 * de niveau ou un coffre survenus entre-temps sont validés avec A.
 */
async function until(page: Page, pad: SimPad, phase: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const view = (await runView(page))!;
    if (view.phase === phase) return;
    if (view.phase === 'levelup' || view.phase === 'chest') {
      await settle(page);
      await pad.press('A');
      continue;
    }
    await page.evaluate(() => {
      const run = (window as unknown as { __braise: { run: any } }).__braise.run;
      run.hero.hp = run.hero.stats.maxHp;
    });
    await page.waitForTimeout(150);
  }
  throw new Error(`La phase « ${phase} » n'est jamais arrivée (${(await runView(page))!.phase})`);
}

test('totem, Ferrailleur, Herboriste et trésor à la manette seule', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await skipIntro(page, pad);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  await settle(page);
  await pad.down('A');
  await expect(page.locator('.hud')).toBeVisible();
  await pad.up('A');
  await settle(page);

  // --- Totem : rester dans le cercle, puis choisir un buff ---------------------------------
  await goTo(page, 'totem');
  await page.waitForTimeout(600);
  await capture(page, info, SHOTS, '01-totem-en-charge');
  await until(page, pad, 'totem');
  await expect(page.locator('.backdrop.totem')).toBeVisible();
  await expect(page.locator('.backdrop.totem h1')).toHaveText(FR['totem.title']!);
  await expect(page.locator('.backdrop.totem .card')).toHaveCount(3);
  await expectFocus(page, 'boon0');
  await capture(page, info, SHOTS, '02-totem-choix');
  await pad.press('RIGHT');
  await expectFocus(page, 'boon1');
  // B ne ferme pas : le choix est obligatoire.
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.backdrop.totem')).toBeVisible();
  await pad.press('A');
  await expect(page.locator('.backdrop.totem')).toBeHidden();
  expect((await placesView(page)).boons).toBe(1);

  // --- Ferrailleur : sans or, tout est grisé et B ferme -------------------------------------
  await page.evaluate(() => {
    (window as unknown as { __braise: { run: any } }).__braise.run.hero.gold = 0;
  });
  await goTo(page, 'smith');
  await until(page, pad, 'shop');
  await expect(page.locator('.backdrop.shop h1')).toHaveText(FR['shop.smith.title']!);
  await expect(page.locator('.backdrop.shop .card')).toHaveCount(3);
  await expect(page.locator('.backdrop.shop .card.card-off')).toHaveCount(3);
  await settle(page);
  await pad.press('A');
  expect((await placesView(page)).spent).toBe(0);
  await pad.press('B');
  await expect(page.locator('.backdrop.shop')).toBeHidden();
  // Resté dans le cercle : la boutique ne se rouvre pas.
  await page.waitForTimeout(1200);
  expect((await runView(page))!.phase).not.toBe('shop');

  // --- Ferrailleur : avec de l'or, on achète, la boutique reste ouverte ---------------------
  await page.evaluate(() => {
    (window as unknown as { __braise: { run: any } }).__braise.run.hero.gold = 1000;
  });
  await goTo(page, 'smith', 1);
  await until(page, pad, 'shop');
  await expectFocus(page, 'item0');
  await capture(page, info, SHOTS, '03-ferrailleur');
  // On achète la dernière carte : elle disparaît, et le focus doit retomber sur une carte restante.
  await pad.press('RIGHT');
  await pad.press('RIGHT');
  await expectFocus(page, 'item2');
  await settle(page);
  await pad.press('A');
  const afterSmith = await placesView(page);
  expect(afterSmith.spent).toBeGreaterThan(0);
  expect(afterSmith.gold).toBe(1000 - afterSmith.spent);
  await expect(page.locator('.backdrop.shop')).toBeVisible();
  await expect(page.locator('.backdrop.shop .card')).toHaveCount(2);
  await expectFocus(page);
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.backdrop.shop')).toBeHidden();

  // --- Herboriste : une fiole de plus -------------------------------------------------------
  const flasks = afterSmith.flasks;
  await goTo(page, 'herbalist');
  await until(page, pad, 'shop');
  await expect(page.locator('.backdrop.shop h1')).toHaveText(FR['shop.herbalist.title']!);
  await expect(page.locator('.backdrop.shop .card')).toHaveCount(4);
  await expectFocus(page, 'item0');
  await capture(page, info, SHOTS, '04-herboriste');
  await settle(page);
  await pad.press('A');
  expect((await placesView(page)).flasks).toBe(flasks + 1);
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.backdrop.shop')).toBeHidden();

  // --- Trésor : une trouvaille --------------------------------------------------------------
  await goTo(page, 'treasure');
  await until(page, pad, 'find');
  await expect(page.locator('.backdrop.find h1')).toHaveText(FR['find.title']!);
  await expectFocus(page, 'ok');
  await capture(page, info, SHOTS, '05-trouvaille');
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.backdrop.find')).toBeHidden();
  expect((await placesView(page)).finds).toBe(1);

  // --- La pause montre buffs et trouvailles --------------------------------------------------
  await until(page, pad, 'playing');
  await pad.press('START');
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  await expect(page.locator('.backdrop.pause .extras .slot')).toHaveCount(2);
  await capture(page, info, SHOTS, '06-pause-buffs-et-trouvailles');
  await pad.press('START');

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});
