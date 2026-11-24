import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridStep } from '../../src/ui/grid.ts';
import { UI_SOUNDS } from '../../src/ui/store.ts';

const COLS = 5;
/** Les douze pièces en 4 × 3, et la case « Retirer » au bout de la première rangée. */
const cellOf = (piece: number): number => Math.floor(piece / 4) * COLS + (piece % 4);
const REMOVE = 4;

function reachable(cells: number[], from: number): Set<number> {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length > 0) {
    const at = todo.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = gridStep(cells, at, dx, dy, COLS);
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        todo.push(next);
      }
    }
  }
  return seen;
}

describe('se déplacer dans une grille à trous', () => {
  it('toute case se rejoint depuis toute autre, quelles que soient les pièces possédées', () => {
    for (let set = 1; set < 4096; set++) {
      const cells = Array.from({ length: 12 }, (_, i) => i).filter((i) => set & (1 << i)).map(cellOf);
      for (const all of [cells, [...cells, REMOVE]]) {
        for (const from of [all[0]!, all[all.length - 1]!]) expect(reachable(all, from).size, `${set}`).toBe(all.length);
      }
    }
  });

  it('une direction va là où l\'œil l\'attend', () => {
    const cells = [0, 1, 3, 6, 10, 13];
    expect(gridStep(cells, 0, 1, 0, COLS)).toBe(1);
    expect(gridStep(cells, 1, 1, 0, COLS)).toBe(3);
    expect(gridStep(cells, 0, -1, 0, COLS)).toBeNull();
    expect(gridStep(cells, 1, 0, 1, COLS)).toBe(6);
    expect(gridStep(cells, 6, 0, 1, COLS)).toBe(10);
    expect(gridStep(cells, 13, 0, -1, COLS)).toBe(6);
    expect(gridStep(cells, 13, 0, 1, COLS)).toBeNull();
  });
});

describe('sons d\'interface', () => {
  it('chacun existe', () => {
    const index = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'audio', 'index.json'), 'utf8')) as Record<string, string>;
    for (const name of Object.values(UI_SOUNDS)) expect(index[`sfx-${name}`], name).toBeDefined();
  });
});
