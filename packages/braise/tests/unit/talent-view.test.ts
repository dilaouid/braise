import { describe, expect, it } from 'vitest';
import { FR } from '../../src/content/index.ts';
import { frNum, talentEffects, talentSlots, treeStep, type Slot } from '../../src/ui/talent-view.ts';
import { CLASS, data } from './helpers.ts';

const cls = data.classes[CLASS]!;
const all = talentSlots(cls);
const at = (id: string): Slot => all.find((s) => s.node.id === id)!;
const tr = (key: string, vars?: Record<string, string | number>): string => {
  let text = FR[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
};
const step = (id: string, dx: number, dy: number, prefer = 0): string | undefined => treeStep(all, at(id), dx, dy, prefer)?.node.id;

describe("l'arbre de Moon : la croix", () => {
  it('le Maître en haut, le premier étage en bas', () => {
    expect(at('talent.last-stand').row).toBe(0);
    expect(at('talent.thick-hide').row).toBe(3);
  });

  it("à gauche et à droite, on reste sur l'étage, d'une branche à l'autre", () => {
    // Le bug d'origine : depuis un nœud seul, la gauche descendait et la droite montait.
    expect(step('talent.feint', -1, 0)).toBe('talent.second-wind');
    expect(step('talent.feint', 1, 0)).toBe('talent.halo');
    expect(step('talent.elusive', -1, 0)).toBe('talent.last-stand');
    expect(step('talent.deep-draught', 1, 0)).toBe('talent.second-dash');
    expect(step('talent.second-dash', -1, 0)).toBe('talent.deep-draught');
    expect(step('talent.thick-hide', -1, 0)).toBeUndefined();
    expect(step('talent.beacon', 1, 0)).toBeUndefined();
  });

  it("en haut et en bas, on reste dans la branche, du côté d'où l'on vient", () => {
    expect(step('talent.thick-hide', 0, -1)).toBe('talent.spare-flask');
    expect(step('talent.steady-foot', 0, -1)).toBe('talent.deep-draught');
    expect(step('talent.deep-draught', 0, -1)).toBe('talent.second-wind');
    expect(step('talent.second-wind', 0, 1, 1)).toBe('talent.deep-draught');
    expect(step('talent.second-wind', 0, 1, 0)).toBe('talent.spare-flask');
    expect(step('talent.last-stand', 0, -1)).toBeUndefined();
    expect(step('talent.thick-hide', 0, 1)).toBeUndefined();
  });

  it('chaque nœud se rejoint depuis le premier', () => {
    const seen = new Set<string>(['talent.thick-hide']);
    const queue = ['talent.thick-hide'];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (const prefer of [0, 1, 2, 3, 4, 5]) {
          const to = step(id, dx, dy, prefer);
          if (to && !seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
        }
      }
    }
    expect(seen.size).toBe(cls.tree.nodes.length);
  });
});

describe("l'arbre de Moon : ce que dit chaque nœud", () => {
  const node = (id: string) => cls.tree.nodes.find((n) => n.id === id)!;

  it('un nombre à la française', () => {
    expect(frNum(15)).toBe('15');
    expect(frNum(0.15000000000000002)).toBe('0,15');
    expect(frNum(1.5)).toBe('1,5');
  });

  it('un bonus par rang : le total du rang', () => {
    expect(talentEffects(node('talent.wide-fire'), 0, tr)).toEqual([]);
    expect(talentEffects(node('talent.wide-fire'), 2, tr)).toEqual(['+6 % de Zone']);
    expect(talentEffects(node('talent.wide-fire'), 3, tr)).toEqual(['+9 % de Zone']);
    expect(talentEffects(node('talent.steady-foot'), 3, tr)).toEqual(['+0,45 PV par seconde']);
    expect(talentEffects(node('talent.light-legs'), 5, tr)).toEqual(['+7,5 % de vitesse']);
  });

  it("des rangs à paliers : l'effet du rang, tout compris", () => {
    expect(talentEffects(node('talent.spare-flask'), 1, tr)).toEqual(['+1 fiole']);
    expect(talentEffects(node('talent.spare-flask'), 3, tr)).toEqual(['+2 fioles', 'Fioles : +10 % de soin']);
    expect(talentEffects(node('talent.supple'), 2, tr)).toEqual(['−8 % de recharge de ruée']);
    expect(talentEffects(node('talent.second-wind'), 3, tr)).toEqual(['Une fiole se remplit toutes les 50 s']);
  });

  it('chaque effet de chaque rang a son texte', () => {
    for (const n of cls.tree.nodes) {
      for (let r = 1; r <= n.ranks; r++) {
        const lines = talentEffects(n, r, tr);
        expect(lines.length, `${n.id} rang ${r}`).toBeGreaterThan(0);
        for (const line of lines) expect(line, `${n.id} rang ${r}`).not.toMatch(/talents\.fx|\{v\}|NaN|undefined/);
      }
    }
  });
});
