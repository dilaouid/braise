import { healHero } from './combat.ts';
import { flameMods, glowLoss } from './flames.ts';
import { addBonus, cloneSheet, resolveStats, runXpForNext } from './stats.ts';
import { emit, tutorialNote } from './stores.ts';
import { EV, type Card, type Run, type WeaponInstance } from './types.ts';
import { addWeapon } from './weapons.ts';

/** Recalcule les statistiques et les règles de la partie : feuille de départ, reliques, Flammes, trouvailles, Lueur brûlée. */
export function recomputeStats(run: Run): void {
  const sheet = cloneSheet(run.cfg.sheet);
  for (const r of run.relics) {
    const def = run.data.relics[r.def]!;
    addBonus(sheet, def.perLevel, r.level);
    for (const [lvl, bonus] of Object.entries(def.atLevels)) if (r.level >= Number(lvl)) addBonus(sheet, bonus, 1);
  }
  for (const f of run.flames) {
    const tier = run.data.flames.lines[f.line]!.tiers[f.rarity];
    if (tier) addBonus(sheet, tier.stats, 1);
  }
  for (const f of run.finds) addBonus(sheet, run.data.finds[f]!.bonus, 1);
  sheet.flasks += run.extraFlasks;
  // La Lueur brûlée pour nourrir des Flammes, moins ce que les braséros ont remboursé.
  sheet.glowShare -= glowLoss(run) / 100;
  run.sheet = sheet;
  const hero = run.hero;
  const chargesBefore = run.mods.dashCharges;
  run.mods = flameMods(run);
  // Une charge de ruée de plus arrive prête à servir.
  if (run.mods.dashCharges > chargesBefore) hero.dashCharges += run.mods.dashCharges - chargesBefore;
  const before = hero.stats.maxHp;
  const flasksBefore = hero.stats.flasks;
  const revivesBefore = hero.stats.revives;
  const rerollsBefore = hero.stats.rerolls;
  const banishesBefore = hero.stats.banishes;
  resolveStats(sheet, run.data.tuning, run.data.heroTuning, hero.stats);
  // Ombre : du critique pour chaque point de Lueur sous la Lueur de base.
  if (run.mods.shadowCrit > 0) {
    const tuning = run.data.tuning.hero;
    const missing = Math.max(0, 100 - (100 * hero.stats.glow) / tuning.glow);
    hero.stats.critChance = Math.min(tuning.critCap, hero.stats.critChance + run.mods.shadowCrit * missing);
  }
  // Une fiole ou une résurrection de plus arrive prête à servir.
  if (hero.stats.flasks > flasksBefore) hero.flasks += hero.stats.flasks - flasksBefore;
  if (hero.stats.revives > revivesBefore) hero.revives += hero.stats.revives - revivesBefore;
  if (hero.stats.rerolls > rerollsBefore) hero.rerolls += hero.stats.rerolls - rerollsBefore;
  if (hero.stats.banishes > banishesBefore) hero.banishes += hero.stats.banishes - banishesBefore;
  // Des points de vie maximum en plus sont aussi des points de vie en plus.
  if (before > 0 && hero.stats.maxHp > before) hero.hp += hero.stats.maxHp - before;
  if (hero.hp > hero.stats.maxHp) hero.hp = hero.stats.maxHp;
}

function ownedWeapon(run: Run, def: number): WeaponInstance | undefined {
  return run.weapons.find((w) => w.def === def);
}

/** Vrai si le héros porte cette arme ou sa forme évoluée. */
function ownsWeaponLine(run: Run, def: number): boolean {
  const evolved = run.data.weapons[def]!.evolution;
  return run.weapons.some((w) => w.def === def || (evolved >= 0 && w.def === evolved));
}

function slotLimits(run: Run): { weapons: number; relics: number } {
  return run.data.tuning.slots;
}

