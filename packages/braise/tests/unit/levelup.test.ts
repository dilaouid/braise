import { describe, expect, it } from 'vitest';
import { banishCard, closeChest, drawCards, gainXp, openChest, readyEvolution, rerollCards, skipCards, takeCard } from '../../src/core/levelup.ts';
import type { Card, Run } from '../../src/core/types.ts';
import { data, makeRun } from './helpers.ts';

function assertValid(run: Run, card: Card): void {
  const slots = data.tuning.slots;
  if (card.kind === 'weapon') {
    const def = data.weapons[card.def]!;
    const owned = run.weapons.find((w) => w.def === card.def);
    expect(def.evolved, 'une arme évoluée n\'est jamais proposée').toBe(false);
    if (owned) {
      expect(owned.level, `${def.id} déjà au maximum`).toBeLessThan(def.levels.length);
      expect(card.level).toBe(owned.level + 1);
    } else {
      expect(run.weapons.length, 'emplacements d\'armes pleins').toBeLessThan(slots.weapons);
      expect(run.weapons.some((w) => w.def === def.evolution), 'forme évoluée déjà portée').toBe(false);
      expect(card.level).toBe(1);
    }
    expect(run.banned.has(def.id)).toBe(false);
  } else if (card.kind === 'relic') {
    const def = data.relics[card.def]!;
    const owned = run.relics.find((r) => r.def === card.def);
    if (owned) expect(owned.level).toBeLessThan(def.maxLevel);
    else expect(run.relics.length, 'emplacements de reliques pleins').toBeLessThan(slots.relics);
    expect(run.banned.has(def.id)).toBe(false);
  }
}

describe('montée de niveau (document 02 §5.5)', () => {
  it('aucune carte ne propose un objet au maximum ou impossible à prendre, sur 10 000 tirages', () => {
    let draws = 0;
    let seed = 100;
    while (draws < 10000) {
      const run = makeRun(seed++);
      for (let step = 0; step < 80 && draws < 10000; step++) {
        run.pendingLevels = 1;
        run.phase = 'levelup';
        drawCards(run);
        draws++;
        expect(run.cards.length).toBeGreaterThanOrEqual(3);
        const keys = run.cards.filter((c) => c.kind === 'weapon' || c.kind === 'relic').map((c) => `${c.kind}:${c.def}`);
        expect(new Set(keys).size, 'deux fois la même carte').toBe(keys.length);
        for (const card of run.cards) assertValid(run, card);
        takeCard(run, run.rngDraw.int(run.cards.length));
        if (readyEvolution(run)) {
          openChest(run);
          closeChest(run);
        }
      }
    }
  });

  it('quand tout est au maximum, les cartes offrent de l\'or ou un soin', () => {
    const run = makeRun(1);
    for (let i = 0; i < 400; i++) {
      run.pendingLevels = 1;
      run.phase = 'levelup';
      drawCards(run);
      if (run.cards.every((c) => c.kind === 'gold' || c.kind === 'heal')) break;
      takeCard(run, 0);
    }
    expect(run.cards.length).toBe(3);
    expect(run.cards.every((c) => c.kind === 'gold' || c.kind === 'heal')).toBe(true);
    const gold = run.hero.gold;
    takeCard(run, 0);
    expect(run.hero.gold).toBe(gold + data.tuning.gold.cardGold);
  });

  it('la protection contre la malchance garantit une carte d\'évolution au quatrième tirage', () => {
    const run = makeRun(77);
    run.phase = 'levelup';
    run.pityCount = data.tuning.luckPity;
    // On force le tirage à ne contenir aucune carte d'évolution, puis on vérifie la garantie.
    for (let trial = 0; trial < 300; trial++) {
      run.pityCount = data.tuning.luckPity;
      drawCards(run);
      expect(run.cards.some((c) => c.evolves), `tirage ${trial}`).toBe(true);
      expect(run.pityCount).toBe(0);
    }
  });

  it('trois tirages sans évolution font monter le compteur, jamais au-delà du seuil', () => {
    const run = makeRun(78);
    run.phase = 'levelup';
    let longest = 0;
    let streak = 0;
    for (let i = 0; i < 2000; i++) {
      drawCards(run);
      if (run.cards.some((c) => c.evolves)) streak = 0;
      else streak++;
      longest = Math.max(longest, streak);
    }
    expect(longest).toBeLessThanOrEqual(data.tuning.luckPity);
  });

  it('plusieurs niveaux gagnés d\'un coup enchaînent les choix', () => {
    const run = makeRun(2);
    gainXp(run, 8 + 15 + 25);
    expect(run.hero.level).toBe(4);
    expect(run.pendingLevels).toBe(3);
    run.phase = 'levelup';
    drawCards(run);
    takeCard(run, 0);
    expect(run.phase).toBe('levelup');
    takeCard(run, 0);
    takeCard(run, 0);
    expect(run.phase).toBe('playing');
  });

  it('relancer et bannir demandent une charge ; passer donne de l\'or', () => {
    const run = makeRun(2);
    run.pendingLevels = 1;
    run.phase = 'levelup';
    drawCards(run);
    expect(rerollCards(run)).toBe(false);
    expect(banishCard(run, 0)).toBe(false);
    run.hero.rerolls = 1;
    run.hero.banishes = 1;
    expect(rerollCards(run)).toBe(true);
    expect(run.hero.rerolls).toBe(0);
    const first = run.cards[0]!;
    const id = first.kind === 'weapon' ? data.weapons[first.def]!.id : data.relics[first.def]!.id;
    expect(banishCard(run, 0)).toBe(true);
    expect(run.banned.has(id)).toBe(true);
    for (let i = 0; i < 50; i++) {
      drawCards(run);
      for (const c of run.cards) {
        const cid = c.kind === 'weapon' ? data.weapons[c.def]!.id : c.kind === 'relic' ? data.relics[c.def]!.id : '';
        expect(cid).not.toBe(id);
      }
    }
    const gold = run.hero.gold;
    expect(skipCards(run)).toBe(true);
    expect(run.hero.gold).toBe(gold + data.tuning.gold.skipCard);
    expect(run.phase).toBe('playing');
  });
});

