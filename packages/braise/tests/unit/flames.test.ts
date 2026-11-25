import { describe, expect, it } from 'vitest';
import {
  drawFlames, feedBlock, feedOffer, glowLoss, glowShareNow, offerCost, openRarity, takeFlame, unfeedOffer,
} from '../../src/core/flames.ts';
import { closeChest, recomputeStats, takeCard } from '../../src/core/levelup.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import type { FlameOffer, Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun } from './helpers.ts';

const BASE_GLOW = data.tuning.hero.glow;

function line(id: string): number {
  const index = data.flames.lines.findIndex((l) => l.id === id);
  if (index < 0) throw new Error(`Lignée inconnue : ${id}`);
  return index;
}

/** Une partie de test, avec la rareté la plus haute ouverte voulue. */
function fresh(rarity = 4, seed = 1234): Run {
  const run = makeRun(seed);
  run.cfg.flameRarity = rarity;
  return run;
}

/** Ouvre l'écran du totem sur ces offres. */
function offer(run: Run, ...offers: Array<Partial<FlameOffer> & { line: number }>): void {
  run.phase = 'totem';
  run.totemOffers = offers.map((o) => {
    const first = data.flames.lines[o.line]!.first;
    return { base: first, rarity: first, gift: false, ...o };
  });
}

function own(run: Run, id: string, rarity: number): void {
  run.flames.push({ line: line(id), rarity });
}

describe('tirage des Flammes', () => {
  it('trois lignées différentes, les deux premières gratuites', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = fresh(4, seed);
      const offers = drawFlames(run);
      expect(offers.length).toBe(3);
      expect(new Set(offers.map((o) => o.line)).size).toBe(3);
      run.totemOffers = offers;
      expect(offerCost(run, offers[0]!)).toBe(0);
      expect(offerCost(run, offers[1]!)).toBe(0);
    }
  });

  it('une lignée possédée ne revient pas', () => {
    const run = fresh();
    own(run, 'flame.edge', 0);
    own(run, 'flame.swarm', 2);
    for (let k = 0; k < 200; k++) {
      for (const o of drawFlames(run)) expect([line('flame.edge'), line('flame.swarm')]).not.toContain(o.line);
    }
  });

  it('une lignée dont la première rareté est fermée ne sort jamais', () => {
    const run = fresh(1);
    expect(openRarity(run)).toBe(1);
    for (let k = 0; k < 200; k++) {
      for (const o of drawFlames(run)) expect(data.flames.lines[o.line]!.first).toBeLessThanOrEqual(1);
    }
  });

  it('sans rareté dans la configuration, Rare est la plus haute', () => {
    expect(openRarity(makeRun())).toBe(1);
  });

  it('deux parties de même graine tirent les mêmes offres', () => {
    const a = drawFlames(fresh(4, 77));
    const b = drawFlames(fresh(4, 77));
    expect(a).toEqual(b);
  });

  it('la Chance fait arriver une carte déjà nourrie, sans la faire payer', () => {
    const run = fresh();
    run.cfg.sheet.luck = 10;
    recomputeStats(run);
    let gifts = 0;
    let cards = 0;
    for (let k = 0; k < 300; k++) {
      const offers = drawFlames(run);
      run.totemOffers = offers;
      for (const o of offers) {
        cards++;
        const def = data.flames.lines[o.line]!;
        if (!o.gift) {
          expect(o.rarity).toBe(def.first);
          continue;
        }
        gifts++;
        expect(o.rarity).toBe(def.first + 1);
        expect(o.base).toBe(def.first + 1);
        // Le prix reste celui de la première rareté.
        let entry = 0;
        for (let r = 1; r <= def.first; r++) entry += data.flames.costs[r]!;
        expect(offerCost(run, o)).toBe(entry);
      }
    }
    // Plafonnée à 40 % : ni jamais, ni toujours.
    expect(gifts / cards).toBeGreaterThan(0.3);
    expect(gifts / cards).toBeLessThan(0.5);
  });

  it('sans Chance, aucune carte n\'arrive nourrie', () => {
    const run = fresh();
    run.cfg.sheet.attrs.luck = 0;
    recomputeStats(run);
    for (let k = 0; k < 100; k++) for (const o of drawFlames(run)) expect(o.gift).toBe(false);
  });
});

