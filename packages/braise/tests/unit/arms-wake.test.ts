import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/core/combat.ts';
import { evolveWeapon } from '../../src/core/levelup.ts';
import { layThreads } from '../../src/core/light-weapons.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { ST_SHOCK, type Run } from '../../src/core/types.ts';
import { armed, crawler, hold, lost } from './arms-helpers.ts';

function at(run: Run, x: number, y = 0): number {
  return spawnEnemy(run, crawler, run.hero.x + x, run.hero.y + y, 1e6);
}

/** Tend un fil entre deux points, relatifs à Moon. */
function lay(run: Run, x1: number, y1: number, x2: number, y2: number): void {
  const h = run.hero;
  layThreads(run, h.x + x1, h.y + y1, h.x + x2, h.y + y2);
}

/** Sans les éclairs du fil : pour lire seuls le fil et son éclat. */
function quiet(run: Run): Run {
  run.data = {
    ...run.data,
    weapons: run.data.weapons.map((w) => (w.behavior === 'wake' ? { ...w, levels: w.levels.map((l) => ({ ...l, zapEvery: 0 })) } : w)),
  };
  return run;
}

/** Une vraie ruée vers la droite, jouée pas à pas. */
function dash(run: Run): void {
  const input = idleInput();
  input.moveX = 1;
  input.dash = true;
  stepRun(run, input);
  for (let k = 0; k < 15; k++) stepRun(run, idleInput());
  run.evCount = 0;
}

describe('Sillage', () => {
  it('une ruée tend un fil du départ à l\'arrivée', () => {
    const run = armed('weapon.wake');
    const x0 = run.hero.x;
    const y0 = run.hero.y;
    dash(run);
    expect(run.threads).toHaveLength(1);
    const t = run.threads[0]!;
    expect(t.x1).toBeCloseTo(x0);
    expect(t.y1).toBeCloseTo(y0);
    expect(t.x2).toBeCloseTo(run.hero.x);
    expect(Math.hypot(t.x2 - t.x1, t.y2 - t.y1)).toBeGreaterThan(100);
  });

  it('sans l\'arme, la ruée ne laisse rien', () => {
    const run = armed('weapon.scythe');
    dash(run);
    expect(run.threads).toHaveLength(0);
  });

  it('une ruée bloquée par un mur : le fil s\'arrête là où Moon s\'arrête', () => {
    const run = armed('weapon.wake');
    const tile = run.map.tile;
    const tx = Math.floor((run.hero.x + 70) / tile);
    const ty = Math.floor(run.hero.y / tile);
    for (const dy of [-1, 0, 1]) run.map.solid[(ty + dy) * run.map.size + tx] = 1;
    dash(run);
    expect(run.threads).toHaveLength(1);
    expect(run.threads[0]!.x2).toBeCloseTo(run.hero.x);
    expect(run.threads[0]!.x2).toBeLessThan(tx * tile);
  });

  it('une ruée de moins de 20 px ne tend rien', () => {
    const run = armed('weapon.wake');
    lay(run, 0, 0, 19, 0);
    expect(run.threads).toHaveLength(0);
    lay(run, 0, 0, 20, 0);
    expect(run.threads).toHaveLength(1);
  });

  it('une pause au milieu de la ruée ne casse pas le fil', () => {
    const run = armed('weapon.wake');
    const x0 = run.hero.x;
    const input = idleInput();
    input.moveX = 1;
    input.dash = true;
    stepRun(run, input);
    run.phase = 'chest';
    for (let k = 0; k < 30; k++) stepRun(run, idleInput());
    run.phase = 'playing';
    for (let k = 0; k < 15; k++) stepRun(run, idleInput());
    expect(run.threads).toHaveLength(1);
    expect(run.threads[0]!.x1).toBeCloseTo(x0);
  });

  it('trois fils au plus, le plus ancien lâche', () => {
    const run = armed('weapon.wake');
    for (let k = 0; k < 4; k++) lay(run, 0, k * 40, 100, k * 40);
    expect(run.threads).toHaveLength(3);
    expect(run.threads[0]!.y1).toBeCloseTo(run.hero.y + 40);
  });

  it('vit 2,5 s, plus longtemps avec la Durée', () => {
    const run = armed('weapon.wake');
    lay(run, 0, 0, 100, 0);
    hold(run, 146);
    expect(run.threads).toHaveLength(1);
    hold(run, 6);
    expect(run.threads).toHaveLength(0);
    run.hero.stats.duration = 1;
    lay(run, 0, 0, 100, 0);
    expect(run.threads[0]!.life).toBeCloseTo(5);
  });

  it('blesse qui le touche : 13, puis rien avant 0,6 s', () => {
    const run = armed('weapon.wake');
    const on = at(run, 150);
    const off = at(run, 150, 16);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, on)).toBe(13);
    expect(lost(run, off)).toBe(0);
    hold(run, 32);
    expect(lost(run, on)).toBe(13);
    hold(run, 6);
    expect(lost(run, on)).toBe(26);
  });

  it('au-delà de ses bouts, le fil ne touche rien', () => {
    const run = armed('weapon.wake');
    const i = at(run, 220);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('la Zone l\'élargit', () => {
    const run = armed('weapon.wake');
    run.hero.stats.zone = 1;
    const i = at(run, 150, 20);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, i)).toBe(13);
  });

  it('trois fils sur le même Éteint ne font qu\'un coup', () => {
    const run = armed('weapon.wake');
    const i = at(run, 150);
    for (let k = 0; k < 3; k++) lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, i)).toBe(13);
  });

  it('applique Choc au niveau 4, pas au niveau 3', () => {
    for (const [level, want] of [[3, 0], [4, ST_SHOCK]] as const) {
      const run = armed('weapon.wake', level);
      const i = at(run, 150);
      lay(run, 100, 0, 200, 0);
      hold(run, 1);
      expect(run.enemies.status[i]! & ST_SHOCK, `niveau ${level}`).toBe(want);
    }
  });

  it('niveaux 1 et 2 : le fil ne lance aucun éclair', () => {
    const run = armed('weapon.wake', 2);
    const i = at(run, 150, 40);
    lay(run, 100, 0, 200, 0);
    hold(run, 120);
    expect(lost(run, i)).toBe(0);
  });

  it('niveau 3 : le fil foudroie l\'Éteint le plus proche de lui, toutes les 0,9 s', () => {
    const run = armed('weapon.wake', 3);
    const near = at(run, 150, 40);
    const far = at(run, 150, 60);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, near)).toBe(14);
    expect(lost(run, far)).toBe(0);
    hold(run, 54);
    expect(lost(run, near)).toBe(28);
  });

  it('niveau 4 : deux éclairs à la fois, sur deux Éteints différents', () => {
    const run = armed('weapon.wake', 4);
    const a = at(run, 150, 40);
    const b = at(run, 150, 60);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, a)).toBe(16);
    expect(lost(run, b)).toBe(16);
  });

  it('niveau 6 : le fil qui se rompt éclate sur toute sa longueur', () => {
    const run = quiet(armed('weapon.wake', 6));
    const i = at(run, 150, 30);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
    run.threads[0]!.life = 0.001;
    hold(run, 1);
    expect(run.threads).toHaveLength(0);
    expect(lost(run, i)).toBe(45);
  });

  it('avant le niveau 6, le fil rompu n\'éclate pas', () => {
    const run = quiet(armed('weapon.wake', 5));
    const i = at(run, 150, 30);
    lay(run, 100, 0, 200, 0);
    run.threads[0]!.life = 0.001;
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('deux fils croisés n\'éclatent pas sans l\'évolution', () => {
    const run = armed('weapon.wake');
    const near = at(run, 150, 40);
    lay(run, 100, 0, 200, 0);
    lay(run, 150, -50, 150, 20);
    hold(run, 1);
    expect(lost(run, near)).toBe(0);
  });
});

