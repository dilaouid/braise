import { describe, expect, it } from 'vitest';
import { FR, RARITIES, RAW, compileContent } from '../../src/content/index.ts';
import { data } from './helpers.ts';

type RawFlames = { lines: Array<{ id: string; tiers: Array<{ rarity: string; stats?: Record<string, number>; mods?: Record<string, unknown> }> }> };

function broken(change: (f: RawFlames) => void): string {
  const raw = structuredClone(RAW);
  change(raw.flames as RawFlames);
  return compileContent(raw).errors.join('\n');
}

const line = (id: string) => data.flames.lines.find((l) => l.id === id)!;

describe('contenu des Flammes', () => {
  it('douze lignées et les réglages du design', () => {
    expect(compileContent().errors).toEqual([]);
    expect(RARITIES).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
    expect(data.flames.lines.length).toBe(12);
    expect(data.flames.lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(data.flames.costs).toEqual([0, 6, 8, 12, 16]);
    expect(data.flames.floor).toBe(0.2);
    expect(data.flames.caps).toEqual([0, 0, 0, 2, 1]);
    expect(data.flames.brazierRefund).toBe(10);
    expect(data.flames.fed).toEqual({ perLuck: 0.5, max: 0.4 });
  });

  it('les six anciens buffs gardent leur valeur en Commune', () => {
    expect(line('flame.stride').tiers[0]!.stats).toEqual({ speedShare: 0.06 });
    expect(line('flame.edge').tiers[0]!.stats).toEqual({ power: 0.07 });
    expect(line('flame.breath').tiers[0]!.stats).toEqual({ maxHpShare: 0.08 });
    expect(line('flame.wisdom').tiers[0]!.stats).toEqual({ wisdom: 0.1 });
    expect(line('flame.vein').tiers[0]!.stats).toEqual({ luck: 0.08 });
    expect(line('flame.glow').tiers[0]!.stats).toEqual({ glowShare: 0.15 });
  });

  it('les valeurs de règles du design', () => {
    expect(line('flame.surge').first).toBe(1);
    expect(line('flame.surge').last).toBe(4);
    expect(line('flame.surge').tiers[4]!.mods).toEqual({ dashCharges: 2, dashTrail: 10, dashCooldownMult: 0.8 });
    expect(line('flame.glow').tiers[2]).toEqual({ stats: { glowShare: 0.3 }, mods: { haloBurn: 3 }, elites: 0 });
    expect(line('flame.bait').tiers.map((t) => t?.elites)).toEqual([0, 0, 1, 2, undefined]);
    expect(line('flame.bait').tiers[3]!.mods.threatMult).toBe(1.5);
    expect(line('flame.shadow').tiers.map((t) => t?.mods.shadowCrit)).toEqual([undefined, 0.002, 0.0025, 0.0033, 0.005]);
    expect(line('flame.recall').tiers.map((t) => t?.mods.recallEvery)).toEqual([undefined, undefined, 40, 25, undefined]);
    expect(line('flame.swarm').tiers.map((t) => t?.stats.projectiles)).toEqual([undefined, undefined, 1, 2, 3]);
  });

  it('chaque lignée a des raretés qui se suivent, toutes avec un effet et un texte', () => {
    for (const l of data.flames.lines) {
      expect(FR[`${l.id}.name`], l.id).toBeTruthy();
      expect(l.tiers.length).toBe(RARITIES.length);
      for (let r = 0; r < RARITIES.length; r++) {
        const tier = l.tiers[r];
        if (r < l.first || r > l.last) {
          expect(tier, `${l.id} ${r}`).toBeNull();
          continue;
        }
        expect(tier, `${l.id} ${r}`).not.toBeNull();
        expect(Object.keys(tier!.stats).length + Object.keys(tier!.mods).length + tier!.elites, `${l.id} ${r}`).toBeGreaterThan(0);
        expect(FR[`${l.id}.${RARITIES[r]}`], `${l.id}.${RARITIES[r]}`).toBeTruthy();
      }
    }
    for (const r of RARITIES) expect(FR[`rarity.${r}`]).toBeTruthy();
  });

  it('au moins huit lignées commencent à Commune', () => {
    expect(data.flames.lines.filter((l) => l.first === 0).length).toBeGreaterThanOrEqual(8);
  });

  it('une lignée à trou, sans palier, ou à palier vide est refusée', () => {
    expect(broken((f) => f.lines[1]!.tiers.splice(1, 1))).toContain('flame.edge');
    expect(broken((f) => (f.lines[0]!.tiers = []))).toContain('flame.stride');
    expect(broken((f) => {
      f.lines[0]!.tiers[0]!.stats = {};
      f.lines[0]!.tiers[0]!.mods = {};
    })).toContain('flame.stride');
    expect(broken((f) => f.lines.push(structuredClone(f.lines[0]!)))).toContain('en double');
  });
});
