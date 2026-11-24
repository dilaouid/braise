import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { data } from './helpers.ts';

type RawLantern = {
  drops: Record<string, number>;
  runes: Array<{ id: string; levels: unknown[]; malus: Record<string, unknown> }>;
  glasses: Array<{ id: string; shifts?: Record<string, number>; clearsOpposite?: boolean }>;
};

function broken(change: (l: RawLantern, raw: typeof RAW) => void): string {
  const raw = structuredClone(RAW);
  change(raw.lantern as RawLantern, raw);
  return compileContent(raw).errors.join('\n');
}

describe('contenu de la Lanterne', () => {
  it('douze pièces', () => {
    expect(compileContent().errors).toEqual([]);
    expect(data.lantern.pieces.map((p) => p.id)).toEqual([
      'rune.hunger', 'rune.burning-dash', 'rune.last-glow', 'rune.call', 'rune.live-ember', 'rune.black-night', 'rune.hunt', 'rune.reprieve',
      'glass.polished', 'glass.cracked', 'glass.smoked', 'glass.tilted',
    ]);
    expect(data.lantern.pieces.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const p of data.lantern.pieces) expect(p.levels.length, p.id).toBe(p.kind === 'rune' ? 3 : 0);
    expect(data.lantern.drops).toEqual({ elite: 0.03, reborn: 0.25 });
    expect(data.lantern.winsForThird).toBe(3);
  });

  it('les valeurs du design', () => {
    const piece = (id: string) => data.lantern.pieces.find((p) => p.id === id)!;
    expect(piece('rune.hunger').levels.map((l) => l.mods.gemsPerHeal)).toEqual([5, 4, 3]);
    expect(piece('rune.hunger').malus).toEqual({ stats: {}, mods: { noFlask: true } });
    expect(piece('rune.reprieve').levels[1]).toEqual({ stats: { revives: 1 }, mods: { firstReviveShare: 0.75 } });
    expect(piece('rune.call').malus.mods.threatMult).toBe(1.4);
    expect(piece('glass.polished').shifts).toEqual({ next: 1, previous: 1, opposite: 0 });
    expect(piece('glass.cracked')).toMatchObject({ clearsOpposite: true, shifts: { next: -1, previous: -1, opposite: 0 } });
    expect(piece('glass.smoked').malus.stats).toEqual({ glowShare: -0.2 });
    expect(piece('glass.tilted').shifts).toEqual({ next: 2, previous: -1, opposite: 0 });
  });

  it('un identifiant en double est refusé', () => {
    expect(broken((l) => {
      l.runes[1]!.id = 'rune.hunger';
    })).toContain('identifiant en double « rune.hunger »');
  });

  it('un modificateur inconnu est refusé', () => {
    expect(broken((l) => {
      l.runes[0]!.malus = { mods: { vitesse: 2 } };
    })).toContain('lantern.json');
  });

  it('une rune à deux niveaux est refusée', () => {
    expect(broken((l) => {
      l.runes[0]!.levels.pop();
    })).toContain('lantern.json');
  });

  it('une rune sans malus est refusée', () => {
    expect(broken((l) => {
      l.runes[0]!.malus = {};
    })).toContain('rune.hunger: aucun malus');
  });

  it('un niveau de rune sans effet est refusé', () => {
    expect(broken((l) => {
      l.runes[0]!.levels[2] = {};
    })).toContain('rune.hunger: niveau 3 sans effet');
  });

  it('un verre sans effet est refusé', () => {
    expect(broken((l) => {
      const polished = l.glasses[0]!;
      delete polished.shifts;
    })).toContain('glass.polished: aucun effet');
  });

  it('un texte manquant est refusé', () => {
    for (const key of ['rune.call.name', 'rune.call.bonus.2', 'rune.call.malus', 'glass.tilted.bonus', 'glass.tilted.malus']) {
      expect(broken((_, raw) => {
        delete raw.fr[key];
      }), key).toContain(key);
    }
  });
});
