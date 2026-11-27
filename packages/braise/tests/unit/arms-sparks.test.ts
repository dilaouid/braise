import { describe, expect, it } from 'vitest';
import { spawnEnemy, tickStatuses } from '../../src/core/combat.ts';
import { buildGrid } from '../../src/core/stores.ts';
import { STEP, type Run } from '../../src/core/types.ts';
import { updateShots, updateWeapons } from '../../src/core/weapons.ts';
import { armed, lost } from './arms-helpers.ts';
import { data } from './helpers.ts';

const stag = data.enemies.findIndex((e) => e.id === 'boss.lightless-stag');

/** Le Cerf, immobile et increvable, à cette distance de Moon. */
function bossAt(run: Run, x: number): number {
  const i = spawnEnemy(run, stag, run.hero.x + x, run.hero.y, 1);
  run.enemies.hp[i] = 1e7;
  run.enemies.maxHp[i] = 1e7;
  return i;
}

/** Les armes tirent et les tirs volent ; personne ne bouge. */
function fly(run: Run, seconds: number): void {
  for (let s = 0; s < Math.round(seconds / STEP); s++) {
    for (let i = 0; i < run.enemies.count; i++) tickStatuses(run, i, STEP);
    buildGrid(run);
    updateWeapons(run, STEP);
    updateShots(run, STEP);
    run.evCount = 0;
  }
}

describe('Nuée ardente', () => {
  it('ses étincelles faiblissent en volant : de loin, le boss prend bien moins', () => {
    const near = armed('weapon.ardent-swarm');
    const a = bossAt(near, 50);
    fly(near, 10);
    const far = armed('weapon.ardent-swarm');
    const b = bossAt(far, 270);
    fly(far, 10);
    expect(lost(far, b)).toBeGreaterThan(0);
    expect(lost(far, b)).toBeLessThan(lost(near, a) * 0.7);
  });

  it('ne vise rien au-delà de 288 px : on ne tue plus le boss hors de l\'écran', () => {
    const run = armed('weapon.ardent-swarm');
    const i = bossAt(run, 330);
    fly(run, 5);
    expect(lost(run, i)).toBe(0);
  });
});
