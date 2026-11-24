import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_MODS, mergeMods } from '../../src/core/mods.ts';
import { buildSheet } from '../../src/meta/hero.ts';
import {
  clearFace, clearLantern, lanternNews, markLanternSeen, missingPieces, pieceById, placePiece, resolveLantern, type LanternView,
} from '../../src/meta/lantern.ts';
import { MIGRATIONS, newSave, validateSave, type LanternSave } from '../../src/meta/save.ts';
import { CLASS, data, makeSave } from './helpers.ts';

const ALL = data.lantern.pieces.map((p) => p.id);
const RUNES = data.lantern.pieces.filter((p) => p.kind === 'rune').map((p) => p.id);
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/saves');

/** Une Lanterne dont tout est ouvert et possédé, avec ces pièces sur les faces 1 à 4. */
function put(...ids: Array<string | null>): LanternSave {
  const lantern = newSave(0).account.lantern;
  lantern.owned = ALL.slice();
  lantern.opened = 4;
  ids.forEach((id, i) => {
    lantern.faces[i] = id;
  });
  return lantern;
}

const view = (...ids: Array<string | null>): LanternView => resolveLantern(data, put(...ids));
const levels = (v: LanternView): Array<number | null> => v.faces.map((f) => (f ? f.level : null));

describe('modificateurs de partie', () => {
  it('neutres : aucun effet', () => {
    expect(NEUTRAL_MODS).toEqual({
      gemsPerHeal: 0, noFlask: false, dashBurn: 0, dashBurnRadius: 0, dashCooldownMult: 1, lowHpPower: 0, lowHpShare: 0,
      healMult: 1, threatMult: 1, ultChargeMult: 1, skillCooldownMult: 1, eliteKillPower: 0, eliteHpMult: 1, firstReviveShare: 0,
    });
  });

  it('les multiplicateurs se multiplient, le reste remplace, l\'entrée n\'est pas modifiée', () => {
    const a = mergeMods({ ...NEUTRAL_MODS }, { threatMult: 1.4, noFlask: true });
    const b = mergeMods(a, { threatMult: 2, gemsPerHeal: 4 });
    expect(b.threatMult).toBeCloseTo(2.8);
    expect(b).toMatchObject({ noFlask: true, gemsPerHeal: 4 });
    expect(a.threatMult).toBe(1.4);
    expect(NEUTRAL_MODS.threatMult).toBe(1);
  });
});

describe('niveaux et voisines', () => {
  it('une rune seule est au niveau I, avec son malus', () => {
    const v = view('rune.hunger');
    expect(levels(v)).toEqual([1, null, null, null]);
    expect(v.mods).toMatchObject({ gemsPerHeal: 5, noFlask: true });
    expect(v.placed).toBe(1);
  });

  it('le Verre poli monte ses deux voisines', () => {
    const v = view('rune.hunger', 'glass.polished', 'rune.hunt');
    expect(levels(v)).toEqual([2, 0, 2, null]);
    expect(v.mods).toMatchObject({ gemsPerHeal: 4, eliteKillPower: 0.07 });
    expect(v.stats).toEqual({ maxHpShare: -0.15 });
    expect(v.faces[0]!.sources).toEqual([{ id: 'glass.polished', delta: 1 }]);
  });

  it('la première et la quatrième face sont voisines', () => {
    expect(levels(view('rune.hunger', null, null, 'glass.polished'))).toEqual([2, null, null, 0]);
  });

  it('le Verre fumé monte la face opposée de deux niveaux', () => {
    const v = view('glass.smoked', null, 'rune.call');
    expect(v.faces[2]!.level).toBe(3);
    expect(v.stats).toEqual({ glowShare: -0.2, wisdom: 0.35 });
  });

  it('le Verre penché monte la suivante et éteint la précédente : ni bonus ni malus', () => {
    const v = view('glass.tilted', 'rune.hunger', null, 'rune.hunt');
    expect(levels(v)).toEqual([0, 3, null, 0]);
    expect(v.mods).toMatchObject({ gemsPerHeal: 3, eliteKillPower: 0, eliteHpMult: 1 });
    expect(v.placed).toBe(3);
  });

  it('le niveau s\'arrête à III', () => {
    const v = view('glass.smoked', 'glass.polished', 'rune.call');
    expect(v.faces[2]!.level).toBe(3);
    expect(v.stats.wisdom).toBe(0.35);
  });

  it('une baisse compense une hausse avant le plafond', () => {
    // Opposé +2, voisine -1 : 1 + 2 - 1 = 2.
    expect(view('glass.smoked', 'glass.cracked', 'rune.call').faces[2]!.level).toBe(2);
  });

  it('un verre ne change pas un autre verre', () => {
    expect(levels(view('glass.polished', 'glass.smoked'))).toEqual([0, 0, null, null]);
  });

  it('le Verre fendu retire le malus opposé', () => {
    const v = view('glass.cracked', null, 'rune.reprieve');
    expect(v.faces[2]).toMatchObject({ level: 1, malusCleared: true });
    expect(v.stats).toEqual({ revives: 1 });
    expect(v.mods.firstReviveShare).toBe(0.5);
  });

  it('le Verre fendu retire aussi le malus d\'un verre', () => {
    const v = view('glass.cracked', null, 'glass.smoked');
    expect(v.stats).toEqual({});
    expect(v.faces[2]!.malusCleared).toBe(true);
  });

  it('une face fermée ne compte pas', () => {
    const lantern = put('rune.hunger', 'glass.polished');
    lantern.opened = 1;
    const v = resolveLantern(data, lantern);
    expect(levels(v)).toEqual([1, null, null, null]);
    expect(v).toMatchObject({ placed: 1, stats: {} });
  });

  it('deux malus de la même statistique s\'additionnent', () => {
    expect(view('rune.black-night', null, 'glass.smoked').stats).toEqual({ critMult: 1, glowShare: -0.7 });
  });

  it('Dernière lueur et Ruée ardente se cumulent', () => {
    expect(view('rune.last-glow', 'rune.burning-dash').mods).toMatchObject({ lowHpPower: 0.6, healMult: 0.5, dashBurn: 20, dashCooldownMult: 1.5 });
  });

  it('vide : rien, et les modificateurs neutres', () => {
    expect(view()).toEqual({ faces: [null, null, null, null], stats: {}, mods: NEUTRAL_MODS, placed: 0, sources: [] });
  });
});

