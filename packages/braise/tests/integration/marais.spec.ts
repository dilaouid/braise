import { expect, test, type Page } from '@playwright/test';
import {
  FR, SimPad, capture, expectFocus, fixtureSave, openDoor, plantSave, runView, settle, skipDepartCinematic, waitFrames, watch,
} from './harness.ts';

const SHOTS = 'marais';
const MARSH = 'region.drowned-marsh';

type Braise = { run: any; cinematic: { shot: string | null } };

/** Une sauvegarde d'exemple, A pour valider. `beaten` : le Cerf déjà battu, la route du Marais ouverte. */
function save(beaten: boolean): string {
  const s = JSON.parse(fixtureSave(beaten ? 'v1-m1-played' : 'v1-m1-new'));
  s.settings.swapAB = false;
  return JSON.stringify(s);
}

const shot = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.cinematic.shot);

/** Du titre au refuge, puis la porte ouverte. */
async function toDoor(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await openDoor(page, pad);
}

/** L'heure du boss, seul avec Moon : plus de horde, plus d'élites, plus d'armes, et un héros qui ne meurt pas. */
async function summonLady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    run.cfg.sheet.maxHp = 100000;
    run.hero.stats.maxHp = 100000;
    run.hero.hp = 100000;
    run.weapons.length = 0;
    run.director.eliteIdx = 99;
    run.director.waveIdx = 99;
    run.director.budget = -1e9;
    run.enemies.count = 0;
    run.time = run.data.tuning.durationMin * 60 - 0.1;
  });
}

/** Impose à la Dame sa prochaine attaque, tout de suite. */
async function ladyAttack(page: Page, attack: number): Promise<void> {
  await page.evaluate((a) => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) {
      if (e.uid[i] !== run.director.bossUid) continue;
      run.telegraphs.count = 0;
      run.director.bossSummonT = 999;
      run.director.bossNext = a;
      e.state[i] = 0;
      e.timer2[i] = 0.6;
    }
  }, attack);
}

test('le Marais reste fermé tant que le Cerf n\'est pas battu', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, save(false));
  await toDoor(page, pad);
  const card = page.locator(`.door-card[data-focus="${MARSH}"]`);
  await expect(card).toHaveClass(/locked/);
  await expect(card).toContainText(FR[`${MARSH}.name`]!);
  await expect(card).toContainText(FR['door.locked']!);
  await pad.press('RIGHT');
  await expectFocus(page, MARSH);
  await expect(card.locator('.door-hint')).toBeVisible();
  await expect(card.locator('.door-hint')).toContainText(FR['boss.lightless-stag.name']!);
  await capture(page, info, SHOTS, '01-porte-fermee');
  // Valider ne part pas : la route est fermée.
  await pad.press('A');
  await waitFrames(page, 10);
  await expect(page.locator('.screen.door')).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('le Cerf battu : l\'arrivée au Marais, l\'eau, puis la Dame de Vase', async ({ page }, info) => {
  test.setTimeout(120_000);
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, save(true));
  await toDoor(page, pad);
  const card = page.locator(`.door-card[data-focus="${MARSH}"]`);
  await expect(card).not.toHaveClass(/locked/);
  await pad.press('RIGHT');
  await expectFocus(page, MARSH);
  await capture(page, info, SHOTS, '02-porte-ouverte');
  await pad.down('A');
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await pad.up('A');
  await expect.poll(() => shot(page)).toBe('p01-ponton');
  await expect(page.locator('.cine-caption')).toHaveText(FR['cine.marsh-arrival.t1']!);
  await capture(page, info, SHOTS, '03-arrivee');
  await skipDepartCinematic(page, pad);
  const region = await page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.run.cfg.regionId);
  expect(region).toBe(MARSH);
  await page.waitForTimeout(1500);
  await capture(page, info, SHOTS, '04-marais');

  // La Dame : l'arène se referme sans elle, puis elle sort de l'eau et son carton paraît.
  await summonLady(page);
  await expect(page.locator('.bossbar')).toBeVisible();
  await expect(page.locator('.boss-card')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.boss-card-name')).toHaveText(FR['boss.mud-lady.name']!);
  await expect(page.locator('.boss-card-title')).toHaveText(FR['boss.mud-lady.title']!);
  await capture(page, info, SHOTS, '05-dame-carton');
  await expect(page.locator('.boss-card')).toBeHidden({ timeout: 8000 });

  // Les mains de vase, le balayage, le cri.
  await ladyAttack(page, 0);
  await page.waitForTimeout(2100);
  await capture(page, info, SHOTS, '06-mains');
  await page.waitForTimeout(2200);
  await ladyAttack(page, 1);
  await page.waitForTimeout(1250);
  await capture(page, info, SHOTS, '07-balayage');
  await page.waitForTimeout(1500);
  await ladyAttack(page, 6);
  await page.waitForTimeout(1300);
  await capture(page, info, SHOTS, '08-cri');

  // La marée : elle monte, les îlots restent au sec.
  await page.waitForTimeout(1800);
  await ladyAttack(page, 5);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __braise: Braise }).__braise.run.director.tide !== null)).toBe(true);
  await page.waitForTimeout(3600);
  await capture(page, info, SHOTS, '09-maree');

  // Vaincue : elle sombre, « Gardien vaincu », et le Souvenir paraît une fois l'eau refermée.
  await page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    const e = run.enemies;
    run.hero.y += 70;
    for (let i = 0; i < e.count; i++) if (e.uid[i] === run.director.bossUid) e.hp[i] = 0;
  });
  await expect(page.locator('.boss-card.felled')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('.boss-card-name')).toHaveText(FR['hud.bossFelled']!);
  await page.waitForTimeout(2600);
  await capture(page, info, SHOTS, '10-elle-sombre');
  await expect.poll(() => page.evaluate(() => {
    const run = (window as unknown as { __braise: Braise }).__braise.run;
    return run.map.pois.some((p: { kind: string; progress: number }) => p.kind === 'memory' && p.progress >= 0);
  }), { timeout: 8000 }).toBe(true);
  const view = await runView(page);
  expect(view?.phase).not.toBe('dead');
  expect(seen.errors).toEqual([]);
});