/** Toutes les cartes qu'il est possible de proposer, avec leur poids. */
export function cardCandidates(run: Run): Array<{ card: Card; weight: number }> {
  const out: Array<{ card: Card; weight: number }> = [];
  const data = run.data;
  const luck = 1 + run.hero.stats.luck;
  const limits = slotLimits(run);
  for (const w of run.weapons) {
    const def = data.weapons[w.def]!;
    if (def.evolved || w.level >= def.levels.length) continue;
    if (run.banned.has(def.id)) continue;
    // Monter une arme possédée la rapproche de son évolution.
    out.push({ card: { kind: 'weapon', def: w.def, level: w.level + 1, evolves: true }, weight: 2 * luck });
  }
  for (const r of run.relics) {
    const def = data.relics[r.def]!;
    if (r.level >= def.maxLevel || run.banned.has(def.id)) continue;
    out.push({ card: { kind: 'relic', def: r.def, level: r.level + 1, evolves: false }, weight: 2 });
  }
  if (run.weapons.length < limits.weapons) {
    for (const idx of run.weaponPool) {
      const def = data.weapons[idx]!;
      if (ownsWeaponLine(run, idx) || run.banned.has(def.id)) continue;
      out.push({ card: { kind: 'weapon', def: idx, level: 1, evolves: false }, weight: 1 });
    }
  }
  if (run.relics.length < limits.relics) {
    for (const idx of run.relicPool) {
      const def = data.relics[idx]!;
      if (run.relics.some((r) => r.def === idx) || run.banned.has(def.id)) continue;
      const linked = ownedWeapon(run, def.weapon);
      const line = ownsWeaponLine(run, def.weapon);
      // La relique liée à une arme possédée pèse une fois et demie plus, et sert son évolution.
      const evolves = linked !== undefined;
      out.push({ card: { kind: 'relic', def: idx, level: 1, evolves }, weight: (line ? 1.5 : 1) * (evolves ? luck : 1) });
    }
  }
  return out;
}

/** Tire les cartes d'une montée de niveau dans `run.cards`. */
export function drawCards(run: Run): void {
  const rng = run.rngDraw;
  const pool = cardCandidates(run);
  const wanted = Math.max(1, run.hero.stats.cards);
  const cards: Card[] = [];
  const weights = pool.map((c) => c.weight);
  const hadEvolving = pool.some((c) => c.card.evolves);
  while (cards.length < wanted) {
    const pick = rng.weighted(weights);
    if (pick < 0) break;
    cards.push(pool[pick]!.card);
    weights[pick] = 0;
  }
  // Protection contre la malchance : après trois tirages sans carte d'évolution, le suivant en contient une.
  if (cards.some((c) => c.evolves)) {
    run.pityCount = 0;
  } else if (hadEvolving && cards.length > 0) {
    if (run.pityCount >= run.data.tuning.luckPity) {
      const evolving = pool.filter((c) => c.card.evolves);
      cards[cards.length - 1] = evolving[rng.int(evolving.length)]!.card;
      run.pityCount = 0;
    } else {
      run.pityCount++;
    }
  }
  // Quand tout est au maximum, les cartes proposent de l'or ou un soin.
  let filler = 0;
  while (cards.length < Math.min(wanted, 3) && filler < 3) {
    cards.push({ kind: filler % 2 === 0 ? 'gold' : 'heal', def: -1, level: 0, evolves: false });
    filler++;
  }
  run.cards = cards;
}

function finishChoice(run: Run): void {
  run.pendingLevels = Math.max(0, run.pendingLevels - 1);
  run.cards = [];
  run.director.breathT = run.data.tuning.director.breathSeconds;
  tutorialNote(run, 'card');
  resumeRun(run);
}

/** Applique une carte d'arme ou de relique : l'acquiert, ou la monte au niveau de la carte. */
export function applyCard(run: Run, card: Card): void {
  if (card.kind === 'weapon') {
    const owned = ownedWeapon(run, card.def);
    if (owned) owned.level = card.level;
    else addWeapon(run, card.def);
  } else if (card.kind === 'relic') {
    const owned = run.relics.find((r) => r.def === card.def);
    if (owned) owned.level = card.level;
    else run.relics.push({ def: card.def, level: 1 });
    recomputeStats(run);
  }
}

/** Donne une trouvaille au hasard et l'affiche ; si la réserve est vide, l'or d'un coffre. */
function openFind(run: Run): void {
  run.pendingFinds = Math.max(0, run.pendingFinds - 1);
  const next = run.findPool.pop();
  if (next === undefined) {
    const range = run.data.tuning.gold.chest;
    run.findGold = run.rngDraw.intRange(range[0], range[1]);
    run.hero.gold += run.findGold;
    run.find = -2;
  } else {
    run.find = next;
    run.findGold = 0;
    run.finds.push(next);
    recomputeStats(run);
  }
  emit(run, EV.findGot, run.hero.x, run.hero.y, run.find);
  tutorialNote(run, 'find');
  run.phase = 'find';
}

/** Referme la trouvaille affichée. */
export function closeFind(run: Run): void {
  if (run.phase !== 'find') return;
  run.find = -1;
  resumeRun(run);
}

/**
 * Reprend la partie, ou ouvre ce qui attend : un coffre, puis une trouvaille, puis un choix de carte.
 * Tous les écrans de choix se referment par ici, pour qu'aucun ne soit perdu.
 */
export function resumeRun(run: Run): void {
  if (run.pendingChests > 0) {
    openChest(run);
  } else if (run.pendingFinds > 0) {
    openFind(run);
  } else if (run.pendingLevels > 0) {
    drawCards(run);
    run.phase = 'levelup';
  } else {
    run.phase = 'playing';
  }
}

