import { describe, expect, it } from 'vitest';
import { FR, RAW, compileContent } from '../../src/content/index.ts';
import { altarCost, buyAltarRank, refundAltar, setAltarBoostEnabled } from '../../src/meta/altar.ts';
import { cardCandidates } from '../../src/core/levelup.ts';
import { unlockedContent } from '../../src/meta/hero.ts';
import type { Save } from '../../src/meta/save.ts';
import { data, makeRun, makeSave } from './helpers.ts';

const weapon = (id: string) => data.weapons.find((w) => w.id === id)!;
const relic = (id: string) => data.relics.find((r) => r.id === id)!;

/** Arme, évolution, relique, boost d'Autel, coût. */
const ARMS = [
  ['weapon.wake', 'weapon.web', 'relic.copper-sole', 'altar.weapon-wake', 30],
  ['weapon.verge', 'weapon.solstice', 'relic.winter-scarf', 'altar.weapon-verge', 50],
  ['weapon.storm-watch', 'weapon.black-storm', 'relic.copper-coil', 'altar.weapon-storm-watch', 80],
  ['weapon.nightlights', 'weapon.garland', 'relic.hollow-lantern', 'altar.weapon-nightlights', 120],
] as const;

function rich(): Save {
  const save = makeSave();
  save.account.ashes = 1000;
  return save;
}

describe('les armes de Clair-obscur : le contenu', () => {
  it('chaque arme cite son évolution et sa relique, et aucune n\'est là au départ', () => {
    for (const [id, evo, rel] of ARMS) {
      const w = weapon(id);
      expect(w, id).toBeDefined();
      expect(w.starting).toBe(false);
      expect(data.weapons[w.evolution]!.id).toBe(evo);
      expect(data.relics[w.relic]!.id).toBe(rel);
      expect(relic(rel).starting).toBe(false);
      expect(relic(rel).maxLevel).toBe(5);
    }
  });

  it('Lisière : Givre, les valeurs du design', () => {
    const w = weapon('weapon.verge');
    expect(w).toMatchObject({ damageType: 3, scale: 'spi', aim: 'around', behavior: 'verge' });
    expect(w.levels[0]).toMatchObject({ damage: 5, band: 10, hitInterval: 2.2, bite: 0.8, rings: 1, freeze: true });
    expect(w.levels[5]).toMatchObject({ damage: 12, band: 22, hitInterval: 1.7 });
    expect(weapon('weapon.solstice').levels[0]).toMatchObject({ damage: 14, band: 22, hitInterval: 1.5, rings: 2, bite: 0.8, freeze: true });
  });

  it('Guet d\'orage : Foudre, les valeurs du design', () => {
    const w = weapon('weapon.storm-watch');
    expect(w).toMatchObject({ damageType: 2, scale: 'spi', aim: 'nearest', behavior: 'chain' });
    expect(w.levels[0]).toMatchObject({ damage: 11, cooldown: 1.8, range: 180, count: 1, jumps: 3, jumpRange: 80, shock: false, jumpsIntoLight: false });
    expect(w.levels.map((l) => l.jumps)).toEqual([3, 4, 4, 6, 6, 6]);
    expect(w.levels.map((l) => l.shock)).toEqual([false, false, false, false, true, true]);
    expect(w.levels[5]).toMatchObject({ damage: 15, count: 2 });
    expect(weapon('weapon.black-storm').levels[0]).toMatchObject({ damage: 17, cooldown: 1.6, range: 180, count: 3, jumps: 6, shock: true, jumpsIntoLight: true });
  });

  it('Veilleuses : Feu, les valeurs du design', () => {
    const w = weapon('weapon.nightlights');
    expect(w).toMatchObject({ damageType: 1, scale: 'spi', aim: 'placed', behavior: 'lamp' });
    expect(w.levels[0]).toMatchObject({ damage: 3, cooldown: 5, count: 1, radiusShare: 0.5, life: 6, hitInterval: 0.5, max: 8, scatter: 60 });
    expect(w.levels[5]).toMatchObject({ damage: 5, count: 3, radiusShare: 0.6, life: 8 });
    expect(weapon('weapon.garland').levels[0]).toMatchObject({
      damage: 6, cooldown: 4.5, count: 3, radiusShare: 0.6, life: 9, linkRange: 140, linkDamage: 8, linkWidth: 10, burn: true,
    });
  });

  it('Sillage : Foudre, les valeurs du design', () => {
    const w = weapon('weapon.wake');
    expect(w).toMatchObject({ damageType: 2, scale: 'agi', aim: 'placed', behavior: 'wake' });
    expect(w.levels[0]).toMatchObject({ damage: 13, hitInterval: 0.6, width: 14, life: 2.5, max: 3, minLength: 20, shock: false });
    expect(w.levels[3]!.shock).toBe(true);
    expect(w.levels[5]).toMatchObject({ damage: 26, width: 22, life: 4 });
    expect(weapon('weapon.web').levels[0]).toMatchObject({ damage: 30, hitInterval: 0.5, width: 22, life: 5, max: 3, shock: true, crossRadius: 48, crossDamage: 60 });
  });

  it('les reliques', () => {
    expect(relic('relic.winter-scarf').perLevel).toEqual({ armor: 3 });
    expect(relic('relic.copper-coil').perLevel).toEqual({ critChance: 0.04 });
    expect(relic('relic.hollow-lantern').perLevel).toEqual({ glowShare: 0.1 });
    expect(relic('relic.copper-sole').perLevel).toEqual({ speedShare: 0.03 });
  });
});