describe('la Lanterne dans la feuille de statistiques', () => {
  it('s\'ajoute à l\'Autel, avec sa source', () => {
    const save = makeSave();
    save.account.altar['altar.wisdom'] = 1;
    save.account.lantern = put('glass.smoked', null, 'rune.call');
    const { sheet, sources } = buildSheet(data, save, CLASS);
    expect(sheet.wisdom).toBeCloseTo(0.04 + 0.35);
    expect(sheet.glowShare).toBeCloseTo(-0.2);
    expect(sources.map((s) => s.label)).toEqual(['altar.wisdom', 'glass.smoked', 'rune.call']);
  });

  it('vide, elle ne change rien', () => {
    const save = makeSave();
    const before = buildSheet(data, save, CLASS);
    expect(before.sources).toEqual([]);
  });
});

describe('poser et retirer', () => {
  it('poser une pièce déjà posée échange les deux faces', () => {
    const lantern = put('rune.hunger', 'rune.call');
    expect(placePiece(data, lantern, 1, 'rune.hunger')).toBe(true);
    expect(lantern.faces).toEqual(['rune.call', 'rune.hunger', null, null]);
  });

  it('déplacer vers une face vide vide l\'ancienne ; reposer au même endroit ne change rien', () => {
    const lantern = put('rune.hunger');
    placePiece(data, lantern, 2, 'rune.hunger');
    expect(lantern.faces).toEqual([null, null, 'rune.hunger', null]);
    placePiece(data, lantern, 2, 'rune.hunger');
    expect(lantern.faces).toEqual([null, null, 'rune.hunger', null]);
  });

  it('poser refuse une face fermée, une pièce non possédée, un identifiant inconnu', () => {
    const lantern = put();
    lantern.opened = 2;
    lantern.owned = ['rune.hunger', 'rune.ghost'];
    expect(placePiece(data, lantern, 2, 'rune.hunger')).toBe(false);
    expect(placePiece(data, lantern, -1, 'rune.hunger')).toBe(false);
    expect(placePiece(data, lantern, 0, 'rune.call')).toBe(false);
    expect(placePiece(data, lantern, 0, 'rune.ghost')).toBe(false);
    expect(lantern.faces).toEqual([null, null, null, null]);
  });

  it('vider une face, ou toutes', () => {
    const lantern = put('rune.hunger', 'rune.call');
    clearFace(lantern, 0);
    expect(lantern.faces).toEqual([null, 'rune.call', null, null]);
    clearLantern(lantern);
    expect(lantern.faces).toEqual([null, null, null, null]);
  });

  it('pieceById', () => {
    expect(pieceById(data, 'glass.tilted')!.kind).toBe('glass');
    expect(pieceById(data, 'rune.ghost')).toBeNull();
  });
});

