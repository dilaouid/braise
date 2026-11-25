import { describe, expect, it } from 'vitest';
import { Rng } from '@owl/kit/rng';
import { FR } from '../../src/content/index.ts';
import { generateMap } from '../../src/core/map.ts';
import type { GameMap, Poi } from '../../src/core/types.ts';
import { data, REGION } from './helpers.ts';

const EXPECTED: Record<string, number> = { brazier: 4, spring: 2, cache: 2, totem: 6, smith: 2, herbalist: 2, treasure: 4 };

function map(seed: number): GameMap {
  return generateMap(new Rng(seed), data.tuning, data.regions[REGION]!);
}

function count(pois: Poi[], kind: string): number {
  return pois.filter((p) => p.kind === kind).length;
}

describe('carte vivante : placement des lieux', () => {
  it('les 22 lieux sont posés sur 200 graines, hors des obstacles et à bonne distance', () => {
    const apart = data.tuning.events.poiMinApartTiles;
    for (let seed = 1; seed <= 200; seed++) {
      const m = map(seed);
      for (const [kind, n] of Object.entries(EXPECTED)) expect(count(m.pois, kind), `graine ${seed}, ${kind}`).toBe(n);
      expect(m.pois.length).toBe(22);
      for (const p of m.pois) {
        const tx = Math.floor(p.x / m.tile);
        const ty = Math.floor(p.y / m.tile);
        expect(m.solid[ty * m.size + tx]).toBe(0);
        for (const q of m.pois) {
          if (q === p) continue;
          expect(Math.hypot(p.x - q.x, p.y - q.y) / m.tile).toBeGreaterThanOrEqual(apart);
        }
      }
    }
  });

  it('chaque lieu est atteignable depuis le centre', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = map(seed);
      const seen = new Uint8Array(m.size * m.size);
      const start = Math.floor(m.size / 2) * m.size + Math.floor(m.size / 2);
      const queue = [start];
      seen[start] = 1;
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const x = cur % m.size;
        const y = Math.floor(cur / m.size);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
          const idx = ny * m.size + nx;
          if (seen[idx] || m.solid[idx] !== 0) continue;
          seen[idx] = 1;
          queue.push(idx);
        }
      }
      for (const p of m.pois) {
        expect(seen[Math.floor(p.y / m.tile) * m.size + Math.floor(p.x / m.tile)], `graine ${seed}, ${p.kind}`).toBe(1);
      }
    }
  });

  it('le contenu a 12 trouvailles, chacune avec un effet et ses textes', () => {
    expect(data.finds.length).toBe(12);
    const ids = data.finds.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of data.finds) {
      expect(Object.keys(d.bonus).length).toBeGreaterThan(0);
      expect(FR[`${d.id}.name`]).toBeTruthy();
      expect(FR[`${d.id}.desc`]).toBeTruthy();
    }
  });
});