describe('l\'Autel ouvre les armes', () => {
  it('quatre achats à un rang, aux coûts du design, avec leurs textes', () => {
    for (const [id, , , altar, cost] of ARMS) {
      const boost = data.altar.find((b) => b.id === altar)!;
      expect(boost.weapon).toBe(id);
      expect(boost.ranks).toBe(1);
      expect(altarCost(boost, 1)).toBe(cost);
      expect(boost.requires).toBeUndefined();
      expect(FR[`${altar}.name`]).toBeTruthy();
      expect(FR[`${altar}.desc`]).toBeTruthy();
    }
  });

  it('sans achat, le tirage est celui d\'avant', () => {
    const open = unlockedContent(data, makeSave());
    expect(open.weapons).toHaveLength(6);
    expect(open.relics).toHaveLength(6);
  });

  it('un achat ouvre l\'arme et sa relique, et elles seules', () => {
    for (const [id, , rel, altar] of ARMS) {
      const save = rich();
      expect(buyAltarRank(save, data, altar).ok).toBe(true);
      const open = unlockedContent(data, save);
      expect(open.weapons).toContain(id);
      expect(open.relics).toContain(rel);
      expect(open.weapons).toHaveLength(7);
      expect(open.relics).toHaveLength(7);
    }
  });

  it('désactivée, l\'arme et sa relique sortent du tirage ; réactivée, elles reviennent', () => {
    const save = rich();
    buyAltarRank(save, data, 'altar.weapon-wake');
    setAltarBoostEnabled(save, 'altar.weapon-wake', false);
    expect(unlockedContent(data, save).weapons).not.toContain('weapon.wake');
    expect(unlockedContent(data, save).relics).not.toContain('relic.copper-sole');
    setAltarBoostEnabled(save, 'altar.weapon-wake', true);
    expect(unlockedContent(data, save).weapons).toContain('weapon.wake');
  });

  it('désactivée, rendue puis rachetée, une arme est bien dans le tirage', () => {
    const save = rich();
    buyAltarRank(save, data, 'altar.weapon-wake');
    setAltarBoostEnabled(save, 'altar.weapon-wake', false);
    refundAltar(save, data);
    buyAltarRank(save, data, 'altar.weapon-wake');
    expect(unlockedContent(data, save).weapons).toContain('weapon.wake');
  });

  it('rendre les Cendres referme les armes, et une partie lancée ne change pas', () => {
    const save = rich();
    for (const [, , , altar] of ARMS) buyAltarRank(save, data, altar);
    const run = makeRun(3, save);
    expect(run.weaponPool).toHaveLength(10);
    expect(refundAltar(save, data)).toBe(280);
    expect(unlockedContent(data, save).weapons).toHaveLength(6);
    expect(run.weaponPool).toHaveLength(10);
  });

  it('le contenu refuse une Lisière sans bande, une Veilleuse sans rayon, un fil sans nombre', () => {
    for (const [id, key] of [['weapon.verge', 'band'], ['weapon.nightlights', 'radiusShare'], ['weapon.nightlights', 'max'], ['weapon.wake', 'life'], ['weapon.storm-watch', 'range']] as const) {
      const raw = structuredClone(RAW);
      delete (raw.weapons as Array<{ id: string; levels: Array<Record<string, unknown>> }>).find((w) => w.id === id)!.levels[2]![key];
      expect(compileContent(raw).errors.join('\n'), `${id} ${key}`).toContain(key);
    }
    const raw = structuredClone(RAW);
    delete (raw.evolutions as Array<{ id: string; params: Record<string, unknown> }>).find((w) => w.id === 'weapon.web')!.params.max;
    expect(compileContent(raw).errors.join('\n')).toContain('max');
  });

  it('le contenu refuse un boost qui ouvre une arme inconnue, déjà là au départ ou évoluée', () => {
    for (const bad of ['weapon.nope', 'weapon.scythe', 'weapon.web']) {
      const raw = structuredClone(RAW);
      (raw.altar as Array<{ id: string; weapon?: string }>).find((b) => b.id === 'altar.weapon-wake')!.weapon = bad;
      expect(compileContent(raw).errors.join('\n'), bad).toContain(bad);
    }
  });
});

describe('un tirage plus large ne noie pas les évolutions', () => {
  /** Le poids total des cartes d'armes nouvelles, puis celui des reliques nouvelles sans lien. */
  function newWeight(save: Save): { weapons: number; relics: number; linked: number } {
    const run = makeRun(3, save);
    let weapons = 0;
    let relics = 0;
    let linked = 0;
    for (const { card, weight } of cardCandidates(run)) {
      if (card.level !== 1) continue;
      if (card.kind === 'weapon') weapons += weight;
      else if (card.evolves) linked += weight;
      else relics += weight;
    }
    return { weapons, relics, linked };
  }

  it('sans achat, les poids sont ceux d\'avant', () => {
    const w = newWeight(makeSave());
    expect(w.weapons).toBe(5);
    expect(w.relics).toBe(5);
  });

  it('quatre armes achetées : le poids total du nouveau ne change pas, la relique liée garde le sien', () => {
    const save = rich();
    for (const [, , , altar] of ARMS) buyAltarRank(save, data, altar);
    const before = newWeight(makeSave());
    const after = newWeight(save);
    expect(after.weapons).toBeCloseTo(9 * 6 / 10);
    expect(after.relics).toBeCloseTo(9 * 6 / 10);
    expect(after.linked).toBe(before.linked);
  });
});
