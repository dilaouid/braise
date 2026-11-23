import { describe, expect, it } from 'vitest';
import { computeResult } from '../../src/core/rewards.ts';
import { altarCost, altarSpent, buyAltarRank, canBuyAltarRank, refundAltar } from '../../src/meta/altar.ts';
import {
  addHeroXp, applyRunResult, autoAssignFreePoints, freePointsLeft, heroAttributes, heroXpForNext,
} from '../../src/meta/hero.ts';
import { newHero, newSave, validateSave } from '../../src/meta/save.ts';
import { CLASS, data, makeRun, makeSave } from './helpers.ts';

const cls = data.classes[CLASS]!;
const ht = data.heroTuning;

describe('Autel du Foyer (document 05 §4)', () => {
  it('le coût prélevé est le coût affiché, et il croît à chaque rang', () => {
    const save = makeSave();
    save.account.ashes = 1000;
    const boost = data.altar.find((b) => b.id === 'altar.ardor')!;
    expect(altarCost(boost, 1)).toBe(5);
    expect(altarCost(boost, 2)).toBe(7);
    expect(altarCost(boost, 10)).toBe(142);
    for (let rank = 1; rank <= 3; rank++) {
      const shown = altarCost(boost, rank);
      const before = save.account.ashes;
      const res = buyAltarRank(save, data, boost.id);
      expect(res.ok).toBe(true);
      expect(res.cost).toBe(shown);
      expect(before - save.account.ashes).toBe(shown);
    }
    expect(save.account.altar[boost.id]).toBe(3);
  });

  it('refuse un achat sans assez de Cendres ou au rang maximum', () => {
    const save = makeSave();
    save.account.ashes = 4;
    expect(buyAltarRank(save, data, 'altar.ardor').error).toBe('ashes');
    expect(save.account.ashes).toBe(4);
    save.account.ashes = 1e6;
    for (let i = 0; i < 5; i++) expect(buyAltarRank(save, data, 'altar.glow').ok).toBe(true);
    expect(canBuyAltarRank(save, data, 'altar.glow')).toBe('max');
    expect(buyAltarRank(save, data, 'altar.nope').error).toBe('unknown');
  });

  it('rendre les Cendres remet tous les rangs à zéro et rend exactement la somme dépensée', () => {
    const save = makeSave();
    save.account.ashes = 5000;
    for (let i = 0; i < 7; i++) buyAltarRank(save, data, 'altar.ardor');
    for (let i = 0; i < 4; i++) buyAltarRank(save, data, 'altar.wisdom');
    const spent = altarSpent(save, data);
    expect(save.account.ashes).toBe(5000 - spent);
    expect(refundAltar(save, data)).toBe(spent);
    expect(save.account.ashes).toBe(5000);
    expect(save.account.altar).toEqual({});
  });

  it('après une première partie perdue à 4:00, le joueur peut acheter au moins un rang', () => {
    const save = makeSave();
    const run = makeRun(1, save);
    run.time = 240;
    run.outcome = 'death';
    applyRunResult(save, data, computeResult(run));
    expect(data.altar.some((b) => canBuyAltarRank(save, data, b.id) === null)).toBe(true);
  });
});

describe('héros persistant (document 03)', () => {
  it('courbe d\'expérience de héros', () => {
    expect(heroXpForNext(1, ht)).toBe(156);
    expect(heroXpForNext(10, ht)).toBe(1200);
    expect(heroXpForNext(30, ht)).toBe(7000);
  });

  it('un héros de niveau N a 3 × (N − 1) points au-dessus de son départ, dont N − 1 libres', () => {
    for (const level of [1, 2, 7, 30, 60]) {
      const hero = newHero();
      hero.level = level;
      autoAssignFreePoints(hero, cls, ht);
      expect(freePointsLeft(hero, ht)).toBe(0);
      const a = heroAttributes(cls, hero);
      const total = a.str + a.agi + a.spi + a.vig + a.luck;
      expect(total).toBe(25 + 3 * (level - 1));
      const f = hero.freeAttributes;
      expect(f.str + f.agi + f.spi + f.vig + f.luck).toBe(level - 1);
    }
  });

  it('le niveau maximum est 60', () => {
    const hero = newHero();
    addHeroXp(hero, 1e9, ht);
    expect(hero.level).toBe(60);
  });

  it('après une expédition perdue à 4:00 avec un héros de niveau 1, le héros gagne au moins un niveau', () => {
    const save = makeSave();
    const run = makeRun(1, save);
    run.time = 240;
    run.hero.level = 8;
    run.outcome = 'death';
    const summary = applyRunResult(save, data, computeResult(run));
    expect(summary.levelsGained).toBeGreaterThanOrEqual(1);
    expect(save.heroes[CLASS]!.level).toBeGreaterThanOrEqual(2);
  });

  it('une victoire rallume le Brasier de la région et compte pour le codex', () => {
    const save = makeSave();
    const run = makeRun(1, save);
    run.time = 900;
    run.hero.bossKills = 1;
    run.killsByKind[0] = 12;
    run.outcome = 'victory';
    const summary = applyRunResult(save, data, computeResult(run));
    expect(summary.firstBossKill).toBe(true);
    expect(save.account.regions['region.ash-woods']).toEqual({ lit: true, bestVigil: 1, bossKills: 1 });
    expect(save.account.codex.kills['enemy.crawler']).toBe(12);
    expect(save.account.stats.victories).toBe(1);
  });
});

describe('sauvegarde', () => {
  it('une sauvegarde neuve se relit telle quelle', () => {
    const save = newSave(123);
    save.account.ashes = 42;
    save.heroes[CLASS] = newHero();
    expect(validateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('les champs manquants sont complétés, les valeurs fausses corrigées', () => {
    const loaded = validateSave({ version: 1, account: { ashes: -5, gold: 12.7 }, heroes: { [CLASS]: { level: 3 } } });
    expect(loaded.account.ashes).toBe(0);
    expect(loaded.account.gold).toBe(12);
    expect(loaded.heroes[CLASS]!.level).toBe(3);
    expect(loaded.settings.volumeMaster).toBeGreaterThan(0);
  });

  it('ce qui n\'est pas une sauvegarde est refusé', () => {
    expect(() => validateSave(null)).toThrow();
    expect(() => validateSave({ version: 1 })).toThrow();
    expect(() => validateSave({ version: 2, account: {} })).toThrow();
  });
});