describe('nourrir une Flamme', () => {
  it('le prix : 6, 8, 12, 16 points, cumulés', () => {
    const run = fresh();
    offer(run, { line: line('flame.edge') }, { line: line('flame.swarm') }, { line: line('flame.surge') });
    expect(offerCost(run, run.totemOffers[0]!)).toBe(0);
    expect(feedOffer(run, 0)).toBe(true);
    expect(offerCost(run, run.totemOffers[0]!)).toBe(6);
    expect(feedOffer(run, 0)).toBe(true);
    expect(run.totemOffers[0]!.rarity).toBe(2);
    expect(offerCost(run, run.totemOffers[0]!)).toBe(14);
    expect(feedOffer(run, 0)).toBe(true);
    expect(offerCost(run, run.totemOffers[0]!)).toBe(26);
    // Une lignée qui commence à Épique se paie depuis Commune ; jusqu'à Mythique : 42.
    expect(offerCost(run, run.totemOffers[1]!)).toBe(14);
    expect(feedOffer(run, 2)).toBe(true);
    expect(feedOffer(run, 2)).toBe(true);
    expect(feedOffer(run, 2)).toBe(true);
    expect(offerCost(run, run.totemOffers[2]!)).toBe(42);
    // Rien n'est payé tant que rien n'est pris.
    expect(run.glowBurned).toBe(0);
    expect(run.hero.stats.glow).toBeCloseTo(BASE_GLOW, 6);
  });

  it('reprendre redescend d\'un cran, jamais sous la rareté d\'arrivée', () => {
    const run = fresh();
    offer(run, { line: line('flame.edge') }, { line: line('flame.stride'), base: 1, rarity: 1, gift: true });
    expect(unfeedOffer(run, 0)).toBe(false);
    feedOffer(run, 0);
    feedOffer(run, 0);
    expect(unfeedOffer(run, 0)).toBe(true);
    expect(run.totemOffers[0]!.rarity).toBe(1);
    expect(unfeedOffer(run, 1)).toBe(false);
    expect(run.totemOffers[1]!.rarity).toBe(1);
  });

  it('une rareté fermée à l\'Autel ne s\'atteint pas', () => {
    const run = fresh(1);
    offer(run, { line: line('flame.edge') });
    expect(feedBlock(run, 0)).toBeNull();
    feedOffer(run, 0);
    expect(feedBlock(run, 0)).toBe('locked');
    expect(feedOffer(run, 0)).toBe(false);
    expect(run.totemOffers[0]!.rarity).toBe(1);
  });

  it('le dernier palier d\'une lignée ne se nourrit plus', () => {
    const run = fresh();
    offer(run, { line: line('flame.stride'), rarity: 2 });
    expect(feedBlock(run, 0)).toBe('top');
  });

  it('deux Légendaires et une Mythique au plus par partie', () => {
    const run = fresh();
    own(run, 'flame.edge', 3);
    offer(run, { line: line('flame.breath'), rarity: 2 }, { line: line('flame.surge'), rarity: 3 });
    expect(feedBlock(run, 0)).toBeNull();
    own(run, 'flame.vein', 3);
    expect(feedBlock(run, 0)).toBe('cap');
    // Une Légendaire affichée peut encore devenir Mythique : le plafond de Mythique est libre.
    expect(feedBlock(run, 1)).toBeNull();
    own(run, 'flame.shadow', 4);
    expect(feedBlock(run, 1)).toBe('cap');
  });

  it('le plancher : pas sous 20 % de la Lueur de base', () => {
    const run = fresh();
    run.cfg.sheet.glowShare = -0.7;
    recomputeStats(run);
    expect(glowShareNow(run)).toBeCloseTo(0.3, 6);
    offer(run, { line: line('flame.edge') });
    expect(feedBlock(run, 0)).toBeNull();
    feedOffer(run, 0);
    expect(glowShareNow(run, offerCost(run, run.totemOffers[0]!))).toBeCloseTo(0.24, 6);
    expect(feedBlock(run, 0)).toBe('floor');
    expect(feedOffer(run, 0)).toBe(false);
  });
});

