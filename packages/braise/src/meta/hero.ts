import type { Attribute, ClassDef, GameData, HeroTuning, StatBonus } from '../content/index.ts';
import { addBonus, emptySheet, type Attributes, type StatSheet } from '../core/stats.ts';
import { CURRENCY_CAP, newHero, type HeroSave, type Save } from './save.ts';
import type { RunResult } from '../core/rewards.ts';

/** Expérience de héros demandée pour passer du niveau N au niveau N + 1. */
export function heroXpForNext(level: number, tuning: HeroTuning): number {
  const c = tuning.xpCurve;
  return c.base + c.linear * level + c.quadratic * level * level;
}

/** Ajoute de l'expérience à un héros. Renvoie le nombre de niveaux gagnés. */
export function addHeroXp(hero: HeroSave, xp: number, tuning: HeroTuning): number {
  let gained = 0;
  hero.xp += xp;
  while (hero.level < tuning.maxLevel && hero.xp >= heroXpForNext(hero.level, tuning)) {
    hero.xp -= heroXpForNext(hero.level, tuning);
    hero.level++;
    gained++;
  }
  return gained;
}

/** Points d'attribut libres gagnés par un héros de ce niveau. */
export function freePointsEarned(level: number, tuning: HeroTuning): number {
  return (level - 1) * tuning.pointsPerLevel.free;
}

/** Points libres pas encore placés. */
export function freePointsLeft(hero: HeroSave, tuning: HeroTuning): number {
  const f = hero.freeAttributes;
  return freePointsEarned(hero.level, tuning) - (f.str + f.agi + f.spi + f.vig + f.luck);
}

/** « Répartir pour moi » : place les points libres selon le profil de la classe. */
export function autoAssignFreePoints(hero: HeroSave, cls: ClassDef, tuning: HeroTuning): void {
  const f = hero.freeAttributes;
  let placed = f.str + f.agi + f.spi + f.vig + f.luck;
  let left = freePointsLeft(hero, tuning);
  while (left > 0) {
    const a = cls.freeProfile[placed % cls.freeProfile.length] as Attribute;
    f[a]++;
    placed++;
    left--;
  }
}

/** Les attributs d'un héros : départ de la classe, croissance automatique, points libres. */
export function heroAttributes(cls: ClassDef, hero: HeroSave): Attributes {
  const a: Attributes = { ...cls.attributes };
  for (let level = 2; level <= hero.level; level++) {
    a[cls.growth.every]++;
    a[level % 2 === 0 ? cls.growth.even : cls.growth.odd]++;
  }
  const f = hero.freeAttributes;
  a.str += f.str; a.agi += f.agi; a.spi += f.spi; a.vig += f.vig; a.luck += f.luck;
  return a;
}

/** Une source de statistiques, pour la fiche détaillée. */
export interface StatSource {
  label: string;
  bonus: StatBonus;
  times: number;
}

/** Construit la feuille de statistiques d'un héros avant une partie, et la liste de ses sources. */
export function buildSheet(data: GameData, save: Save, classId: string): { sheet: StatSheet; sources: StatSource[] } {
  const cls = data.classes[classId];
  if (!cls) throw new Error(`Classe inconnue : ${classId}`);
  const hero = save.heroes[classId] ?? newHero();
  const sheet = emptySheet(heroAttributes(cls, hero), data.tuning);
  const sources: StatSource[] = [];
  for (const boost of data.altar) {
    const rank = save.account.altar[boost.id] ?? 0;
    // Un boost désactivé n'a aucun effet.
    if (rank <= 0 || save.account.altarDisabled.includes(boost.id)) continue;
    addBonus(sheet, boost.perRank, rank);
    sources.push({ label: boost.id, bonus: boost.perRank, times: rank });
  }
  return { sheet, sources };
}

/** Les armes et les reliques proposables dans les cartes de niveau. */
export function unlockedContent(data: GameData, save: Save): { weapons: string[]; relics: string[] } {
  const extra = new Set(save.account.unlocks);
  return {
    weapons: data.weapons.filter((w) => !w.evolved && (w.starting || extra.has(w.id))).map((w) => w.id),
    relics: data.relics.filter((r) => r.starting || extra.has(r.id)).map((r) => r.id),
  };
}

/** Ce qu'une expédition terminée a changé dans la sauvegarde. */
export interface RunSummary {
  levelsGained: number;
  heroLevel: number;
  firstBossKill: boolean;
}

/** Verse le résultat d'une expédition dans la sauvegarde : monnaies, expérience, codex, régions. */
export function applyRunResult(save: Save, data: GameData, result: RunResult): RunSummary {
  const acc = save.account;
  acc.gold = Math.min(CURRENCY_CAP, acc.gold + result.goldKept);
  acc.ashes = Math.min(CURRENCY_CAP, acc.ashes + result.ashesKept);
  const cls = data.classes[result.classId];
  const hero = (save.heroes[result.classId] ??= newHero());
  const levelsGained = addHeroXp(hero, result.heroXp, data.heroTuning);
  // Dans cette tranche, les points libres sont répartis d'office (l'instructeur arrive au jalon M2).
  if (cls) autoAssignFreePoints(hero, cls, data.heroTuning);
  for (const [id, n] of Object.entries(result.killsByEnemy)) acc.codex.kills[id] = (acc.codex.kills[id] ?? 0) + n;
  const region = (acc.regions[result.regionId] ??= { lit: false, bestVigil: 0, bossKills: 0 });
  let firstBossKill = false;
  if (result.outcome === 'victory') {
    firstBossKill = !region.lit;
    region.lit = true;
    region.bossKills += 1;
    region.bestVigil = Math.max(region.bestVigil, result.vigil);
  }
  const s = acc.stats;
  s.runs = (s.runs ?? 0) + 1;
  s.victories = (s.victories ?? 0) + (result.outcome === 'victory' ? 1 : 0);
  s.kills = (s.kills ?? 0) + result.kills;
  s.bestSeconds = Math.max(s.bestSeconds ?? 0, Math.floor(result.seconds));
  s.bestRunLevel = Math.max(s.bestRunLevel ?? 0, result.runLevel);
  save.playSeconds += result.seconds;
  return { levelsGained, heroLevel: hero.level, firstBossKill };
}
