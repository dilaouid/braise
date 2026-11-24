import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/core/combat.ts';
import { insideTelegraph, updateEnemies, updateTelegraphs } from '../../src/core/enemies.ts';
import { TG_CIRCLE, TG_LINE, TG_RING, type Run } from '../../src/core/types.ts';
import { makeImmortal, makeRun } from './helpers.ts';

const CHARGE = 0;
const ROOTS = 1;
const STOMP = 2;
const STALK = 3;
const VOLLEY = 4;
const ROAR = 5;
const DT = 1 / 60;

/** Le Cerf seul dans son arène, à 200 px du héros, prêt à frapper. */
function makeStag(seed = 3): { run: Run; i: number } {
  const run = makeRun(seed);
  makeImmortal(run);
  run.enemies.count = 0;
  run.telegraphs.count = 0;
  const d = run.director;
  const i = spawnEnemy(run, run.region.bossIdx, run.hero.x + 200, run.hero.y, 1);
  d.bossSpawned = true;
  d.arenaX = run.hero.x;
  d.arenaY = run.hero.y;
  d.arenaR = 600;
  d.bossUid = run.enemies.uid[i]!;
  d.bossPhase = 1;
  d.bossLast = -1;
  d.bossNext = -1;
  run.enemies.timer2[i] = 0;
  return { run, i };
}

/** Fait partir l'attaque suivante tout de suite. */
function attackNow(run: Run, i: number, attack = -1): void {
  run.enemies.state[i] = 0;
  run.enemies.timer2[i] = 0;
  run.telegraphs.count = 0;
  run.enemyShots.count = 0;
  if (attack >= 0) run.director.bossNext = attack;
  updateEnemies(run, DT);
}

describe('le Cerf sans lumière', () => {
  it('en phase 1, il charge, frappe en onde ou traque, sans jamais répéter son coup', () => {
    const { run, i } = makeStag();
    const seen = new Set<number>();
    let last = -1;
    for (let k = 0; k < 120; k++) {
      attackNow(run, i);
      const attack = run.director.bossLast;
      expect(attack).not.toBe(last);
      seen.add(attack);
      last = attack;
    }
    expect([...seen].sort()).toEqual([CHARGE, STOMP, STALK]);
  });

  it('en phase 2, il apprend l\'étoile de racines et la volée', () => {
    const { run, i } = makeStag();
    run.director.bossPhase = 2;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.5;
    const seen = new Set<number>();
    for (let k = 0; k < 150; k++) {
      attackNow(run, i);
      seen.add(run.director.bossLast);
    }
    expect([...seen].sort()).toEqual([CHARGE, ROOTS, STOMP, STALK, VOLLEY]);
  });

  it('l\'onde : un cercle puis des anneaux jointifs, chacun annoncé plus tard que le précédent', () => {
    const { run, i } = makeStag();
    const stomp = run.data.enemies[run.region.bossIdx]!.stomp!;
    attackNow(run, i, STOMP);
    const tg = run.telegraphs;
    expect(tg.count).toBe(stomp.rings);
    expect(tg.shape[0]).toBe(TG_CIRCLE);
    for (let k = 1; k < tg.count; k++) {
      expect(tg.shape[k]).toBe(TG_RING);
      expect(tg.length[k]).toBeCloseTo(tg.width[k - 1]!);
      expect(tg.t[k]!).toBeLessThan(tg.t[k - 1]!);
    }
  });

  it('un anneau touche dans sa bande, pas en son centre', () => {
    const { run, i } = makeStag();
    attackNow(run, i, STOMP);
    const tg = run.telegraphs;
    const x = tg.x[1]!;
    const y = tg.y[1]!;
    const mid = (tg.length[1]! + tg.width[1]!) / 2;
    expect(insideTelegraph(run, 1, x + mid, y, 0)).toBe(true);
    expect(insideTelegraph(run, 1, x + 4, y, 0)).toBe(false);
    expect(insideTelegraph(run, 1, x + tg.width[1]! + 30, y, 0)).toBe(false);
  });

  it('une annonce différée ne frappe qu\'après son délai et sa durée', () => {
    const { run, i } = makeStag();
    attackNow(run, i, STOMP);
    const tg = run.telegraphs;
    const total = -tg.t[tg.count - 1]! + tg.duration[tg.count - 1]!;
    // Juste avant le terme de la dernière, elle est encore là.
    for (let t = 0; t < total - 0.05; t += DT) updateTelegraphs(run, DT);
    expect(tg.count).toBe(1);
    for (let t = 0; t < 0.1; t += DT) updateTelegraphs(run, DT);
    expect(tg.count).toBe(0);
  });

  it('les racines traquantes tombent là où se tient le héros, l\'une après l\'autre', () => {
    const { run, i } = makeStag();
    const stalk = run.data.enemies[run.region.bossIdx]!.stalk!;
    attackNow(run, i, STALK);
    const spots: number[] = [];
    for (let t = 0; t < stalk.count * stalk.interval + 0.2; t += DT) {
      run.hero.x += 1;
      const before = run.telegraphs.count;
      updateEnemies(run, DT);
      if (run.telegraphs.count > before) spots.push(run.telegraphs.x[run.telegraphs.count - 1]!);
    }
    expect(spots.length).toBe(stalk.count);
    for (let k = 1; k < spots.length; k++) expect(spots[k]!).toBeGreaterThan(spots[k - 1]!);
  });

  it('en phase 2, l\'étoile frappe en deux vagues décalées d\'un demi-cran', () => {
    const { run, i } = makeStag();
    run.director.bossPhase = 2;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.5;
    const roots = run.data.enemies[run.region.bossIdx]!.roots!;
    attackNow(run, i, ROOTS);
    const tg = run.telegraphs;
    expect(tg.count).toBe(roots.lines * 2);
    for (let k = 0; k < tg.count; k++) expect(tg.shape[k]).toBe(TG_LINE);
    expect(tg.t[roots.lines]!).toBeLessThan(0);
    expect(tg.angle[roots.lines]! - tg.angle[0]!).toBeCloseTo(Math.PI / roots.lines);
  });

  it('la volée tire des éventails de projectiles après une annonce', () => {
    const { run, i } = makeStag();
    run.director.bossPhase = 2;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.5;
    const volley = run.data.enemies[run.region.bossIdx]!.volley!;
    attackNow(run, i, VOLLEY);
    expect(run.enemyShots.count).toBe(0);
    for (let t = 0; t < volley.windup + volley.interval * (volley.waves - 1) + 0.1; t += DT) updateEnemies(run, DT);
    expect(run.enemyShots.count).toBe(volley.shots * volley.waves);
  });

  it('passer sous un tiers de sa vie le fait rugir avant toute autre attaque', () => {
    const { run, i } = makeStag();
    run.enemies.timer2[i] = 5;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.5;
    updateEnemies(run, DT);
    expect(run.director.bossPhase).toBe(2);
    expect(run.director.bossNext).toBe(ROAR);
    for (let t = 0; t < 0.3; t += DT) updateEnemies(run, DT);
    expect(run.director.bossLast).toBe(ROAR);
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.shape[0]).toBe(TG_CIRCLE);
  });

  it('en phase 3, l\'étoile enchaîne aussitôt sur les racines traquantes', () => {
    const { run, i } = makeStag();
    run.director.bossPhase = 3;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.2;
    run.director.bossSummonT = 999;
    attackNow(run, i, ROOTS);
    for (let t = 0; t < 4 && run.director.bossLast === ROOTS; t += DT) updateEnemies(run, DT);
    expect(run.director.bossLast).toBe(STALK);
  });
});
