import type { Rng } from '@owl/kit/rng';
import type { ExpeditionTuning, RegionDef } from '../content/index.ts';
import type { GameMap, Poi, Prop } from './types.ts';

/** Écart minimal entre deux amas d'obstacles : aucun couloir de moins de 4 tuiles. */
const MIN_GAP = 4;

/** Vrai si le point (en pixels) est dans une tuile pleine ou hors de la carte. */
export function isSolidAt(map: GameMap, x: number, y: number): boolean {
  const tx = Math.floor(x / map.tile);
  const ty = Math.floor(y / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) return true;
  return map.solid[ty * map.size + tx] !== 0;
}

/** Vrai si la tuile est pleine ou hors de la carte. */
export function isSolidTile(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) return true;
  return map.solid[ty * map.size + tx] !== 0;
}

function valueNoise(rng: Rng, cells: number): Float32Array {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng.float();
  return grid;
}

function sampleNoise(grid: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.min(cells - 1, Math.floor(x));
  const y0 = Math.min(cells - 1, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = cells + 1;
  const a = grid[y0 * w + x0]!;
  const b = grid[y0 * w + x0 + 1]!;
  const c = grid[(y0 + 1) * w + x0]!;
  const d = grid[(y0 + 1) * w + x0 + 1]!;
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Génère la carte d'une expédition à partir du flux « carte » :
 * bordure, amas d'obstacles, points d'intérêt, terrain.
 */
export function generateMap(rng: Rng, tuning: ExpeditionTuning, region: RegionDef): GameMap {
  const size = tuning.mapTiles;
  const tile = tuning.tileSize;
  const border = tuning.borderTiles;
  const solid = new Uint8Array(size * size);
  const center = size / 2;
  const props: Prop[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < border || y < border || x >= size - border || y >= size - border) solid[y * size + x] = 2;
    }
  }

  // Points d'intérêt : loin du centre, loin les uns des autres.
  const ev = tuning.events;
  const kinds: Poi['kind'][] = [];
  for (let i = 0; i < ev.brazier.count; i++) kinds.push('brazier');
  for (let i = 0; i < ev.spring.count; i++) kinds.push('spring');
  for (let i = 0; i < ev.cache.count; i++) kinds.push('cache');
  rng.shuffle(kinds);
  const pois: Poi[] = [];
  const margin = border + 8;
  for (const kind of kinds) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const tx = rng.intRange(margin, size - margin - 1);
      const ty = rng.intRange(margin, size - margin - 1);
      if (Math.hypot(tx - center, ty - center) < ev.poiMinFromCenterTiles) continue;
      let ok = true;
      for (const p of pois) {
        if (Math.hypot(p.x / tile - tx, p.y / tile - ty) < ev.poiMinApartTiles) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pois.push({ kind, x: (tx + 0.5) * tile, y: (ty + 0.5) * tile, state: 0, progress: 0, discovered: false, guardUid: 0 });
      break;
    }
  }

  // Zones à garder libres : la clairière de départ et les abords des points d'intérêt.
  const reserved = new Uint8Array(size * size);
  const reserve = (cx: number, cy: number, radius: number): void => {
    const r = Math.ceil(radius);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) reserved[y * size + x] = 1;
      }
    }
  };
  reserve(center, center, tuning.startClearingTiles);
  for (const p of pois) reserve(p.x / tile, p.y / tile, 4);

  // Amas d'obstacles, séparés d'au moins MIN_GAP tuiles.
  const interior = (size - border * 2) * (size - border * 2);
  const target = rng.range(tuning.obstacleCoverage[0], tuning.obstacleCoverage[1]);
  const decorWeights = region.decor.map((d) => d.weight);
  let covered = 0;
  const cluster: number[] = [];
  for (let attempt = 0; attempt < 60000 && covered / interior < target; attempt++) {
    const w = rng.intRange(2, 4);
    const h = rng.intRange(2, 4);
    const x0 = rng.intRange(border + 2, size - border - 2 - w);
    const y0 = rng.intRange(border + 2, size - border - 2 - h);
    let ok = true;
    for (let y = y0 - MIN_GAP; y < y0 + h + MIN_GAP && ok; y++) {
      for (let x = x0 - MIN_GAP; x < x0 + w + MIN_GAP; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inside = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
        if (solid[y * size + x] === 1 || (inside && reserved[y * size + x] === 1)) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    cluster.length = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        // Coins rognés au hasard : des amas, pas des rectangles.
        const corner = (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1);
        if (corner && rng.chance(0.55)) continue;
        cluster.push(y * size + x);
      }
    }
    const decor = rng.weighted(decorWeights);
    for (const idx of cluster) {
      solid[idx] = 1;
      covered++;
      const x = idx % size;
      const y = Math.floor(idx / size);
      props.push({
        decor: rng.chance(0.7) ? decor : rng.weighted(decorWeights),
        x: (x + 0.5) * tile + rng.intRange(-4, 4),
        y: (y + 0.85) * tile + rng.intRange(-3, 3),
      });
    }
  }

  // La bordure : deux rangées d'arbres visibles suffisent, la caméra ne sort pas de la carte.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (solid[y * size + x] !== 2) continue;
      const depth = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (depth === 0) continue;
      if ((x + y) % 2 === 0 || depth === border - 1) {
        props.push({ decor: -1, x: (x + 0.5) * tile + rng.intRange(-5, 5), y: (y + 0.9) * tile + rng.intRange(-4, 4) });
      }
    }
  }
  props.sort((a, b) => a.y - b.y);

  // Terrain : des plaques de chemin dans la cendre, la clairière et les points d'intérêt en terre battue.
  const cs = size + 1;
  const corners = new Uint8Array(cs * cs);
  const noise = valueNoise(rng, 14);
  for (let y = 0; y < cs; y++) {
    for (let x = 0; x < cs; x++) {
      let path = sampleNoise(noise, 14, x / size, y / size) > 0.63;
      if (Math.hypot(x - center, y - center) < 5) path = true;
      for (const p of pois) if (Math.hypot(x - p.x / tile, y - p.y / tile) < 3) path = true;
      corners[y * cs + x] = path ? 1 : 0;
    }
  }

  return { size, tile, solid, corners, props, pois, coverage: covered / interior };
}
