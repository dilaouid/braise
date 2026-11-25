import { describe, expect, it } from 'vitest';
import { hurtEnemy, spawnEnemy } from '../../src/core/combat.ts';
import { evolveWeapon, recomputeStats } from '../../src/core/levelup.ts';
import { isLit, litRadius } from '../../src/core/light.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { ST_BURN, type Run } from '../../src/core/types.ts';
import { armed, crawler, hold, lost } from './arms-helpers.ts';
import { makeImmortal, makeRun } from './helpers.ts';

function at(run: Run, x: number, y = 0): number {
  return spawnEnemy(run, crawler, run.hero.x + x, run.hero.y + y, 1e6);
}

describe('Veilleuses', () => {
  it('une lumière aux pieds de Moon, puis une toutes les 5 s', () => {
    const run = armed('weapon.nightlights');
    hold(run, 1);
    expect(run.lamps).toHaveLength(1);
    expect(run.lamps[0]).toMatchObject({ x: run.hero.x, y: run.hero.y });
    hold(run, 290);
    expect(run.lamps).toHaveLength(1);
    hold(run, 12);
    expect(run.lamps).toHaveLength(2);
  });

  it('la Cadence raccourcit la recharge', () => {
    const run = armed('weapon.nightlights');
    run.hero.stats.cadence = 1;
    hold(run, 160);
    expect(run.lamps).toHaveLength(2);
  });

  it('son rayon est une part du disque, au moment de la pose', () => {
    const run = armed('weapon.nightlights');
    run.hero.stats.zone = 0.5;
    hold(run, 1);
    expect(run.lamps[0]!.radius).toBeCloseTo(0.5 * 64 * 1.5);
    run.hero.stats.glow = 8;
    hold(run, 1);
    expect(run.lamps[0]!.radius).toBeCloseTo(0.5 * 64 * 1.5);
  });

  it('Lueur au plancher ou débordante : le rayon reste une part du disque', () => {
    for (const glow of [0, 8, 200]) {
      const run = armed('weapon.nightlights');
      run.hero.stats.glow = glow;
      hold(run, 1);
      expect(run.lamps[0]!.radius).toBeCloseTo((glow + 24) / 2);
    }
  });

  it('vit 6 s, plus longtemps avec la Durée', () => {
    const run = armed('weapon.nightlights');
    hold(run, 1);
    run.weapons[0]!.cd = 1000;
    hold(run, 355);
    expect(run.lamps).toHaveLength(1);
    hold(run, 10);
    expect(run.lamps).toHaveLength(0);
    run.hero.stats.duration = 0.5;
    run.weapons[0]!.cd = 0;
    hold(run, 1);
    expect(run.lamps[0]!.life).toBeGreaterThan(8.9);
  });

  it('huit au plus : la plus ancienne s\'éteint', () => {
    const run = armed('weapon.nightlights', 6);
    run.hero.stats.projectiles = 3;
    hold(run, 1);
    expect(run.lamps).toHaveLength(6);
    const first = run.lamps[0]!;
    const last = run.lamps[5]!;
    run.weapons[0]!.cd = 0;
    hold(run, 1);
    expect(run.lamps).toHaveLength(8);
    expect(run.lamps).not.toContain(first);
    expect(run.lamps).toContain(last);
  });

  it('un projectile de plus donne une Veilleuse de plus, à 60 px, pas deux fois au même angle', () => {
    const run = armed('weapon.nightlights');
    run.hero.stats.projectiles = 1;
    hold(run, 1);
    expect(run.lamps).toHaveLength(2);
    const dist = (k: number): number => Math.hypot(run.lamps[k]!.x - run.hero.x, run.lamps[k]!.y - run.hero.y);
    expect(dist(0)).toBe(0);
    expect(dist(1)).toBeCloseTo(60);
    run.weapons[0]!.cd = 0;
    hold(run, 1);
    expect(dist(3)).toBeCloseTo(60);
    expect(Math.hypot(run.lamps[1]!.x - run.lamps[3]!.x, run.lamps[1]!.y - run.lamps[3]!.y)).toBeGreaterThan(10);
  });

  it('brûle ce qu\'elle éclaire : 3 dégâts par demi-seconde, sans Brûlure', () => {
    const run = armed('weapon.nightlights');
    const i = at(run, 20);
    const away = at(run, 60);
    hold(run, 1);
    expect(lost(run, i)).toBe(4); // 3 de Feu, +25 % : un Rampant craint le feu.
    hold(run, 28);
    expect(lost(run, i)).toBe(4);
    hold(run, 4);
    expect(lost(run, i)).toBe(8);
    expect(lost(run, away)).toBe(0);
    expect(run.enemies.status[i]! & ST_BURN).toBe(0);
  });

  it('rien ne s\'empile : un coup par demi-seconde sous trois Veilleuses', () => {
    const run = armed('weapon.nightlights');
    for (let k = 0; k < 3; k++) {
      run.weapons[0]!.cd = 0;
      hold(run, 1);
    }
    expect(run.lamps).toHaveLength(3);
    const i = at(run, 20);
    hold(run, 1);
    expect(lost(run, i)).toBe(4);
  });

  it('éclaire pour de vrai : le trait de Moon compte ce qu\'elle éclaire', () => {
    const run = makeRun();
    makeImmortal(run);
    run.hero.stats.critChance = 0;
    run.hero.stats.power = 0;
    const strike = (): number => hurtEnemy(run, at(run, 200), 100, 0, null, -1, 0);
    expect(strike()).toBe(90);
    run.lamps.push({ x: run.hero.x + 190, y: run.hero.y, radius: 30, life: 5, maxLife: 5, slot: 0 });
    expect(isLit(run, run.hero.x + 200, run.hero.y)).toBe(true);
    expect(strike()).toBe(110);
  });

  it('le Guet d\'orage ne vise pas ce qu\'elle éclaire', () => {
    const run = armed('weapon.storm-watch');
    const i = at(run, 100);
    run.lamps.push({ x: run.hero.x + 100, y: run.hero.y, radius: 30, life: 5, maxLife: 5, slot: 0 });
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('le Halo brûle aussi ce qu\'elle éclaire', () => {
    const run = armed('weapon.scythe');
    run.weapons.length = 0;
    const glowLine = run.data.flames.lines.findIndex((l) => l.id === 'flame.glow');
    run.flames.push({ line: glowLine, rarity: 2 });
    recomputeStats(run);
    const near = at(run, 200);
    const dark = at(run, -200);
    run.lamps.push({ x: run.hero.x + 200, y: run.hero.y, radius: 30, life: 5, maxLife: 5, slot: 0 });
    run.haloT = 0;
    stepRun(run, idleInput());
    expect(run.enemies.status[near]! & ST_BURN).toBeTruthy();
    expect(run.enemies.status[dark]! & ST_BURN).toBe(0);
  });

  it('Lisière n\'a pas de bord autour d\'une Veilleuse', () => {
    const run = armed('weapon.verge');
    run.lamps.push({ x: run.hero.x + 200, y: run.hero.y, radius: 30, life: 5, maxLife: 5, slot: 0 });
    const i = at(run, 170);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });
});

describe('Guirlande', () => {
  function pair(gap: number): Run {
    const run = armed('weapon.garland');
    run.weapons[0]!.cd = 1000;
    for (const x of [0, gap]) run.lamps.push({ x: run.hero.x + 300 + x, y: run.hero.y, radius: 30, life: 9, maxLife: 9, slot: 0 });
    return run;
  }

  it('un fil de feu entre deux Veilleuses à 140 px : 8 dégâts et Brûlure', () => {
    const run = pair(140);
    const i = at(run, 370);
    hold(run, 1);
    expect(lost(run, i)).toBe(10); // 8 de Feu, +25 %.
    expect(run.enemies.status[i]! & ST_BURN).toBeTruthy();
  });

  it('pas de fil au-delà de 140 px', () => {
    const run = pair(150);
    const i = at(run, 375);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('sous le fil et la lumière : un seul coup, celui du fil', () => {
    const run = pair(100);
    const i = at(run, 310);
    hold(run, 1);
    expect(lost(run, i)).toBe(10);
    hold(run, 20);
    // La Brûlure compte à part ; pas de second coup de l'arme avant une demi-seconde.
    expect(run.weapons[0]!.damageDone).toBe(10);
  });

  it('un Éteint à côté du fil n\'est pas touché', () => {
    const run = pair(140);
    const i = at(run, 370, 14);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('évoluer garde les Veilleuses vivantes', () => {
    const run = armed('weapon.nightlights', 6);
    hold(run, 1);
    expect(run.lamps).toHaveLength(3);
    evolveWeapon(run, run.weapons[0]!);
    run.weapons[0]!.cd = 1000;
    const i = at(run, 10);
    hold(run, 1);
    expect(run.lamps).toHaveLength(3);
    expect(lost(run, i)).toBeGreaterThan(0);
  });

  it('sans l\'évolution, pas de fil', () => {
    const run = armed('weapon.nightlights', 6);
    run.weapons[0]!.cd = 1000;
    for (const x of [0, 140]) run.lamps.push({ x: run.hero.x + 300 + x, y: run.hero.y, radius: 30, life: 9, maxLife: 9, slot: 0 });
    const i = at(run, 370);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });
});

describe('la lumière', () => {
  it('le disque de Moon, sans Veilleuse', () => {
    const run = armed('weapon.scythe');
    expect(litRadius(run)).toBe(64);
    expect(isLit(run, run.hero.x + 63, run.hero.y)).toBe(true);
    expect(isLit(run, run.hero.x + 64, run.hero.y)).toBe(false);
  });
});