describe('Toile', () => {
  it('un fil neuf qui en croise un éclate au croisement : 130 dans 72 px', () => {
    const run = quiet(armed('weapon.web'));
    run.hero.stats.projectiles = 0;
    const near = at(run, 180, 40);
    const far = at(run, 150, 90);
    lay(run, 100, 0, 200, 0);
    hold(run, 1);
    expect(lost(run, near)).toBe(0);
    lay(run, 150, -50, 150, 12);
    hold(run, 1);
    expect(lost(run, near)).toBe(130);
    expect(lost(run, far)).toBe(0);
  });

  it('une fois par paire', () => {
    const run = quiet(armed('weapon.web'));
    const near = at(run, 180, 40);
    lay(run, 100, 0, 200, 0);
    lay(run, 150, -50, 150, 12);
    hold(run, 60);
    expect(lost(run, near)).toBe(130);
  });

  it('une ruée qui part d\'où la précédente s\'est arrêtée ne croise rien', () => {
    const run = quiet(armed('weapon.web'));
    const near = at(run, 200, 40);
    lay(run, 100, 0, 200, 0);
    lay(run, 200, 0, 260, -60);
    // Et un retour sur ses pas.
    lay(run, 260, -60, 200, 0);
    hold(run, 1);
    expect(lost(run, near)).toBe(0);
  });

  it('un fil qui traverse le milieu d\'un autre éclate, même près d\'un bout', () => {
    const run = quiet(armed('weapon.web'));
    const near = at(run, 190, 40);
    lay(run, 100, 0, 200, 0);
    lay(run, 190, -50, 190, 10);
    hold(run, 1);
    expect(lost(run, near)).toBeGreaterThanOrEqual(130);
  });

  it('deux fils qui ne se croisent pas n\'éclatent pas', () => {
    const run = quiet(armed('weapon.web'));
    const near = at(run, 150, 40);
    lay(run, 100, 0, 200, 0);
    lay(run, 100, -30, 200, -30);
    hold(run, 1);
    expect(lost(run, near)).toBe(0);
  });

  it('évoluer garde les fils vivants', () => {
    const run = quiet(armed('weapon.wake', 6));
    lay(run, 100, 0, 200, 0);
    evolveWeapon(run, run.weapons[0]!);
    const i = at(run, 150);
    hold(run, 1);
    expect(run.threads).toHaveLength(1);
    expect(lost(run, i)).toBe(38);
  });
});
