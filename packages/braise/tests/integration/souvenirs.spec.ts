import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, bossNow, capture, expectFocus, fixtureSave, plantSave, runView, saveView, settle, skipDepartCinematic, storedSave, waitFrames, watch,
} from './harness.ts';

const SHOTS = 'souvenirs';
const MEMORY = 'memory.meeting';
const NAME = FR[`${MEMORY}.name`]!;
const REGION = 'region.ash-woods';

/**
 * Une sauvegarde d'avant les souvenirs : le Cerf y est déjà battu deux fois, sans souvenir. Avec
 * `owned`, le souvenir est déjà là. « Inverser A et B » est remis à faux : ici A valide.
 */
function oldSave(owned: boolean): string {
  const save = JSON.parse(fixtureSave('v1-m1-played'));
  save.settings.swapAB = false;
  if (owned) save.account.unlocks.push(MEMORY);
  return JSON.stringify(save);
}

type Braise = {
  run: any;
  advance(steps: number, stopOnChoice: boolean): string;
  hold(on: boolean): void;
  cinematic: { shot: string | null; advance(seconds: number): void; freeze(on: boolean): void };
};

/** Le lieu laissé par le boss, et ce que la partie sait du souvenir. */
function arena(page: Page): Promise<{ kinds: string[]; memory: string | null; bossDead: boolean; phase: string } | null> {
  return page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    if (!run) return null;
    return {
      kinds: run.map.pois.filter((p: any) => p.kind === 'memory' || p.kind === 'portal').map((p: any) => p.kind),
      memory: run.cfg.memory ?? null, bossDead: run.director.bossDead, phase: run.phase,
    };
  });
}

/** Pose Moon à `dx` pixels du lieu laissé par le boss. */
function standBy(page: Page, dx: number): Promise<void> {
  return page.evaluate((d) => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    const poi = run.map.pois.find((p: any) => p.kind === 'memory' || p.kind === 'portal');
    run.hero.x = poi.x + d;
    run.hero.y = poi.y;
    run.hero.hp = run.hero.stats.maxHp;
  }, dx);
}

const hold = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((v) => (window as unknown as { __braise: Braise }).__braise.hold(v), on);
const shot = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.cinematic.shot);

/** Du titre à l'arène où le boss vient de tomber : le camp, le départ maintenu, le boss amené et battu. */
async function toFallenBoss(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  await settle(page);
  await pad.down('A');
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await pad.up('A');
  await skipDepartCinematic(page, pad);
  await settle(page);
  expect(await bossNow(page)).toBe(true);
  // L'arène se referme autour de Moon : il s'écarte de son centre, là où le boss laissera son lieu.
  await page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    run.hero.x += 90;
  });
  // Le boss n'a plus qu'un point de vie : les armes de Moon le font tomber, en temps réel. Moon est
  // soigné, le boss est gardé à sa portée, et une montée de niveau qui s'ouvre est prise par le robot.
  await expect.poll(async () => {
    await page.evaluate(() => {
      const b = (window as unknown as { __braise: Braise }).__braise;
      const run = b.run;
      if (!run || run.director.bossDead) return;
      run.hero.hp = run.hero.stats.maxHp;
      if (run.phase !== 'playing') {
        b.advance(1, false);
        return;
      }
      const e = run.enemies;
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] !== run.director.bossUid) continue;
        e.hp[i] = 1;
        if (Math.hypot(e.x[i] - run.hero.x, e.y[i] - run.hero.y) > 60) {
          e.x[i] = run.hero.x + 40;
          e.y[i] = run.hero.y;
        }
      }
    });
    return (await arena(page))?.bossDead;
  }, { timeout: 60_000 }).toBe(true);
}

/** Les choix ouverts par le butin du boss (niveaux, coffre) sont pris par le robot, comme un joueur les prendrait. */
function clearChoices(page: Page): Promise<void> {
  return page.evaluate(() => {
    const b = (window as unknown as { __braise: Braise }).__braise;
    for (let k = 0; k < 60 && b.run && b.run.phase !== 'playing' && b.run.phase !== 'victory'; k++) b.advance(1, false);
  });
}

/** Moon s'écarte du lieu, puis marche dessus : la partie est gagnée et quitte l'écran de jeu. */
async function touchPlace(page: Page): Promise<void> {
  await expect.poll(async () => {
    await clearChoices(page);
    return page.evaluate(() => {
      const run = (window as unknown as { __braise: Braise }).__braise.run;
      if (!run) return true;
      const poi = run.map.pois.find((p: any) => p.kind === 'memory' || p.kind === 'portal');
      // Un Souvenir tombé près de Moon attend qu'il se soit écarté.
      run.hero.x = poi.x + (poi.armed ? 0 : 60);
      run.hero.y = poi.y;
      run.hero.hp = run.hero.stats.maxHp;
      return false;
    });
  }, { timeout: 30_000 }).toBe(true);
}

