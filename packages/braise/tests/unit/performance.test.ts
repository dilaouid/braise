import { describe, expect, it } from 'vitest';
import { addPickup, spawnEnemy } from '../../src/core/combat.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { PK_GEM } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun, makeSave } from './helpers.ts';

describe('performance (document 02 §15)', () => {
  it('avec 350 ennemis, 300 projectiles et 400 gemmes, un pas prend moins de 4 ms', () => {
    const run = makeRun(5, makeSave(30));
    const hero = run.hero;
    run.cfg.sheet.projectiles = 150;
    makeImmortal(run);
    // Un build chargé : les six armes au niveau 6.
    for (const w of data.weapons) {
      if (w.evolved || run.weapons.some((x) => x.def === w.index)) continue;
      run.weapons.push({ ...run.weapons[0]!, def: w.index, level: 6, order: run.weapons.length });
    }
    run.weapons[0]!.level = 6;
    run.time = 8 * 60;
    for (let i = 0; i < 350; i++) {
      const a = (i / 350) * Math.PI * 2;
      const r = 60 + (i % 7) * 30;
      spawnEnemy(run, i % 4, hero.x + Math.cos(a) * r, hero.y + Math.sin(a) * r, 1000);
    }
    for (let i = 0; i < 400; i++) addPickup(run, PK_GEM, hero.x + 300 + (i % 20) * 6, hero.y + 300 + Math.floor(i / 20) * 6, 1);
    const input = idleInput();
    input.moveX = 0.3;
    // Échauffement, pour laisser le moteur compiler le code chaud.
    for (let i = 0; i < 240; i++) {
      stepRun(run, input);
      run.evCount = 0;
    }
    let maxShots = 0;
    const samples = 600;
    const start = performance.now();
    for (let i = 0; i < samples; i++) {
      stepRun(run, input);
      run.evCount = 0;
      maxShots = Math.max(maxShots, run.shots.count);
    }
    const perStep = (performance.now() - start) / samples;
    expect(run.phase).toBe('playing');
    expect(run.enemies.count).toBeGreaterThanOrEqual(300);
    expect(maxShots).toBeGreaterThanOrEqual(300);
    expect(perStep).toBeLessThan(4);
  });
});