/** Prend la carte d'indice donné. */
export function takeCard(run: Run, index: number): boolean {
  if (run.phase !== 'levelup') return false;
  const card = run.cards[index];
  if (!card) return false;
  const tuning = run.data.tuning;
  if (card.kind === 'weapon' || card.kind === 'relic') {
    applyCard(run, card);
  } else if (card.kind === 'gold') {
    run.hero.gold += tuning.gold.cardGold;
  } else {
    healHero(run, run.hero.stats.maxHp * tuning.cardHealShare);
  }
  finishChoice(run);
  return true;
}

/** Relance les cartes, s'il reste une relance. */
export function rerollCards(run: Run): boolean {
  if (run.phase !== 'levelup' || run.hero.rerolls <= 0) return false;
  run.hero.rerolls--;
  drawCards(run);
  return true;
}

/** Bannit une carte pour le reste de la partie, s'il reste un bannissement. */
export function banishCard(run: Run, index: number): boolean {
  if (run.phase !== 'levelup' || run.hero.banishes <= 0) return false;
  const card = run.cards[index];
  if (!card || (card.kind !== 'weapon' && card.kind !== 'relic')) return false;
  run.hero.banishes--;
  run.banned.add(card.kind === 'weapon' ? run.data.weapons[card.def]!.id : run.data.relics[card.def]!.id);
  drawCards(run);
  return true;
}

/** Passe le choix contre un peu d'or. */
export function skipCards(run: Run): boolean {
  if (run.phase !== 'levelup') return false;
  run.hero.gold += run.data.tuning.gold.skipCard;
  finishChoice(run);
  return true;
}

/** Ajoute de l'expérience de partie ; les niveaux gagnés attendent leur choix. */
export function gainXp(run: Run, amount: number): void {
  const hero = run.hero;
  hero.xp += amount * (1 + hero.stats.wisdom);
  while (hero.xp >= hero.xpNext) {
    hero.xp -= hero.xpNext;
    hero.level++;
    hero.xpNext = runXpForNext(hero.level, run.data.tuning.xp);
    run.pendingLevels++;
    emit(run, EV.levelUp, hero.x, hero.y, hero.level);
  }
}

/** Vrai si l'arme peut évoluer : niveau maximum et relique liée possédée. */
function canEvolve(run: Run, w: WeaponInstance): boolean {
  const def = run.data.weapons[w.def]!;
  if (def.evolved || def.evolution < 0 || w.level < def.levels.length) return false;
  return run.relics.some((r) => r.def === def.relic);
}

/** Les armes prêtes à évoluer, de la plus ancienne à la plus récente. */
export function evolvableWeapons(run: Run): WeaponInstance[] {
  return run.weapons.filter((w) => canEvolve(run, w)).sort((a, b) => a.order - b.order);
}

/** L'arme prête à évoluer la plus ancienne : niveau maximum et relique liée possédée. */
export function readyEvolution(run: Run): WeaponInstance | null {
  return evolvableWeapons(run)[0] ?? null;
}

/** Fait évoluer l'arme : elle devient sa forme évoluée, au niveau 1. */
export function evolveWeapon(run: Run, w: WeaponInstance): void {
  const def = run.data.weapons[w.def]!;
  w.def = def.evolution;
  w.level = 1;
  w.cd = 0.3;
  w.timer = 0;
  w.pending = 0;
  w.burst = 0;
  run.evolutions++;
  emit(run, EV.evolution, run.hero.x, run.hero.y, w.def);
}

/**
 * Ouvre un coffre de braise : une évolution si une arme est prête, sinon un choix de carte gratuit
 * (proposé à la fermeture du coffre), et un peu d'or.
 */
export function openChest(run: Run): void {
  const tuning = run.data.tuning;
  const gold = run.rngDraw.intRange(tuning.gold.chest[0], tuning.gold.chest[1]);
  run.hero.gold += gold;
  let evolvedTo = -1;
  let evolvedFrom = -1;
  const ready = readyEvolution(run);
  if (ready) {
    evolvedFrom = ready.def;
    evolveWeapon(run, ready);
    evolvedTo = ready.def;
  }
  // Sans évolution, le coffre donne un niveau d'arme ou de relique : un choix de plus, sans
  // changer le niveau de partie. closeChest l'enchaîne avec les niveaux qui attendent.
  const freeLevel = !ready;
  if (freeLevel) run.pendingLevels++;
  run.pendingChests = Math.max(0, run.pendingChests - 1);
  run.chest = { evolvedTo, evolvedFrom, gold, freeLevel };
  run.phase = 'chest';
}

/** Referme le coffre affiché et reprend la partie, ou enchaîne sur ce qui attend. */
export function closeChest(run: Run): void {
  if (run.phase !== 'chest') return;
  run.chest = null;
  resumeRun(run);
}
