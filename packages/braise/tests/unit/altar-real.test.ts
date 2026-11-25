import { describe, expect, it } from 'vitest';
import { buyAltarRank } from '../../src/meta/altar.ts';
import { buildSheet, statsAtAltarRank } from '../../src/meta/hero.ts';
import { resolveStats } from '../../src/core/stats.ts';
import { CLASS, data, makeSave } from './helpers.ts';

const BOOSTS = data.altar.filter((b) => Object.keys(b.perRank).length > 0);

describe('Évolution réelle affichée à l\'Autel', () => {
  it('la valeur annoncée pour le rang suivant est celle obtenue après l\'achat', () => {
    for (const boost of BOOSTS) {
      const save = makeSave(12);
      save.account.ashes = 1e6;
      save.account.altar = { 'altar.ardor': 2, 'altar.endurance': 3, 'altar.glow': 1, 'altar.wisdom': 1 };
      const rank = save.account.altar[boost.id]!;
      const announced = statsAtAltarRank(data, save, CLASS, boost.id, rank + 1);
      expect(buyAltarRank(save, data, boost.id).ok).toBe(true);
      expect(announced, boost.id).toEqual(resolveStats(buildSheet(data, save, CLASS).sheet, data.tuning, data.heroTuning));
    }
  });

  it('part des vrais points de vie du héros : 98 → 103 au premier rang d\'Endurance', () => {
    const save = makeSave(1);
    expect(statsAtAltarRank(data, save, CLASS, 'altar.endurance', 0).maxHp).toBe(98);
    expect(statsAtAltarRank(data, save, CLASS, 'altar.endurance', 1).maxHp).toBe(103);
  });

  it('compte un boost désactivé comme actif, et ne change pas la sauvegarde', () => {
    const save = makeSave(1);
    save.account.altar = { 'altar.glow': 2 };
    save.account.altarDisabled = ['altar.glow'];
    const before = structuredClone(save);
    expect(statsAtAltarRank(data, save, CLASS, 'altar.glow', 2).glow).toBeCloseTo(40 * 1.16, 5);
    expect(save).toEqual(before);
  });
});