/** B maintenu assez longtemps pour passer une scène. */
async function holdSkip(page: Page, pad: SimPad): Promise<void> {
  await settle(page);
  await pad.down('B');
  await page.waitForTimeout(1400);
  await pad.up('B');
}

test('première victoire : la gemme, la scène, le carton 1 / 5, le bilan avec sa ligne, puis « Souvenirs » au refuge et la scène revue', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, oldSave(false));
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  // Rien n'est encore obtenu : le refuge n'a pas d'entrée « Souvenirs ».
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('[data-focus="memories"]')).toHaveCount(0);

  await toFallenBoss(page, pad);
  // Le Cerf est déjà battu dans cette sauvegarde, mais il garde encore son souvenir : pas de portail.
  const fallen = (await arena(page))!;
  expect(fallen.memory).toBe(MEMORY);
  expect(fallen.kinds).toEqual(['memory']);
  await expect(page.locator('.hud .banner')).toHaveText(FR['hud.memory']!);

  // Moon se tient à côté de la gemme ; le butin du boss vient à lui, et ses choix sont pris.
  for (let k = 0; k < 4; k++) {
    await standBy(page, -64);
    await waitFrames(page, 30);
    await clearChoices(page);
  }
  await expect(page.locator('.backdrop')).toHaveCount(0);
  await standBy(page, -64);
  await waitFrames(page, 3);
  await hold(page, true);
  expect((await runView(page))!.phase).toBe('playing');
  await capture(page, info, SHOTS, '01-gemme');
  const before = await saveView(page);
  await hold(page, false);
  await touchPlace(page);

  // --- La scène ------------------------------------------------------------------------------
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  // Le souvenir et les gains sont déjà écrits sur le disque, avant la fin de la scène.
  await expect.poll(async () => (await storedSave(page))?.account.unlocks ?? []).toContain(MEMORY);
  const written = (await storedSave(page))!;
  expect(written.account.ashes).toBeGreaterThan(before.account.ashes);
  expect(written.account.stats.victories).toBe(before.account.stats.victories + 1);
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.memory-meeting.t1']!);
  expect(await shot(page)).toBe('p01');
  await page.evaluate(() => {
    const c = (window as unknown as { __braise: Braise }).__braise.cinematic;
    c.freeze(true);
    c.advance(2);
  });
  await capture(page, info, SHOTS, '02-scene');
  await page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.cinematic.freeze(false));
  // A passe au plan suivant, comme dans le prologue.
  await settle(page);
  await pad.press('A');
  // Le plan en cours sort en fondu, puis le suivant arrive.
  await expect.poll(() => shot(page)).toBe('p02');
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.memory-meeting.t2']!);

  // --- B maintenu : la scène de route, Moon et Cream rentrent au refuge en parlant du souvenir ----
  await holdSkip(page, pad);
  await expect(page.locator('.screen.scene')).toBeVisible();
  await expect(page.locator('.screen.cinematic')).toHaveCount(0);
  // Ils marchent jusqu'à leur halte ; un silence, puis Moon parle.
  await page.evaluate(() => (window as unknown as { __braise: { scene: { advance(s: number): void } } }).__braise.scene.advance(7));
  await expect(page.locator('.dialogue .dialogue-text')).toHaveText(FR['dialog.scene.after-memory-meeting.1.1']!);
  await page.waitForTimeout(600);
  await capture(page, info, SHOTS, '02b-route');

  // --- B maintenu : le carton, par-dessus le refuge -------------------------------------------------
  await holdSkip(page, pad);
  const card = page.locator('.cine-memory');
  await expect(card).toBeVisible();
  await expect(card.locator('.cine-memory-found')).toHaveText(FR['memory.found']!);
  await expect(card.locator('.cine-memory-name')).toHaveText(NAME);
  await expect(card.locator('.cine-memory-count')).toHaveText('1 / 5');
  await expect(page.locator('.cine-caption')).toHaveCount(0);
  await capture(page, info, SHOTS, '03-carton');

  // --- Le bilan, avec sa ligne -----------------------------------------------------------------
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.end')).toBeVisible();
  await expect(page.locator('.end-panel h1')).toHaveText(FR['end.victory']!);
  await expect(page.locator('.end-memory')).toHaveText(FR['end.memory']!.replace('{name}', NAME));
  await expectFocus(page, 'camp');
  await capture(page, info, SHOTS, '03b-bilan');
  await settle(page);
  await pad.press('A');

  // --- Au refuge : « Souvenirs » ---------------------------------------------------------------
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('[data-focus="memories"]')).toContainText(FR['camp.memories']!);
  await settle(page);
  await pad.press('DOWN');
  await pad.press('DOWN');
  await pad.press('DOWN');
  await expectFocus(page, 'memories');
  await capture(page, info, SHOTS, '04b-camp');
  await pad.press('A');
  await expect(page.locator('.screen.memories')).toBeVisible();
  // Cinq emplacements, un seul rempli ; le focus est sur lui.
  await expect(page.locator('.memory-slot')).toHaveCount(5);
  await expect(page.locator('.memory-slot.empty')).toHaveCount(4);
  await expect(page.locator('.memory-slot.empty').first()).toContainText(FR['camp.memories.empty']!);
  await expect(page.locator(`[data-focus="${MEMORY}"]`)).toContainText(NAME);
  await expect(page.locator('.memories-count')).toHaveText('1 / 5');
  await expectFocus(page, MEMORY);
  await capture(page, info, SHOTS, '04-liste');
  // Les emplacements vides ne se choisissent pas : le focus ne bouge pas.
  await pad.press('DOWN');
  await expectFocus(page, MEMORY);

  // --- La scène revue : pas de carton, retour à la liste ---------------------------------------
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.memory-meeting.t1']!);
  await holdSkip(page, pad);
  await expect(page.locator('.screen.memories')).toBeVisible();
  await expect(page.locator('.cine-memory')).toHaveCount(0);
  await expectFocus(page, MEMORY);

  // À la souris, puis au clavier : même scène, même retour.
  await settle(page);
  await page.locator(`[data-focus="${MEMORY}"]`).click();
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.memory-meeting.t1']!);
  await settle(page);
  await page.keyboard.down('Escape');
  await page.waitForTimeout(1400);
  await page.keyboard.up('Escape');
  await expect(page.locator('.screen.memories')).toBeVisible();
  // B (Échap) revient au camp.
  await settle(page);
  await page.keyboard.press('Escape', { delay: 60 });
  await expect(page.locator('.screen.camp')).toBeVisible();

  // Le souvenir n'est inscrit qu'une fois.
  expect((await saveView(page)).account.unlocks.filter((u: string) => u === MEMORY)).toHaveLength(1);
  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('seconde victoire : le portail, aucune scène', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, oldSave(true));
  await toFallenBoss(page, pad);

  const fallen = (await arena(page))!;
  expect(fallen.memory).toBeNull();
  expect(fallen.kinds).toEqual(['portal']);
  await expect(page.locator('.hud .banner')).toHaveText(FR['hud.portal']!);
  await touchPlace(page);

  // Le bilan, tout de suite, sans la ligne du souvenir.
  await expect(page.locator('.screen.end')).toBeVisible();
  await expect(page.locator('.end-panel h1')).toHaveText(FR['end.victory']!);
  await expect(page.locator('.end-memory')).toHaveCount(0);
  await expect(page.locator('.screen.cinematic')).toHaveCount(0);
  const after = await saveView(page);
  expect(after.account.unlocks.filter((u: string) => u === MEMORY)).toHaveLength(1);
  expect(after.account.regions[REGION].bossKills).toBe(3);
  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('recharger pendant la scène : le souvenir et les gains sont gardés, le camp s\'ouvre', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, oldSave(false));
  await toFallenBoss(page, pad);
  const before = await saveView(page);
  await touchPlace(page);
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.memory-meeting.t1']!);

  // La page est rechargée au milieu de la scène.
  await page.reload();
  await expect(page.locator('.screen.title')).toBeVisible();
  const after = await saveView(page);
  expect(after.account.unlocks).toContain(MEMORY);
  expect(after.account.gold).toBeGreaterThanOrEqual(before.account.gold);
  expect(after.account.ashes).toBeGreaterThan(before.account.ashes);
  expect(after.heroes['class.ash-blade'].xp).not.toBe(before.heroes['class.ash-blade'].xp);
  expect(after.account.stats.victories).toBe(before.account.stats.victories + 1);
  expect(after.account.regions[REGION].bossKills).toBe(before.account.regions[REGION].bossKills + 1);

  // La scène ne se rejoue pas de force : le camp s'ouvre, avec son entrée « Souvenirs ».
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.screen.cinematic')).toHaveCount(0);
  await expect(page.locator('[data-focus="memories"]')).toBeVisible();
  expect(await runView(page)).toBeNull();
  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('images de la scène introuvables (route bloquée) : le bilan s\'affiche, le souvenir est gardé', async ({ page }) => {
  const pad = await SimPad.install(page);
  let blocked = 0;
  await page.route('**/cinematics/memory-meeting/**', (route) => {
    blocked++;
    return route.abort();
  });
  await plantSave(page, oldSave(false));
  await toFallenBoss(page, pad);
  expect((await arena(page))!.kinds).toEqual(['memory']);
  await touchPlace(page);

  // Ni scène ni carton : le bilan, avec la ligne du souvenir.
  await expect(page.locator('.screen.end')).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(page.locator('.cine-memory')).toHaveCount(0);
  await expect(page.locator('.end-panel h1')).toHaveText(FR['end.victory']!);
  await expect(page.locator('.end-memory')).toHaveText(FR['end.memory']!.replace('{name}', NAME));
  expect((await saveView(page)).account.unlocks).toContain(MEMORY);
  await expect.poll(async () => (await storedSave(page))?.account.unlocks ?? []).toContain(MEMORY);

  // Le refuge a son entrée, et la partie suivante rend le portail.
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('[data-focus="memories"]')).toBeVisible();
});
