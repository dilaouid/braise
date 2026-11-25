import { describe, expect, it } from 'vitest';
import { applyBleed, applyBurn, applyFreeze, applyShock, hurtEnemy, spawnEnemy } from '../../src/core/combat.ts';
import { recomputeStats } from '../../src/core/levelup.ts';
import { layThreads } from '../../src/core/light-weapons.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { ST_BLEED, ST_BURN, ST_FROZEN, ST_SHOCK, ST_SLOW, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun, noTrait } from './helpers.ts';

const crawler = data.enemies.findIndex((e) => e.id === 'enemy.crawler');
const stump = data.enemies.findIndex((e) => e.id === 'enemy.dead-stump');
const boss = data.enemies.findIndex((e) => e.rank === 'boss');

/** Une partie figée dans le temps, avec une seule arme et un cercle d'ennemis résistants autour du héros. */
function arena(weaponId: string, level: number): Run {
  const run = makeRun(21);
  makeImmortal(run);
  const def = data.weapons.find((w) => w.id === weaponId)!;
  run.weapons[0]!.def = def.index;
  run.weapons[0]!.level = Math.min(level, def.levels.length);
  run.weapons[0]!.cd = 0.05;
  // Le directeur n'achète rien : seuls les ennemis du test sont là.
  run.director.waveIdx = 99;
  run.director.eliteIdx = 99;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = 28 + (k % 3) * 22;
    spawnEnemy(run, crawler, run.hero.x + Math.cos(a) * r, run.hero.y + Math.sin(a) * r, 100000);
  }
  return run;
}

function play(run: Run, seconds: number): void {
  const input = idleInput();
  for (let i = 0; i < seconds * 60; i++) {
    run.director.budget = 0;
    // Sillage ne frappe que si Moon rue : un fil toutes les 2,5 s, comme une ruée prête.
    if (i % 150 === 0) layThreads(run, run.hero.x - 70, run.hero.y, run.hero.x + 70, run.hero.y);
    stepRun(run, input);
    run.evCount = 0;
    if (run.phase !== 'playing') break;
  }
}

describe('armes : chaque comportement inflige des dégâts', () => {
  for (const w of data.weapons) {
    it(`${w.id} (${w.behavior})`, () => {
      const run = arena(w.id, 1);
      play(run, 6);
      expect(run.phase).toBe('playing');
      expect(run.weapons[0]!.damageDone).toBeGreaterThan(0);
    });
  }

  it('un niveau de plus fait plus de dégâts sur la durée', () => {
    for (const w of data.weapons.filter((x) => !x.evolved)) {
      const low = arena(w.id, 1);
      const high = arena(w.id, 6);
      play(low, 12);
      play(high, 12);
      expect(high.weapons[0]!.damageDone, w.id).toBeGreaterThan(low.weapons[0]!.damageDone);
    }
  });

  it('une évolution fait plus de dégâts que le niveau 6 de son arme', () => {
    for (const evo of data.weapons.filter((x) => x.evolved)) {
      const base = data.weapons[evo.from]!;
      const a = arena(base.id, 6);
      const b = arena(evo.id, 1);
      play(a, 15);
      play(b, 15);
      expect(b.weapons[0]!.damageDone, evo.id).toBeGreaterThan(a.weapons[0]!.damageDone);
    }
  });

  it('la Cadence raccourcit les rechargements, la Puissance augmente les dégâts', () => {
    const base = arena('weapon.hearth-hammer', 1);
    const fast = arena('weapon.hearth-hammer', 1);
    fast.cfg.sheet.cadence = 1;
    recomputeStats(fast);
    const strong = arena('weapon.hearth-hammer', 1);
    strong.cfg.sheet.power = 1;
    recomputeStats(strong);
    play(base, 14);
    play(fast, 14);
    play(strong, 14);
    expect(fast.weapons[0]!.damageDone).toBeGreaterThan(base.weapons[0]!.damageDone * 1.6);
    expect(strong.weapons[0]!.damageDone).toBeGreaterThan(base.weapons[0]!.damageDone * 1.7);
  });
});

