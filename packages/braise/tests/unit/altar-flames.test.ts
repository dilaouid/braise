import { describe, expect, it } from 'vitest';
import { FR, RAW, compileContent } from '../../src/content/index.ts';
import { altarCost, buyAltarRank, canBuyAltarRank, flameRarity, refundAltar, setAltarBoostEnabled } from '../../src/meta/altar.ts';
import { buildSheet } from '../../src/meta/hero.ts';
import { CLASS, data, makeSave } from './helpers.ts';

const EPIC = 'altar.flames-epic';
const LEGENDARY = 'altar.flames-legendary';
const MYTHIC = 'altar.flames-mythic';

function rich(): ReturnType<typeof makeSave> {
  const save = makeSave();
  save.account.ashes = 10_000;
  return save;
}

describe('l\'Autel ouvre les raretés des Flammes', () => {
  it('le contenu : trois déblocages à un rang, 60, 180 et 450 Cendres', () => {
    const boost = (id: string) => data.altar.find((b) => b.id === id)!;
    expect(boost(EPIC)).toMatchObject({ row: 2, ranks: 1, unlock: 'epic' });
    expect(boost(LEGENDARY)).toMatchObject({ row: 2, ranks: 1, unlock: 'legendary', requires: EPIC });
    expect(boost(MYTHIC)).toMatchObject({ row: 2, ranks: 1, unlock: 'mythic', requires: LEGENDARY });
    expect([EPIC, LEGENDARY, MYTHIC].map((id) => altarCost(boost(id), 1))).toEqual([60, 180, 450]);
    for (const id of [EPIC, LEGENDARY, MYTHIC]) {
      expect(FR[`${id}.name`]).toBeTruthy();
      expect(FR[`${id}.desc`]).toBeTruthy();
    }
  });

  it('une sauvegarde neuve n\'a que Commune et Rare', () => {
    expect(flameRarity(makeSave(), data)).toBe(1);
  });

  it('chaque déblocage ouvre la rareté suivante, dans l\'ordre', () => {
    const save = rich();
    expect(canBuyAltarRank(save, data, LEGENDARY)).toBe('requires');
    expect(buyAltarRank(save, data, MYTHIC)).toMatchObject({ ok: false, error: 'requires' });
    expect(buyAltarRank(save, data, EPIC)).toMatchObject({ ok: true, cost: 60 });
    expect(flameRarity(save, data)).toBe(2);
    expect(canBuyAltarRank(save, data, EPIC)).toBe('max');
    expect(buyAltarRank(save, data, LEGENDARY)).toMatchObject({ ok: true, cost: 180 });
    expect(flameRarity(save, data)).toBe(3);
    expect(buyAltarRank(save, data, MYTHIC)).toMatchObject({ ok: true, cost: 450 });
    expect(flameRarity(save, data)).toBe(4);
    expect(save.account.ashes).toBe(10_000 - 690);
  });

  it('un déblocage désactivé referme sa rareté et celles du dessus', () => {
    const save = rich();
    for (const id of [EPIC, LEGENDARY, MYTHIC]) buyAltarRank(save, data, id);
    setAltarBoostEnabled(save, LEGENDARY, false);
    expect(flameRarity(save, data)).toBe(2);
    setAltarBoostEnabled(save, EPIC, false);
    expect(flameRarity(save, data)).toBe(1);
    setAltarBoostEnabled(save, EPIC, true);
    setAltarBoostEnabled(save, LEGENDARY, true);
    expect(flameRarity(save, data)).toBe(4);
  });

  it('rendre les Cendres referme tout et rend 690', () => {
    const save = rich();
    for (const id of [EPIC, LEGENDARY, MYTHIC]) buyAltarRank(save, data, id);
    expect(refundAltar(save, data)).toBe(690);
    expect(flameRarity(save, data)).toBe(1);
    expect(save.account.ashes).toBe(10_000);
  });

  it('un déblocage ne change aucune statistique et n\'est pas une source de la fiche', () => {
    const save = rich();
    const before = buildSheet(data, save, CLASS);
    for (const id of [EPIC, LEGENDARY, MYTHIC]) buyAltarRank(save, data, id);
    const after = buildSheet(data, save, CLASS);
    expect(after.sheet).toEqual(before.sheet);
    expect(after.sources.map((s) => s.label)).toEqual(before.sources.map((s) => s.label));
  });

  it('un déblocage qui demande un boost inconnu est refusé par le contenu', () => {
    const raw = structuredClone(RAW);
    (raw.altar as Array<{ id: string; requires?: string }>).find((b) => b.id === LEGENDARY)!.requires = 'altar.nope';
    expect(compileContent(raw).errors.join('\n')).toContain('altar.nope');
  });
});