describe('prendre une Flamme', () => {
  it('paie la mise, donne la Flamme et reprend la partie', () => {
    const run = fresh();
    const power = run.hero.stats.power;
    offer(run, { line: line('flame.edge') }, { line: line('flame.stride') });
    feedOffer(run, 0);
    feedOffer(run, 0);
    feedOffer(run, 1);
    expect(takeFlame(run, 0)).toBe(true);
    // Seule la carte prise est payée.
    expect(run.glowBurned).toBe(14);
    expect(run.hero.stats.glow).toBeCloseTo(BASE_GLOW * 0.86, 4);
    expect(run.flames).toEqual([{ line: line('flame.edge'), rarity: 2 }]);
    expect(run.hero.stats.power - power).toBeCloseTo(0.15, 6);
    expect(run.totemOffers).toEqual([]);
    expect(run.phase).toBe('playing');
    expect(takeFlame(run, 0)).toBe(false);
  });

  it('une Commune ne coûte rien et donne la valeur de l\'ancien buff', () => {
    const run = fresh();
    const base = data.tuning.hero.speed;
    const speed = run.hero.stats.speed;
    offer(run, { line: line('flame.stride') });
    expect(takeFlame(run, 0)).toBe(true);
    expect(run.glowBurned).toBe(0);
    expect(run.hero.stats.speed - speed).toBeCloseTo(base * 0.06, 6);
  });

  it('une rareté remplace la précédente : elles ne s\'ajoutent pas', () => {
    const run = fresh();
    const power = run.hero.stats.power;
    offer(run, { line: line('flame.edge'), rarity: 3 });
    takeFlame(run, 0);
    expect(run.hero.stats.power - power).toBeCloseTo(0.2, 6);
    expect(run.hero.stats.eliteDamage).toBeCloseTo(0.1, 6);
  });

  it('les règles d\'une Flamme s\'ajoutent à celles de la Lanterne', () => {
    const run = fresh();
    run.cfg.mods = { ...run.mods, threatMult: 1.4, dashCooldownMult: 1.5 };
    recomputeStats(run);
    offer(run, { line: line('flame.bait') }, { line: line('flame.surge') });
    takeFlame(run, 0);
    expect(run.mods.threatMult).toBeCloseTo(1.4 * 1.15, 6);
    offer(run, { line: line('flame.surge') });
    takeFlame(run, 0);
    expect(run.mods.dashCooldownMult).toBeCloseTo(1.5 * 0.8, 6);
    expect(run.mods.threatMult).toBeCloseTo(1.4 * 1.15, 6);
  });

  it('une relance gagnée en cours de partie arrive prête', () => {
    const run = fresh();
    const rerolls = run.hero.rerolls;
    const banishes = run.hero.banishes;
    offer(run, { line: line('flame.vein'), rarity: 3 });
    takeFlame(run, 0);
    expect(run.hero.rerolls).toBe(rerolls + 2);
    expect(run.hero.banishes).toBe(banishes + 1);
  });

  it('refuse une prise que le plancher interdit', () => {
    const run = fresh();
    run.cfg.sheet.glowShare = -0.75;
    recomputeStats(run);
    offer(run, { line: line('flame.swarm') });
    expect(takeFlame(run, 0)).toBe(false);
    expect(run.phase).toBe('totem');
    expect(run.flames).toEqual([]);
  });
});

describe('Lueur brûlée et braséros', () => {
  it('un braséro rallumé rembourse 10 points brûlés, jamais plus', () => {
    const run = fresh();
    run.glowBurned = 26;
    run.braziersLit = 1;
    recomputeStats(run);
    expect(glowLoss(run)).toBe(16);
    expect(run.hero.stats.glow).toBeCloseTo(BASE_GLOW * 0.84, 4);
    run.braziersLit = 4;
    recomputeStats(run);
    expect(glowLoss(run)).toBe(0);
    expect(run.hero.stats.glow).toBeCloseTo(BASE_GLOW, 6);
  });

  it('un braséro rallumé avant toute mise rembourse la première', () => {
    const run = fresh();
    run.braziersLit = 1;
    offer(run, { line: line('flame.edge') });
    feedOffer(run, 0);
    takeFlame(run, 0);
    expect(run.glowBurned).toBe(6);
    expect(glowLoss(run)).toBe(0);
    expect(run.hero.stats.glow).toBeCloseTo(BASE_GLOW, 6);
  });
});

describe('totems, cas limites', () => {
  function chargeTotem(run: Run): void {
    const poi = run.map.pois.find((p) => p.kind === 'totem')!;
    const input = idleInput();
    for (let i = 0; i < 60 * 7 && run.phase !== 'totem' && poi.state !== 2; i++) {
      run.hero.x = poi.x;
      run.hero.y = poi.y + 4;
      if (run.phase === 'levelup') takeCard(run, 0);
      else if (run.phase === 'chest') closeChest(run);
      stepRun(run, input);
      run.evCount = 0;
    }
  }

  it('Lueur au plancher : trois offres, toutes gratuites et prenables', () => {
    const run = fresh();
    run.cfg.sheet.glowShare = -0.8;
    recomputeStats(run);
    for (let k = 0; k < 100; k++) {
      const offers = drawFlames(run);
      run.totemOffers = offers;
      expect(offers.length).toBe(3);
      for (const o of offers) expect(offerCost(run, o)).toBe(0);
    }
    run.phase = 'totem';
    expect(takeFlame(run, 2)).toBe(true);
  });

  it('une seule lignée restante : une seule offre', () => {
    const run = fresh();
    for (const l of data.flames.lines) if (l.id !== 'flame.kindling') run.flames.push({ line: l.index, rarity: l.first });
    const offers = drawFlames(run);
    expect(offers.map((o) => o.line)).toEqual([line('flame.kindling')]);
  });

  it('plus aucune lignée : le totem donne de l\'or et la partie continue', () => {
    const run = fresh();
    makeImmortal(run);
    for (const l of data.flames.lines) run.flames.push({ line: l.index, rarity: l.first });
    expect(drawFlames(run)).toEqual([]);
    const gold = run.hero.gold;
    chargeTotem(run);
    expect(run.phase).not.toBe('totem');
    expect(run.hero.gold - gold).toBeGreaterThanOrEqual(data.tuning.gold.chest[0]);
  });

  it('charger un totem ouvre l\'écran avec trois offres', () => {
    const run = fresh();
    makeImmortal(run);
    chargeTotem(run);
    expect(run.phase).toBe('totem');
    expect(run.totemOffers.length).toBe(3);
  });
});