describe('ce qui reste à trouver, ce qui est nouveau', () => {
  it('des runes seulement tant que rien n\'est possédé, puis tout, puis plus rien', () => {
    const lantern = newSave(0).account.lantern;
    expect(missingPieces(data, lantern)).toEqual(RUNES);
    lantern.owned = ['rune.call'];
    expect(missingPieces(data, lantern)).toEqual(ALL.filter((id) => id !== 'rune.call'));
    lantern.owned = ALL.slice();
    expect(missingPieces(data, lantern)).toEqual([]);
  });

  it('un identifiant inconnu ne compte pas comme une pièce possédée', () => {
    const lantern = newSave(0).account.lantern;
    lantern.owned = ['rune.ghost'];
    expect(missingPieces(data, lantern)).toEqual(RUNES);
    expect(lanternNews(data, lantern)).toBe(false);
  });

  it('une pièce ou une face nouvelle se signale une fois', () => {
    const lantern = newSave(0).account.lantern;
    expect(lanternNews(data, lantern)).toBe(false);
    lantern.owned.push('rune.call');
    expect(lanternNews(data, lantern)).toBe(true);
    markLanternSeen(lantern);
    expect(lanternNews(data, lantern)).toBe(false);
    lantern.opened = 2;
    expect(lanternNews(data, lantern)).toBe(true);
    markLanternSeen(lantern);
    expect(lanternNews(data, lantern)).toBe(false);
  });
});

describe('sauvegarde', () => {
  const load = (lantern: unknown): LanternSave => {
    const raw = JSON.parse(JSON.stringify(newSave(0)));
    raw.account.lantern = lantern;
    return validateSave(raw).account.lantern;
  };
  const FRESH = { owned: [], seen: [], faces: [null, null, null, null], opened: 1, wins: 0 };

  it('neuve', () => {
    expect(newSave(0).account.lantern).toEqual(FRESH);
  });

  it('complète, elle se relit telle quelle', () => {
    const lantern = { owned: ['rune.call', 'glass.smoked'], seen: ['rune.call', 'face.2'], faces: ['glass.smoked', 'rune.call', null, null], opened: 2, wins: 4 };
    expect(load(lantern)).toEqual(lantern);
  });

  it('abîmée, elle est nettoyée', () => {
    const l = load({ owned: ['rune.call', 'rune.x', 7, 'rune.call'], seen: 'x', faces: ['rune.x', 'rune.call', 'rune.call', 'rune.hunt', 'rune.x'], opened: 2, wins: 'a' });
    expect(l).toEqual({ owned: ['rune.call', 'rune.x'], seen: [], faces: ['rune.x', 'rune.call', null, null], opened: 2, wins: 0 });
    expect(levels(resolveLantern(data, l))).toEqual([null, 1, null, null]);
    expect(resolveLantern(data, l).placed).toBe(1);
  });

  it('une pièce en double, non possédée, ou sur une face fermée quitte sa face', () => {
    expect(load({ ...FRESH, owned: ['rune.call'], opened: 4, faces: ['rune.call', 'rune.call', 'rune.hunt', 12] }).faces).toEqual(['rune.call', null, null, null]);
    expect(load({ ...FRESH, owned: ['rune.call'], opened: 1, faces: [null, 'rune.call'] }).faces).toEqual([null, null, null, null]);
  });

  it('un nombre de faces ou de victoires impossible est ramené dans ses bornes', () => {
    expect(load({ ...FRESH, opened: 9, wins: -3 })).toMatchObject({ opened: 4, wins: 0 });
    expect(load({ ...FRESH, opened: 0, wins: 2.7 })).toMatchObject({ opened: 1, wins: 2 });
  });

  it('absente ou illisible, elle est neuve', () => {
    for (const bad of [undefined, null, 'x', [], 3]) expect(load(bad)).toEqual(FRESH);
  });

  it('les sauvegardes d\'exemple ont une Lanterne neuve', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      let raw = JSON.parse(readFileSync(resolve(DIR, f), 'utf8'));
      while (raw.version < 2) raw = MIGRATIONS[raw.version]!(raw);
      expect(validateSave(raw).account.lantern, f).toEqual(FRESH);
    }
  });
});
