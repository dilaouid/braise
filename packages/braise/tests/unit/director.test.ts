import { describe, expect, it } from 'vitest';
import { updateDirector } from '../../src/core/director.ts';
import type { Run } from '../../src/core/types.ts';
import { data, makeRun } from './helpers.ts';

const STEP = 1 / 60;
const kindOf = (id: string): number => data.enemies.findIndex((e) => e.id === id);
const CRAWLER = kindOf('enemy.crawler');
const STUMP = kindOf('enemy.dead-stump');

/** Une partie où seul le directeur joue, avec ces poids à toute heure. */
function hordeRun(weights: Record<number, number>, seed = 1): Run {
  const run = makeRun(seed);
  const table = new Float32Array(data.enemies.length);
  for (const k of Object.keys(weights)) table[Number(k)] = weights[Number(k)]!;
  run.region = { ...run.region, waves: [], horde: [{ from: 0, to: 15, weights: table }] };
  run.director.eliteIdx = 99;
  run.time = 10 * 60;
  return run;
}

describe('le directeur de horde (document 02 §8)', () => {
  it('une sorte chère est achetée aussi souvent que son poids le dit', () => {
    const run = hordeRun({ [CRAWLER]: 50, [STUMP]: 50 });
    const counts = { crawler: 0, stump: 0 };
    for (let s = 0; s < 120 * 60; s++) {
      const e = run.enemies;
      const before = e.count;
      updateDirector(run, STEP);
      for (let i = before; i < e.count; i++) {
        if (e.kind[i] === CRAWLER) counts.crawler++;
        else if (e.kind[i] === STUMP) counts.stump++;
      }
      // Toujours un ennemi vivant : le sursaut d'écran vide ne joue pas.
      if (e.count > 200) e.count = 1;
    }
    const total = counts.crawler + counts.stump;
    expect(total).toBeGreaterThan(200);
    expect(counts.stump / total).toBeGreaterThan(0.4);
    expect(counts.stump / total).toBeLessThan(0.6);
  });

  it('une sorte retenue qui quitte la tranche est retirée au sort', () => {
    const run = hordeRun({ [CRAWLER]: 100 });
    run.director.nextKind = STUMP;
    run.director.budget = 1.5;
    updateDirector(run, STEP);
    const e = run.enemies;
    expect(e.count).toBeGreaterThan(0);
    for (let i = 0; i < e.count; i++) expect(e.kind[i]).toBe(CRAWLER);
  });

  it('avant 8:00, la horde n\'achète aucun cracheur ; ensuite, toutes les sortes viennent', () => {
    const region = makeRun().region;
    const spitter = kindOf('enemy.soot-spitter');
    for (const slice of region.horde) {
      if (slice.from < 8) expect(slice.weights[spitter]).toBe(0);
      else for (const id of ['crawler', 'soot-bat', 'soot-spitter', 'dead-stump', 'ash-swarm']) expect(slice.weights[kindOf(`enemy.${id}`)]).toBeGreaterThan(0);
    }
  });

  it('après 9:00, jamais plus de 60 s sans vague ni élite, jusqu\'au boss', () => {
    const marks = [...makeRun().region.waves.map((w) => w.at), ...data.tuning.eliteMinutes, data.tuning.durationMin]
      .filter((at) => at >= 9).sort((a, b) => a - b);
    for (let i = 1; i < marks.length; i++) expect(marks[i]! - marks[i - 1]!, `après ${marks[i - 1]}`).toBeLessThanOrEqual(1);
  });
});
