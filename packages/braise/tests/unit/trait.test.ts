import { describe, expect, it } from 'vitest';
import { FR } from '../../src/content/index.ts';
import { applyBurn, hurtEnemy, spawnEnemy } from '../../src/core/combat.ts';
import { recomputeStats } from '../../src/core/levelup.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import type { Run } from '../../src/core/types.ts';
import { CLASS, data, makeImmortal, makeRun } from './helpers.ts';

const CRAWLER = data.enemies.findIndex((e) => e.id === 'enemy.crawler');

/** Une partie sans critique ni horde, pour des dégâts exacts. */
function calm(glowShare = 0): Run {
  const run = makeRun();
  run.cfg.sheet.glowShare = glowShare;
  makeImmortal(run);
  run.hero.stats.critChance = 0;
  run.enemies.count = 0;
  run.weapons.length = 0;
  return run;
}

/** Un coup de 100, physique, sur un Rampant posé à cette distance. */
function strike(run: Run, distance: number): number {
  const i = spawnEnemy(run, CRAWLER, run.hero.x + distance, run.hero.y, 1e6);
  return hurtEnemy(run, i, 100, 0, null, -1, 0);
}

describe('le trait de Moon', () => {
  it('le contenu : un bonus dans la lumière, un malus dehors, et leurs textes', () => {
    const cls = data.classes[CLASS]!;
    expect(cls.trait).toEqual({ kind: 'lit', inside: 0.1, outside: -0.1 });
    expect(data.tuning.hero.lightMargin).toBe(24);
    for (const key of ['who', 'trait.name', 'trait.bonus', 'trait.malus']) expect(FR[`${CLASS}.${key}`], key).toBeTruthy();
  });

  it('+10 % de dégâts sur un Éteint dans sa lumière', () => {
    expect(strike(calm(), 30)).toBe(110);
    expect(strike(calm(), 62)).toBe(110);
  });

  it('−10 % sur un Éteint hors de sa lumière', () => {
    expect(strike(calm(), 66)).toBe(90);
    expect(strike(calm(), 300)).toBe(90);
  });

  it('brûler sa Lueur resserre la zone où il frappe fort', () => {
    // 20 % de Lueur : 8 px, plus la marge du disque, 32 px de rayon éclairé.
    expect(strike(calm(-0.8), 30)).toBe(110);
    expect(strike(calm(-0.8), 40)).toBe(90);
  });

  it('une plus grande Lueur l\'élargit', () => {
    // 150 % de Lueur : 60 px, plus la marge, 84 px.
    expect(strike(calm(0.5), 80)).toBe(110);
  });

  it('les dégâts d\'état ne dépendent pas de la lumière', () => {
    const run = calm();
    const near = spawnEnemy(run, CRAWLER, run.hero.x + 30, run.hero.y, 1e6);
    const far = spawnEnemy(run, CRAWLER, run.hero.x + 300, run.hero.y, 1e6);
    const hp = run.enemies.hp[near]!;
    applyBurn(run, near, 40);
    applyBurn(run, far, 40);
    for (let k = 0; k < 40; k++) stepRun(run, idleInput());
    expect(hp - run.enemies.hp[near]!).toBeGreaterThan(0);
    expect(hp - run.enemies.hp[near]!).toBe(hp - run.enemies.hp[far]!);
  });

  it('la Lueur recalculée suit la feuille', () => {
    const run = calm();
    run.cfg.sheet.glowShare = -0.5;
    recomputeStats(run);
    run.hero.stats.critChance = 0;
    expect(strike(run, 50)).toBe(90);
  });
});