describe('évolutions (document 02 §5.4)', () => {
  it('arme au niveau 6 et relique liée : le prochain coffre la fait évoluer, la relique est gardée', () => {
    const run = makeRun(3);
    const scythe = run.weapons[0]!;
    const def = data.weapons[scythe.def]!;
    scythe.level = 6;
    expect(readyEvolution(run)).toBeNull();
    run.relics.push({ def: def.relic, level: 1 });
    expect(readyEvolution(run)).toBe(scythe);
    run.pendingChests = 1;
    openChest(run);
    expect(run.phase).toBe('chest');
    expect(run.chest?.evolvedTo).toBe(def.evolution);
    expect(data.weapons[scythe.def]!.evolved).toBe(true);
    expect(run.relics.length).toBe(1);
    closeChest(run);
    expect(run.phase).toBe('playing');
  });

  it('deux évolutions prêtes : le coffre donne la plus ancienne, la suivante au coffre d\'après', () => {
    const run = makeRun(3);
    const first = run.weapons[0]!;
    first.level = 6;
    run.relics.push({ def: data.weapons[first.def]!.relic, level: 1 });
    const sparks = data.weapons.find((w) => w.id === 'weapon.sparks')!;
    run.weapons.push({ ...first, def: sparks.index, order: 5, level: 6 });
    run.relics.push({ def: sparks.relic, level: 1 });
    run.pendingChests = 2;
    openChest(run);
    expect(run.chest?.evolvedFrom).toBe(data.weapons.find((w) => w.id === 'weapon.scythe')!.index);
    closeChest(run);
    expect(run.phase).toBe('chest');
    expect(run.chest?.evolvedFrom).toBe(sparks.index);
    closeChest(run);
    expect(run.phase).toBe('playing');
  });

  it('un coffre sans évolution prête donne seulement de l\'or', () => {
    const run = makeRun(3);
    run.pendingChests = 1;
    openChest(run);
    expect(run.chest?.evolvedTo).toBe(-1);
    expect(run.chest!.gold).toBeGreaterThanOrEqual(80);
    expect(run.chest!.gold).toBeLessThanOrEqual(120);
  });
});
