import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PieceEffect } from '../../src/content/index.ts';
import { previewLantern, resolveLantern, type FaceView } from '../../src/meta/lantern.ts';
import { newSave, type LanternSave } from '../../src/meta/save.ts';
import { effectChips, lanternChips, pieceChips, type Chip } from '../../src/ui/effects.ts';
import { data } from './helpers.ts';

const atlas = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'atlas', 'atlas.json'), 'utf8')) as { frames: Record<string, unknown> };
const face = (id: string, level = 1, malusCleared = false): FaceView => ({ id, level, malusCleared, sources: [] });

/** Une pastille en une ligne : les images entre crochets, barrées d'un « ! ». */
const read = (c: Chip): string => `${c.kind === 'good' ? '+' : '-'} ${c.parts.map((p) => ('icon' in p ? `[${p.cross ? '!' : ''}${p.icon}]` : p.text)).join(' ')}${c.cleared ? ' (retiré)' : ''}`;
const chips = (id: string, level = 1, cleared = false): string[] => pieceChips(data, face(id, level, cleared)).map(read);

function put(...ids: Array<string | null>): LanternSave {
  const lantern = newSave(0).account.lantern;
  lantern.owned = data.lantern.pieces.map((p) => p.id);
  lantern.opened = 4;
  ids.forEach((id, i) => {
    lantern.faces[i] = id;
  });
  return lantern;
}

describe('pastilles des effets', () => {
  it('chaque rune : son bonus, puis son malus', () => {
    expect(chips('rune.hunger')).toEqual(['+ [pickup-gem-small] 5 ▸ [sign-heart] +1', '- [!pickup-drop]']);
    expect(chips('rune.hunger', 3)[0]).toBe('+ [pickup-gem-small] 3 ▸ [sign-heart] +1');
    expect(chips('rune.burning-dash', 2)).toEqual(['+ [icon-dash] [sign-flame] 30', '- [icon-dash] [sign-hourglass] +50 %']);
    expect(chips('rune.last-glow')).toEqual(['+ [sign-heart] < 30 % ▸ [sign-power] +60 %', '- [sign-heart] [sign-plus] ÷ 2']);
    expect(chips('rune.call', 3)).toEqual(['+ [sign-wisdom] +35 %', '- [sign-horde] +40 %']);
    expect(chips('rune.live-ember')).toEqual(['+ [icon-ultimate-ardent-whirl] +50 %', '- [icon-skill-ember-cry] [sign-hourglass] +50 %']);
    expect(chips('rune.black-night')).toEqual(['+ [sign-crit] +60 %', '- [sign-glow] -50 %']);
    expect(chips('rune.hunt', 3)).toEqual(['+ [sign-elite] ▸ [sign-power] +10 %', '- [sign-elite] [sign-heart] +50 %']);
    expect(chips('rune.reprieve', 2)).toEqual(['+ [icon-find-scarf] +1 · 75 %', '- [sign-heart] -35 %']);
  });

  it('chaque verre : les niveaux qu\'il change, puis son malus', () => {
    expect(chips('glass.polished', 0)).toEqual(['+ [sign-prev] +1', '+ [sign-next] +1', '- [sign-heart] -15 %']);
    expect(chips('glass.cracked', 0)).toEqual(['+ [sign-opposite] [!sign-malus]', '- [sign-prev] -1', '- [sign-next] -1']);
    expect(chips('glass.smoked', 0)).toEqual(['+ [sign-opposite] +2', '- [sign-glow] -20 %']);
    expect(chips('glass.tilted', 0)).toEqual(['+ [sign-next] +2', '- [sign-prev] -1']);
  });

  it('un malus chiffré retiré est marqué ; un changement de niveau ne l\'est jamais', () => {
    expect(chips('rune.reprieve', 1, true)[1]).toBe('- [sign-heart] -35 % (retiré)');
    expect(chips('glass.tilted', 0, true)).toEqual(['+ [sign-next] +2', '- [sign-prev] -1']);
  });

  it('une rune éteinte n\'a pas de pastille', () => {
    expect(chips('rune.hunt', 0)).toEqual([]);
  });

  it('chaque effet du contenu a sa pastille, et chaque image existe', () => {
    for (const p of data.lantern.pieces) {
      for (const level of p.kind === 'rune' ? [1, 2, 3] : [0]) {
        const list = pieceChips(data, face(p.id, level));
        expect(list.length, p.id).toBeGreaterThan(1);
        for (const c of list) for (const part of c.parts) if ('icon' in part) expect(atlas.frames[part.icon], part.icon).toBeDefined();
      }
    }
  });

  it('un effet sans pastille est une erreur', () => {
    expect(() => effectChips(data, { stats: { banishes: 1 }, mods: {} } as PieceEffect, 'good')).toThrow('banishes');
  });
});

describe('pastilles de la Lanterne entière', () => {
  it('dans l\'ordre des faces, sans les changements de niveau ni les malus retirés', () => {
    const view = resolveLantern(data, put('glass.cracked', null, 'rune.reprieve', 'rune.call'));
    // La rune de la face 4 est voisine du verre : elle est éteinte.
    expect(lanternChips(data, view).map(read)).toEqual(['+ [icon-find-scarf] +1 · 50 %']);
    expect(lanternChips(data, previewLantern(data, put('rune.hunger'), 1, 'glass.polished')).map(read)).toEqual([
      '+ [pickup-gem-small] 4 ▸ [sign-heart] +1', '- [!pickup-drop]', '- [sign-heart] -15 %',
    ]);
  });
});