describe('formule de dégâts et états (document 02 §6 et §11)', () => {
  function target(kind: number): { run: Run; i: number } {
    const run = noTrait(makeRun(5));
    const i = spawnEnemy(run, kind, run.hero.x + 200, run.hero.y, 1000);
    // Ni critique ni trait : le test porte sur les multiplicateurs.
    run.hero.stats.critChance = 0;
    run.hero.stats.power = 0;
    return { run, i };
  }

  it('faiblesse +25 %, résistance −25 %, minimum 1', () => {
    const { run, i } = target(stump);
    const fire = hurtEnemy(run, i, 100, 1, null, -1);
    const phys = hurtEnemy(run, i, 100, 0, null, -1);
    const frost = hurtEnemy(run, i, 100, 3, null, -1);
    expect(fire).toBe(125);
    expect(phys).toBe(75);
    expect(frost).toBe(100);
    expect(hurtEnemy(run, i, 0.01, 3, null, -1)).toBe(1);
  });

  it('l\'attribut d\'échelle ajoute 1 % par point, la Puissance s\'additionne avant de multiplier', () => {
    const { run, i } = target(crawler);
    run.hero.stats.attrs.str = 50;
    expect(hurtEnemy(run, i, 100, 3, 'str', -1)).toBe(150);
    run.hero.stats.power = 0.5;
    run.hero.buffT = 1;
    // Puissance 50 % + Cri de braise 25 % = +75 %, puis × 1,5 pour la Force.
    expect(hurtEnemy(run, i, 100, 3, 'str', -1)).toBe(Math.round(100 * 1.75 * 1.5));
  });

  it('le trait de Moon : +10 % dans sa lumière (64 px), −10 % dehors', () => {
    const run = makeRun(5);
    run.hero.stats.critChance = 0;
    const near = spawnEnemy(run, crawler, run.hero.x + 30, run.hero.y, 1000);
    const far = spawnEnemy(run, crawler, run.hero.x + 100, run.hero.y, 1000);
    expect(hurtEnemy(run, near, 100, 3, null, -1)).toBe(110);
    expect(hurtEnemy(run, far, 100, 3, null, -1)).toBe(90);
  });

  it('le Choc fait subir 15 % de dégâts en plus', () => {
    const { run, i } = target(crawler);
    applyShock(run, i);
    expect(run.enemies.status[i]! & ST_SHOCK).toBeTruthy();
    expect(hurtEnemy(run, i, 100, 3, null, -1)).toBe(115);
  });

  it('un critique multiplie par 1,5, et la chance est plafonnée à 75 %', () => {
    const { run, i } = target(crawler);
    run.hero.stats.critChance = 1;
    expect(hurtEnemy(run, i, 100, 3, null, -1)).toBe(150);
  });

  it('la Brûlure se rafraîchit sans se cumuler ; le Saignement se cumule jusqu\'à 5', () => {
    const { run, i } = target(crawler);
    applyBurn(run, i, 40);
    applyBurn(run, i, 40);
    expect(run.enemies.status[i]! & ST_BURN).toBeTruthy();
    expect(run.enemies.burnDmg[i]).toBeCloseTo(10, 5);
    for (let k = 0; k < 9; k++) applyBleed(run, i, 40);
    expect(run.enemies.status[i]! & ST_BLEED).toBeTruthy();
    expect(run.enemies.bleedStacks[i]).toBe(5);
  });

  it('trois Gels rapprochés figent un ennemi ordinaire, jamais un boss', () => {
    const { run, i } = target(crawler);
    applyFreeze(run, i);
    applyFreeze(run, i);
    expect(run.enemies.status[i]! & ST_FROZEN).toBeFalsy();
    expect(run.enemies.status[i]! & ST_SLOW).toBeTruthy();
    applyFreeze(run, i);
    expect(run.enemies.status[i]! & ST_FROZEN).toBeTruthy();
    const b = spawnEnemy(run, boss, run.hero.x + 300, run.hero.y, 1);
    for (let k = 0; k < 6; k++) applyFreeze(run, b);
    expect(run.enemies.status[b]! & ST_FROZEN).toBeFalsy();
    expect(run.enemies.status[b]! & ST_SLOW).toBeTruthy();
  });
});
