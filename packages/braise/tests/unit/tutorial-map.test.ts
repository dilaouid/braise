import { describe, expect, it } from 'vitest';
import { isSolidAt } from '../../src/core/map.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { TILE_GATE, TILE_THICKET, type Run } from '../../src/core/types.ts';
import { data, makeRun, makeTutorial, tutoMarker as marker } from './helpers.ts';

const T = data.tuning.tileSize;

function place(run: Run, x: number, y: number): void {
  run.hero.x = x;
  run.hero.y = y;
  run.hero.px = x;
  run.hero.py = y;
}

function steps(run: Run, n: number, input: Partial<ReturnType<typeof idleInput>>): void {
  for (let i = 0; i < n; i++) stepRun(run, { ...idleInput(), ...input });
}

describe('carte du tutoriel', () => {
  it('la carte suit la grille', () => {
    const run = makeTutorial();
    const def = data.tutorial;
    const at = (x: number, y: number): number => run.map.solid[y * def.size + x]!;
    expect(run.map.size).toBe(def.size);
    expect(at(0, 0)).toBe(1);
    expect(at(5, 5)).toBe(0);
    expect(at(14, 8)).toBe(TILE_GATE);
    expect(at(40, 16)).toBe(TILE_THICKET);
    const s = marker('start');
    expect(isSolidAt(run.map, s.x, s.y)).toBe(false);
  });

  it('le héros part du repère de départ, avec une seule trouvaille en réserve', () => {
    const run = makeTutorial();
    expect({ x: run.hero.x, y: run.hero.y }).toEqual(marker('start'));
    expect(run.tutorial).not.toBeNull();
    expect(run.findPool).toEqual([data.tutorial.find]);
    expect(run.map.pois).toEqual([]);
  });

  it('une partie normale n\'a pas d\'état de tutoriel', () => {
    expect(makeRun().tutorial).toBeNull();
  });

  it('les murs visibles portent un décor, pas ceux qui sont dans le noir', () => {
    const run = makeTutorial();
    expect(run.map.props.length).toBeGreaterThan(100);
    // Le coin de la carte ne touche aucune tuile de sol.
    expect(run.map.props.some((p) => p.x < T && p.y < T)).toBe(false);
  });

  it('à pied, la rangée arrête Moon', () => {
    const run = makeTutorial();
    const o = marker('r3in');
    place(run, o.x, o.y);
    steps(run, 240, { moveY: 1 });
    expect(run.hero.y).toBeLessThan(16 * T);
    expect(isSolidAt(run.map, run.hero.x, run.hero.y)).toBe(false);
  });

  it('une ruée traverse la rangée', () => {
    const run = makeTutorial();
    const o = marker('r3in');
    place(run, o.x, o.y);
    steps(run, 240, { moveY: 1 });
    steps(run, 1, { moveY: 1, dash: true });
    steps(run, 60, {});
    expect(run.hero.y).toBeGreaterThan(17 * T);
    expect(isSolidAt(run.map, run.hero.x, run.hero.y)).toBe(false);
    expect(run.tutorial!.notes.dash).toBe(1);
  });

  it.each([
    ['de 50 px', 0, 16 * T - 7 - 50, 0, 1],
    ['de 30 px', 0, 16 * T - 7 - 30, 0, 1],
    ['au contact', 0, 16 * T - 7, 0, 1],
    ['en diagonale', 10, 16 * T - 7 - 40, 0.5, 1],
    ['presque de côté', 0, 16 * T - 7 - 5, 1, 0.5],
    ['presque de côté, à gauche', 0, 16 * T - 7 - 5, -1, 0.5],
    ['vers le haut, depuis le bas', 0, 17 * T + 7 + 30, 0, -1],
  ])('une ruée lancée %s ne laisse jamais Moon dans la rangée', (_name, dx, startY, mx, my) => {
    const run = makeTutorial();
    // La rangée occupe la ligne 16 du couloir (colonnes 39 à 41).
    place(run, 40.5 * T + dx, startY);
    steps(run, 1, { moveX: mx, moveY: my, dash: true });
    steps(run, 90, {});
    const map = run.map;
    const r = data.tuning.hero.radius;
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      const tx = Math.floor((run.hero.x + ox) / T);
      const ty = Math.floor((run.hero.y + oy) / T);
      expect(map.solid[ty * map.size + tx], `tuile sous Moon (${ox}, ${oy})`).toBe(0);
    }
  });

  it('la barrière arrête Moon, même en ruée', () => {
    const run = makeTutorial();
    const a = marker('door0');
    place(run, a.x, a.y);
    steps(run, 120, { moveX: 1 });
    steps(run, 1, { moveX: 1, dash: true });
    steps(run, 60, { moveX: 1 });
    expect(run.hero.x).toBeLessThan(14 * T);
  });
});
