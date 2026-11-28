import { describe, expect, it } from 'vitest';
import { nightClock, updateDirector } from '../../src/core/director.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { enemyHpScale } from '../../src/core/stats.ts';
import { data, makeRun } from './helpers.ts';

const STEP = 1 / 60;

describe('l\'horloge de la Nuit', () => {
  it('la Nuit avance comme le chrono', () => {
    const run = makeRun(5);
    const input = idleInput();
    for (let i = 0; i < 600 && run.phase === 'playing'; i++) {
      stepRun(run, input);
      run.evCount = 0;
    }
    expect(run.night).toBeCloseTo(run.time / 60, 6);
    expect(run.night).toBeCloseTo(10 / 60, 6);
  });

  it('la difficulté suit la Nuit, pas le chrono', () => {
    const late = makeRun(5);
    late.time = 0;
    late.night = 10;
    updateDirector(late, STEP);
    const early = makeRun(5);
    early.time = 600;
    early.night = 0;
    updateDirector(early, STEP);
    expect(late.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, 10, 0, 0), 6);
    expect(early.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, 0, 0, 0), 6);
  });

  it('le boss vient à 15:00 de Nuit', () => {
    const run = makeRun(5);
    run.time = 60;
    run.night = 15;
    updateDirector(run, STEP);
    expect(run.director.bossSpawned).toBe(true);
    expect(run.bossCall).toBe('night');
  });

  it('pendant le boss, l\'échelle est celle de 15:00', () => {
    const run = makeRun(5);
    run.night = 15;
    updateDirector(run, STEP);
    run.night = 3;
    expect(nightClock(run)).toBe(data.tuning.durationMin);
    updateDirector(run, STEP);
    expect(run.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, data.tuning.durationMin, 0, 0), 6);
  });
});
