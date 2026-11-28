import { Rng } from '@owl/kit/rng';
import { describe, expect, it } from 'vitest';
import { generateMap, isSolidAt } from '../../src/core/map.ts';
import { data, REGION } from './helpers.ts';

const t = data.tuning;
const region = data.regions[REGION]!;

describe('carte (document 02 §3)', () => {
  it('la même graine donne la même carte', () => {
    const a = generateMap(new Rng(99), t, region);
    const b = generateMap(new Rng(99), t, region);
    expect(Array.from(a.solid)).toEqual(Array.from(b.solid));
    expect(a.pois).toEqual(b.pois);
  });

  it('120 × 120 tuiles, bordure pleine, obstacles sur 6 à 10 % de l\'intérieur', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const map = generateMap(new Rng(seed), t, region);
      expect(map.size).toBe(120);
      expect(map.solid[0]).toBe(2);
      expect(map.coverage, `graine ${seed}`).toBeGreaterThanOrEqual(0.06);
      expect(map.coverage, `graine ${seed}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('la clairière de départ est sans obstacle sur 12 tuiles de rayon', () => {
    const map = generateMap(new Rng(7), t, region);
    const c = map.size / 2;
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= 12) expect(map.solid[y * map.size + x]).toBe(0);
      }
    }
  });

  it('22 lieux, à 20 tuiles du centre et à bonne distance les uns des autres, et la cloche au centre', () => {
    for (const seed of [1, 2, 3, 4]) {
      const full = generateMap(new Rng(seed), t, region);
      const bells = full.pois.filter((p) => p.kind === 'bell');
      expect(bells.length).toBe(1);
      expect(bells[0]!.x).toBe((full.size * full.tile) / 2);
      // Les lieux tirés au sort : tout sauf la cloche.
      const map = { ...full, pois: full.pois.filter((p) => p.kind !== 'bell') };
      expect(map.pois.length).toBe(22);
      expect(map.pois.filter((p) => p.kind === 'brazier').length).toBeGreaterThanOrEqual(2);
      expect(map.pois.filter((p) => p.kind === 'spring').length).toBeGreaterThanOrEqual(1);
      expect(map.pois.filter((p) => p.kind === 'cache').length).toBeGreaterThanOrEqual(1);
      const center = (map.size * map.tile) / 2;
      for (const p of map.pois) {
        expect(Math.hypot(p.x - center, p.y - center) / map.tile).toBeGreaterThanOrEqual(20);
        expect(isSolidAt(map, p.x, p.y)).toBe(false);
        for (const q of map.pois) {
          if (q !== p) expect(Math.hypot(p.x - q.x, p.y - q.y) / map.tile).toBeGreaterThanOrEqual(t.events.poiMinApartTiles);
        }
      }
    }
  });

  it('aucun couloir de moins de 4 tuiles entre deux amas', () => {
    const map = generateMap(new Rng(12), t, region);
    const size = map.size;
    // Étiquette les amas, puis vérifie l'écart entre tuiles pleines d'amas différents.
    const label = new Int32Array(size * size).fill(-1);
    let next = 0;
    for (let i = 0; i < size * size; i++) {
      if (map.solid[i] !== 1 || label[i] !== -1) continue;
      const stack = [i];
      label[i] = next;
      while (stack.length) {
        const cur = stack.pop()!;
        const x = cur % size;
        const y = Math.floor(cur / size);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const n = (y + oy) * size + x + ox;
            if (map.solid[n] === 1 && label[n] === -1) {
              label[n] = next;
              stack.push(n);
            }
          }
        }
      }
      next++;
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = label[y * size + x]!;
        if (a < 0) continue;
        for (let oy = -4; oy <= 4; oy++) {
          for (let ox = -4; ox <= 4; ox++) {
            const b = label[(y + oy) * size + x + ox];
            if (b !== undefined && b >= 0) expect(b).toBe(a);
          }
        }
      }
    }
  });
});
