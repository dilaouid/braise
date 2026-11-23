import { describe, expect, it } from 'vitest';
import { addPickup } from '../../src/core/combat.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { PK_ASH, PK_CALL, PK_CHEST, PK_DROP, PK_GEM, PK_GOLD, type Poi, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun } from './helpers.ts';

function at(run: Run, kind: Poi['kind']): Poi {
  const poi = run.map.pois.find((p) => p.kind === kind)!;
  run.hero.x = poi.x;
  run.hero.y = poi.y + 4;
  run.hero.px = run.hero.x;
  run.hero.py = run.hero.y;
  return poi;
}

function steps(run: Run, n: number): void {
  const input = idleInput();
  for (let i = 0; i < n && run.phase === 'playing'; i++) {
    stepRun(run, input);
    run.evCount = 0;
  }
}

describe('événements de la carte (document 02 §7)', () => {
  it('braséro : rester 8 s dans le cercle pendant qu\'une vague converge donne un coffre de braise', () => {
    const run = makeRun(31);
    makeImmortal(run);
    const poi = at(run, 'brazier');
    steps(run, 2);
    expect(poi.state).toBe(1);
    expect(run.enemies.count).toBeGreaterThanOrEqual(10);
    steps(run, 7 * 60);
    expect(poi.state).toBe(1);
    // Le coffre tombe à côté du braséro : on vérifie qu'il est posé avant d'être ramassé.
    let lit = false;
    for (let i = 0; i < 90 && !lit; i++) {
      steps(run, 1);
      lit = poi.state === 2;
    }
    expect(lit).toBe(true);
    expect(run.braziersLit).toBe(1);
  });

  it('braséro : sortir du cercle fait retomber la flamme', () => {
    const run = makeRun(31);
    makeImmortal(run);
    const poi = at(run, 'brazier');
    steps(run, 3 * 60);
    const before = poi.progress;
    expect(before).toBeGreaterThan(2.5);
    run.hero.x += 200;
    steps(run, 60);
    expect(poi.progress).toBeLessThan(before);
  });

  it('source claire : soin complet, une seule fois', () => {
    const run = makeRun(32);
    run.hero.hp = 10;
    const poi = at(run, 'spring');
    steps(run, 2);
    expect(run.hero.hp).toBe(run.hero.stats.maxHp);
    expect(poi.state).toBe(2);
    run.hero.hp = 10;
    steps(run, 2);
    expect(run.hero.hp).toBeLessThan(15);
  });

  it('source claire : un héros en pleine forme ne la consomme pas', () => {
    const run = makeRun(32);
    const poi = at(run, 'spring');
    steps(run, 5);
    expect(poi.state).toBe(0);
  });

  it('cache de Veilleur : un élite la garde ; battu, la cache s\'ouvre', () => {
    const run = makeRun(33);
    makeImmortal(run);
    const poi = at(run, 'cache');
    steps(run, 2);
    expect(poi.state).toBe(1);
    const e = run.enemies;
    let guard = -1;
    for (let i = 0; i < e.count; i++) if (e.uid[i] === poi.guardUid) guard = i;
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(data.enemies[e.kind[guard]!]!.rank).toBe('elite');
    steps(run, 30);
    expect(poi.state).toBe(1);
    for (let i = 0; i < e.count; i++) if (e.uid[i] === poi.guardUid) e.hp[i] = 0;
    run.hero.x = poi.x;
    run.hero.y = poi.y + 4;
    steps(run, 3);
    expect(poi.state).toBe(2);
    expect(run.hero.elites).toBe(1);
  });

  it('chaque carte a au moins 2 braséros, 1 cache et 1 source', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = makeRun(seed);
      const count = (k: Poi['kind']): number => run.map.pois.filter((p) => p.kind === k).length;
      expect(count('brazier')).toBeGreaterThanOrEqual(2);
      expect(count('cache')).toBeGreaterThanOrEqual(1);
      expect(count('spring')).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('ramassables', () => {
  it('or, Cendres, goutte de braise et coffre font ce qu\'ils disent', () => {
    const run = makeRun(40);
    run.director.waveIdx = 99;
    const h = run.hero;
    h.flasks = 0;
    addPickup(run, PK_GOLD, h.x + 4, h.y - 6, 7);
    addPickup(run, PK_ASH, h.x - 4, h.y - 6, 5);
    addPickup(run, PK_DROP, h.x, h.y - 2, 1);
    steps(run, 20);
    expect(h.gold).toBe(7);
    expect(h.ashDrops).toBe(5);
    expect(h.flasks).toBe(1);
    addPickup(run, PK_CHEST, h.x, h.y - 6, 1);
    steps(run, 20);
    expect(run.phase).toBe('chest');
    expect(run.chest!.gold).toBeGreaterThanOrEqual(data.tuning.gold.chest[0]);
  });

  it('l\'Appel de la flamme attire toutes les gemmes de la carte', () => {
    const run = makeRun(41);
    run.director.waveIdx = 99;
    const h = run.hero;
    for (let k = 0; k < 6; k++) addPickup(run, PK_GEM, h.x + 300 + k * 10, h.y + 250, 1);
    addPickup(run, PK_CALL, h.x, h.y - 6, 1);
    steps(run, 30);
    expect(h.gems).toBe(0);
    const input = idleInput();
    for (let i = 0; i < 600 && h.gems < 6; i++) {
      run.director.budget = 0;
      if (run.phase === 'levelup') break;
      stepRun(run, input);
    }
    expect(h.gems + (run.phase === 'levelup' ? 6 : 0)).toBeGreaterThanOrEqual(6);
  });

  it('au-delà de 400 gemmes au sol, les plus anciennes fusionnent en une gemme rouge qui garde leur total', () => {
    const run = makeRun(42);
    const h = run.hero;
    let total = 0;
    for (let k = 0; k < 520; k++) {
      addPickup(run, PK_GEM, h.x + 600 + (k % 40) * 4, h.y + 600 + Math.floor(k / 40) * 4, 1);
      total += 1;
    }
    const p = run.pickups;
    expect(p.count).toBeLessThanOrEqual(data.tuning.gems.mergeAbove + 1);
    let sum = 0;
    for (let i = 0; i < p.count; i++) sum += p.value[i]!;
    expect(sum).toBe(total);
  });

  it('la fiole rend 30 % des points de vie et consomme une charge', () => {
    const run = makeRun(43);
    run.director.waveIdx = 99;
    const h = run.hero;
    h.hp = 10;
    const input = idleInput();
    input.flask = true;
    stepRun(run, input);
    expect(h.flasks).toBe(1);
    expect(h.hp).toBeGreaterThanOrEqual(10 + Math.floor(h.stats.maxHp * 0.3));
    expect(h.hp).toBeLessThan(10 + h.stats.maxHp * 0.3 + 1);
  });
});
