import type { FlameLine } from '../content/index.ts';
import { summonElites } from './director.ts';
import { recomputeStats, resumeRun } from './levelup.ts';
import { NEUTRAL_MODS, mergeMods, type RunMods } from './mods.ts';
import { emit, tutorialNote } from './stores.ts';
import { EV, type FlameOffer, type Run } from './types.ts';

/** Ce qui empêche de nourrir une offre d'un cran de plus. */
export type FeedBlock = 'top' | 'locked' | 'cap' | 'floor';

/** Marge des comparaisons au plancher : 1 − 0,8 ne vaut pas tout à fait 0,2. */
const EPS = 1e-9;

/** La rareté la plus haute que l'Autel a ouverte pour cette partie. Sans réglage : Rare. */
export function openRarity(run: Run): number {
  return run.cfg.flameRarity ?? 1;
}

/** Points de Lueur pour monter une Flamme de Commune à cette rareté. */
function priceTo(run: Run, rarity: number): number {
  const costs = run.data.flames.costs;
  let total = 0;
  for (let r = 1; r <= rarity; r++) total += costs[r]!;
  return total;
}

/** Points à payer pour prendre l'offre à sa rareté affichée. Le cran offert par la Chance n'est pas compté. */
export function offerCost(run: Run, offer: FlameOffer): number {
  const gift = offer.gift ? run.data.flames.costs[run.data.flames.lines[offer.line]!.first + 1]! : 0;
  return priceTo(run, offer.rarity) - gift;
}

/** La perte de Lueur si `extra` points de plus étaient brûlés : chaque braséro rallumé en rembourse une part. */
function lossWith(run: Run, extra: number): number {
  return Math.max(0, run.glowBurned + extra - run.data.flames.brazierRefund * run.braziersLit);
}

/** Points de Lueur perdus : ce qui a été brûlé, moins ce que les braséros ont remboursé. */
export function glowLoss(run: Run): number {
  return lossWith(run, 0);
}

/** La Lueur en part de la Lueur de base (1 : 100 %), après avoir brûlé `extraPoints` de plus. */
export function glowShareNow(run: Run, extraPoints = 0): number {
  return 1 + run.sheet.glowShare + (glowLoss(run) - lossWith(run, extraPoints)) / 100;
}

/** Vrai si la partie porte déjà autant de Flammes de cette rareté qu'elle en a le droit. */
function capReached(run: Run, rarity: number): boolean {
  const cap = run.data.flames.caps[rarity]!;
  if (cap <= 0) return false;
  let owned = 0;
  for (const f of run.flames) if (f.rarity === rarity) owned++;
  return owned >= cap;
}

/** Vrai si brûler ces points laisse la Lueur au-dessus du plancher. Ne rien payer est toujours permis. */
function affordable(run: Run, points: number): boolean {
  return points <= 0 || glowShareNow(run, points) >= run.data.flames.floor - EPS;
}

/** Ce qui empêche de nourrir l'offre d'un cran de plus, ou null. */
export function feedBlock(run: Run, index: number): FeedBlock | null {
  const offer = run.totemOffers[index];
  if (!offer) return 'top';
  const def = run.data.flames.lines[offer.line]!;
  const next = offer.rarity + 1;
  if (next > def.last) return 'top';
  if (next > openRarity(run)) return 'locked';
  if (capReached(run, next)) return 'cap';
  if (!affordable(run, offerCost(run, { ...offer, rarity: next }))) return 'floor';
  return null;
}

/** Monte l'offre d'une rareté. Rien n'est payé avant la prise. */
export function feedOffer(run: Run, index: number): boolean {
  if (run.phase !== 'totem' || feedBlock(run, index) !== null) return false;
  run.totemOffers[index]!.rarity++;
  return true;
}

/** Redescend l'offre d'une rareté, jamais sous celle à laquelle elle est arrivée. */
export function unfeedOffer(run: Run, index: number): boolean {
  const offer = run.totemOffers[index];
  if (run.phase !== 'totem' || !offer || offer.rarity <= offer.base) return false;
  offer.rarity--;
  return true;
}

/** Vrai si la lignée peut être proposée : pas encore possédée, et sa première rareté se paie maintenant. */
function drawable(run: Run, def: FlameLine, owned: Set<number>): boolean {
  if (owned.has(def.index) || def.first < 0 || def.first > openRarity(run) || capReached(run, def.first)) return false;
  return affordable(run, priceTo(run, def.first));
}

/**
 * Tire les Flammes d'un totem : des lignées différentes, que le héros n'a pas. Toutes les cartes sauf la
 * dernière viennent des lignées gratuites ; la dernière vient de toutes celles qu'il peut payer.
 */
export function drawFlames(run: Run): FlameOffer[] {
  const flames = run.data.flames;
  const rng = run.rngDraw;
  const owned = new Set(run.flames.map((f) => f.line));
  const any = flames.lines.map((l) => (drawable(run, l, owned) ? 1 : 0));
  const free = flames.lines.map((l, i) => (any[i] === 1 && l.first === 0 ? 1 : 0));
  const wanted = run.data.tuning.events.totem.choices;
  const open = openRarity(run);
  const chance = Math.min(flames.fed.max, flames.fed.perLuck * run.hero.stats.luck);
  const out: FlameOffer[] = [];
  while (out.length < wanted) {
    let pick = out.length < wanted - 1 ? rng.weighted(free) : -1;
    if (pick < 0) pick = rng.weighted(any);
    if (pick < 0) break;
    any[pick] = 0;
    free[pick] = 0;
    const def = flames.lines[pick]!;
    // La Chance offre un cran, s'il existe et s'il est permis.
    const next = def.first + 1;
    const gift = rng.chance(chance) && next <= def.last && next <= open && !capReached(run, next);
    const rarity = gift ? next : def.first;
    out.push({ line: pick, base: rarity, rarity, gift });
  }
  return out;
}

/** Prend l'offre d'indice donné : paie sa mise en Lueur et donne la Flamme à la rareté affichée. */
export function takeFlame(run: Run, index: number): boolean {
  if (run.phase !== 'totem') return false;
  const offer = run.totemOffers[index];
  if (!offer) return false;
  const cost = offerCost(run, offer);
  if (offer.rarity > openRarity(run) || capReached(run, offer.rarity) || !affordable(run, cost)) return false;
  run.glowBurned += cost;
  run.flames.push({ line: offer.line, rarity: offer.rarity });
  run.totemOffers = [];
  if (cost > 0) emit(run, EV.flameFeed, run.hero.x, run.hero.y, cost);
  const tier = run.data.flames.lines[offer.line]!.tiers[offer.rarity];
  if (tier && tier.elites > 0) summonElites(run, tier.elites);
  tutorialNote(run, 'boon');
  recomputeStats(run);
  resumeRun(run);
  return true;
}

/** Le rayon éclairé : la Lueur plus la marge du disque de lumière dessiné à l'écran. */
export function litRadius(run: Run): number {
  return run.hero.stats.glow + run.data.tuning.hero.lightMargin;
}

/** Les règles de la partie : celles de la Lanterne, puis celles de chaque Flamme. */
export function flameMods(run: Run): RunMods {
  let mods: RunMods = { ...(run.cfg.mods ?? NEUTRAL_MODS) };
  for (const f of run.flames) {
    const tier = run.data.flames.lines[f.line]!.tiers[f.rarity];
    if (tier) mods = mergeMods(mods, tier.mods);
  }
  return mods;
}
