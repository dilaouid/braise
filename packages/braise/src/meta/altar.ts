import type { AltarBoostRaw, GameData } from '../content/index.ts';
import type { Save } from './save.ts';

/** Coût d'un rang (à partir de 1) : `arrondi(base × croissance^(rang − 1))`. */
export function altarCost(boost: AltarBoostRaw, rank: number): number {
  return Math.round(boost.baseCost * Math.pow(boost.growth, rank - 1));
}

/** Total des Cendres pour monter un boost de 0 à `ranks`. */
export function altarTotalCost(boost: AltarBoostRaw, ranks: number): number {
  let total = 0;
  for (let r = 1; r <= ranks; r++) total += altarCost(boost, r);
  return total;
}

/** Total des Cendres dépensées à l'Autel dans cette sauvegarde. */
export function altarSpent(save: Save, data: GameData): number {
  let total = 0;
  for (const boost of data.altar) total += altarTotalCost(boost, save.account.altar[boost.id] ?? 0);
  return total;
}

export type AltarError = 'unknown' | 'max' | 'requires' | 'ashes' | 'shards';

/** Le rang courant d'un boost. */
export function altarRank(save: Save, id: string): number {
  return save.account.altar[id] ?? 0;
}

/** Vrai si le rang suivant peut être acheté. */
export function canBuyAltarRank(save: Save, data: GameData, id: string): AltarError | null {
  const boost = data.altar.find((b) => b.id === id);
  if (!boost) return 'unknown';
  const rank = altarRank(save, id);
  if (boost.ranks > 0 && rank >= boost.ranks) return 'max';
  if (boost.requires !== undefined && altarRank(save, boost.requires) <= 0) return 'requires';
  if (save.account.ashes < altarCost(boost, rank + 1)) return 'ashes';
  if (rank === 0 && save.account.shards < boost.shards) return 'shards';
  return null;
}

/** Achète un rang. Le coût prélevé est le coût affiché. */
export function buyAltarRank(save: Save, data: GameData, id: string): { ok: boolean; error: AltarError | null; cost: number } {
  const error = canBuyAltarRank(save, data, id);
  if (error) return { ok: false, error, cost: 0 };
  const boost = data.altar.find((b) => b.id === id)!;
  const rank = altarRank(save, id);
  const cost = altarCost(boost, rank + 1);
  save.account.ashes -= cost;
  if (rank === 0) save.account.shards -= boost.shards;
  save.account.altar[id] = rank + 1;
  return { ok: true, error: null, cost };
}

/** Rend toutes les Cendres : remet tous les rangs à zéro et rend exactement la somme dépensée. */
export function refundAltar(save: Save, data: GameData): number {
  const refund = altarSpent(save, data);
  let shards = 0;
  for (const boost of data.altar) if ((save.account.altar[boost.id] ?? 0) > 0) shards += boost.shards;
  save.account.altar = {};
  // Un boost racheté repart actif.
  save.account.altarDisabled = [];
  save.account.ashes += refund;
  save.account.shards += shards;
  return refund;
}

/** Les raretés que l'Autel ouvre, dans l'ordre : Épique est la rareté 2. */
const UNLOCKS = ['epic', 'legendary', 'mythic'] as const;

/**
 * La rareté de Flamme la plus haute ouverte : Rare (1) au départ, puis une de plus par déblocage acheté
 * et actif. La chaîne s'arrête au premier qui manque ou qui est désactivé.
 */
export function flameRarity(save: Save, data: GameData): number {
  let rarity = 1;
  for (const name of UNLOCKS) {
    const boost = data.altar.find((b) => b.unlock === name);
    if (!boost || altarRank(save, boost.id) <= 0 || save.account.altarDisabled.includes(boost.id)) break;
    rarity++;
  }
  return rarity;
}

/** Active ou désactive un boost, sans le rembourser. */
export function setAltarBoostEnabled(save: Save, id: string, enabled: boolean): void {
  const list = save.account.altarDisabled.filter((x) => x !== id);
  if (!enabled) list.push(id);
  save.account.altarDisabled = list;
}
