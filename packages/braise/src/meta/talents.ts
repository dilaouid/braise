import type { ClassDef, HeroTuning, RunModsRaw, TalentNodeRaw } from '../content/index.ts';
import { NEUTRAL_MODS, stackMods, type RunMods } from '../core/mods.ts';
import type { StatSource } from './hero.ts';
import type { HeroSave } from './save.ts';

/** Pourquoi un point ne se place pas (ou ne se retire pas). */
export type TalentError = 'unknown' | 'max' | 'points' | 'locked' | 'empty' | 'holds';

/** Le nœud de cet arbre, ou undefined. */
export function talentNode(cls: ClassDef, id: string): TalentNodeRaw | undefined {
  return cls.tree.nodes.find((n) => n.id === id);
}

/** Le rang d'un nœud chez ce héros : borné au rang maximum ; un nœud inconnu vaut 0. */
export function talentRank(cls: ClassDef, hero: HeroSave, id: string): number {
  const node = talentNode(cls, id);
  if (!node) return 0;
  return Math.max(0, Math.min(node.ranks, Math.floor(hero.talents[id] ?? 0)));
}

/** Points de talent gagnés à ce niveau. */
export function talentPointsEarned(level: number, tuning: HeroTuning): number {
  return Math.max(0, level - 1) * tuning.pointsPerLevel.talent;
}

/** Points placés, sur les seuls nœuds que l'arbre connaît. */
export function talentPointsSpent(cls: ClassDef, hero: HeroSave): number {
  return cls.tree.nodes.reduce((sum, n) => sum + talentRank(cls, hero, n.id), 0);
}

/** Points encore à placer (négatif si le héros en a placé plus qu'il n'en a gagné). */
export function talentPointsLeft(cls: ClassDef, hero: HeroSave, tuning: HeroTuning): number {
  return talentPointsEarned(hero.level, tuning) - talentPointsSpent(cls, hero);
}

/** Points placés dans une branche, sur les étages sous `belowTier` (tous si absent). */
export function branchPoints(cls: ClassDef, hero: HeroSave, branch: string, belowTier = 5): number {
  return cls.tree.nodes
    .filter((n) => n.branch === branch && n.tier < belowTier)
    .reduce((sum, n) => sum + talentRank(cls, hero, n.id), 0);
}

/** Points demandés dans la branche pour ouvrir cet étage. */
export function tierThreshold(tier: number, tuning: HeroTuning): number {
  return tuning.talentTiers[tier - 1] ?? 0;
}

/** Vrai si l'étage de ce nœud est ouvert. */
export function tierOpen(cls: ClassDef, hero: HeroSave, node: TalentNodeRaw, tuning: HeroTuning): boolean {
  return branchPoints(cls, hero, node.branch, node.tier) >= tierThreshold(node.tier, tuning);
}

/** Peut-on placer un point dans ce nœud ? null si oui. */
export function canAddTalent(cls: ClassDef, hero: HeroSave, tuning: HeroTuning, id: string): TalentError | null {
  const node = talentNode(cls, id);
  if (!node) return 'unknown';
  if (talentRank(cls, hero, id) >= node.ranks) return 'max';
  if (talentPointsLeft(cls, hero, tuning) <= 0) return 'points';
  if (!tierOpen(cls, hero, node, tuning)) return 'locked';
  return null;
}

/** Place un point. Renvoie vrai s'il est placé. */
export function addTalent(cls: ClassDef, hero: HeroSave, tuning: HeroTuning, id: string): boolean {
  if (canAddTalent(cls, hero, tuning, id) !== null) return false;
  hero.talents[id] = talentRank(cls, hero, id) + 1;
  return true;
}

/**
 * Peut-on retirer un point de ce nœud ? null si oui. Refusé s'il fermerait un étage plus haut de la même branche
 * où il reste des points.
 */
export function canRemoveTalent(cls: ClassDef, hero: HeroSave, tuning: HeroTuning, id: string): TalentError | null {
  const node = talentNode(cls, id);
  if (!node) return 'unknown';
  if (talentRank(cls, hero, id) <= 0) return 'empty';
  for (const other of cls.tree.nodes) {
    if (other.branch !== node.branch || other.tier <= node.tier || talentRank(cls, hero, other.id) <= 0) continue;
    if (branchPoints(cls, hero, node.branch, other.tier) - 1 < tierThreshold(other.tier, tuning)) return 'holds';
  }
  return null;
}

/** Retire un point. Renvoie vrai s'il est retiré. */
export function removeTalent(cls: ClassDef, hero: HeroSave, tuning: HeroTuning, id: string): boolean {
  if (canRemoveTalent(cls, hero, tuning, id) !== null) return false;
  const rank = talentRank(cls, hero, id) - 1;
  if (rank <= 0) delete hero.talents[id];
  else hero.talents[id] = rank;
  return true;
}

/** Reprend tous les points, gratuitement. Renvoie le nombre de points rendus. */
export function resetTalents(cls: ClassDef, hero: HeroSave): number {
  const spent = talentPointsSpent(cls, hero);
  hero.talents = {};
  return spent;
}

/** Ce que les talents de ce héros donnent : des sources pour la fiche, et des modificateurs pour la partie. */
export function resolveTalents(cls: ClassDef, hero: HeroSave): { sources: StatSource[]; mods: RunModsRaw } {
  const sources: StatSource[] = [];
  let mods: RunMods = { ...NEUTRAL_MODS };
  for (const node of cls.tree.nodes) {
    const rank = talentRank(cls, hero, node.id);
    if (rank <= 0) continue;
    if (node.perRank) {
      sources.push({ label: node.id, bonus: node.perRank, times: rank });
    } else if (node.levels) {
      const level = node.levels[rank - 1]!;
      if (Object.keys(level.stats).length > 0) sources.push({ label: node.id, bonus: level.stats, times: 1 });
      mods = stackMods(mods, level.mods);
    }
  }
  // Seuls les champs qui changent : ce qui reste neutre ne doit rien écraser.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mods)) {
    if (value !== (NEUTRAL_MODS as Record<string, unknown>)[key]) out[key] = value;
  }
  return { sources, mods: out as RunModsRaw };
}
