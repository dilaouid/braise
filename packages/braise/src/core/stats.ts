import type { Attribute, ExpeditionTuning, HeroTuning, StatBonus } from '../content/index.ts';

/** Les attributs d'un héros. */
export interface Attributes {
  str: number;
  agi: number;
  spi: number;
  vig: number;
  luck: number;
}

/**
 * La feuille de statistiques : des sommes brutes. Tous les bonus d'une même statistique
 * s'additionnent, quelle que soit leur source (document 03 §6).
 */
export interface StatSheet {
  attrs: Attributes;
  maxHp: number;
  maxHpShare: number;
  regen: number;
  armor: number;
  speedShare: number;
  power: number;
  cadence: number;
  zone: number;
  duration: number;
  projectiles: number;
  projectileSpeed: number;
  critChance: number;
  critMult: number;
  glowShare: number;
  luck: number;
  wisdom: number;
  greed: number;
  knockback: number;
  eliteDamage: number;
  rerolls: number;
  banishes: number;
  revives: number;
  flasks: number;
  cards: number;
}

/** Les statistiques résolues, celles que la partie lit. */
export interface HeroStats {
  attrs: Attributes;
  maxHp: number;
  regen: number;
  armor: number;
  speed: number;
  power: number;
  cadence: number;
  zone: number;
  duration: number;
  projectiles: number;
  projectileSpeed: number;
  critChance: number;
  critMult: number;
  glow: number;
  luck: number;
  wisdom: number;
  greed: number;
  knockback: number;
  eliteDamage: number;
  rerolls: number;
  banishes: number;
  revives: number;
  flasks: number;
  cards: number;
}

/** Une feuille vide, avec les valeurs de base du jeu. */
export function emptySheet(attrs: Attributes, tuning: ExpeditionTuning): StatSheet {
  return {
    attrs: { ...attrs },
    maxHp: 0, maxHpShare: 0, regen: 0, armor: 0, speedShare: 0,
    power: 0, cadence: 0, zone: 0, duration: 0, projectiles: 0, projectileSpeed: 0,
    critChance: tuning.hero.critChance, critMult: tuning.hero.critMult,
    glowShare: 0, luck: 0, wisdom: 0, greed: 0, knockback: 0, eliteDamage: 0,
    rerolls: 0, banishes: 0, revives: 0, flasks: tuning.flask.charges, cards: tuning.cardsPerLevel,
  };
}

/** Ajoute `times` fois un bonus à une feuille. */
export function addBonus(sheet: StatSheet, bonus: StatBonus, times = 1): void {
  for (const key of Object.keys(bonus) as Array<keyof StatBonus>) {
    const value = bonus[key];
    if (value === undefined) continue;
    (sheet as unknown as Record<string, number>)[key] = ((sheet as unknown as Record<string, number>)[key] ?? 0) + value * times;
  }
}

/** Copie une feuille. */
export function cloneSheet(sheet: StatSheet): StatSheet {
  return { ...sheet, attrs: { ...sheet.attrs } };
}

/** Résout une feuille en statistiques : applique les attributs et les plafonds. */
export function resolveStats(sheet: StatSheet, tuning: ExpeditionTuning, heroTuning: HeroTuning, out?: HeroStats): HeroStats {
  const a = sheet.attrs;
  const at = heroTuning.attributes;
  const baseHp = heroTuning.baseHp + at.vig.hp * a.vig + sheet.maxHp;
  const agiSpeed = Math.min(at.agi.speedCap, at.agi.speed * a.agi);
  const speedShare = Math.min(tuning.hero.speedCap, agiSpeed + sheet.speedShare);
  const s = out ?? ({} as HeroStats);
  s.attrs = a;
  s.maxHp = Math.max(1, Math.round(baseHp * (1 + sheet.maxHpShare)));
  s.regen = at.vig.regen * a.vig + sheet.regen;
  s.armor = at.vig.armor * a.vig + sheet.armor;
  s.speed = tuning.hero.speed * (1 + speedShare);
  s.power = sheet.power;
  s.cadence = sheet.cadence;
  s.zone = sheet.zone + at.spi.zone * a.spi;
  s.duration = sheet.duration + at.spi.duration * a.spi;
  s.projectiles = Math.floor(sheet.projectiles);
  s.projectileSpeed = sheet.projectileSpeed;
  s.critChance = Math.min(tuning.hero.critCap, sheet.critChance + at.agi.critChance * a.agi + at.luck.critChance * a.luck);
  s.critMult = sheet.critMult;
  s.glow = tuning.hero.glow * (1 + sheet.glowShare);
  s.luck = sheet.luck + at.luck.luck * a.luck;
  s.wisdom = sheet.wisdom;
  s.greed = sheet.greed;
  s.knockback = sheet.knockback + at.str.knockback * a.str;
  s.eliteDamage = sheet.eliteDamage;
  s.rerolls = Math.floor(sheet.rerolls);
  s.banishes = Math.floor(sheet.banishes);
  s.revives = Math.floor(sheet.revives);
  s.flasks = Math.floor(sheet.flasks);
  s.cards = Math.floor(sheet.cards);
  return s;
}

/** La valeur d'un attribut. */
export function attr(attrs: Attributes, name: Attribute): number {
  return attrs[name];
}

/** Dégâts subis par le héros après réduction d'armure (document 02 §11). */
export function damageTaken(raw: number, armor: number, armorCap: number): number {
  const reduction = Math.min(armorCap, armor / (armor + 100));
  return Math.max(1, Math.round(raw * (1 - reduction)));
}

/** Rechargement effectif : plancher à 25 % de la base. */
export function effectiveCooldown(base: number, cadence: number): number {
  return Math.max(base * 0.25, base / (1 + cadence));
}

/** Expérience de partie demandée pour passer du niveau L au niveau L + 1. */
export function runXpForNext(level: number, xp: ExpeditionTuning['xp']): number {
  const l = level - 1;
  return Math.round(xp.base + xp.linear * l + xp.quadratic * l * l);
}

/** Multiplicateur des points de vie des ennemis (m : minute, v : Veillée − 1, a : Profondeur). */
export function enemyHpScale(scale: ExpeditionTuning['scale'], m: number, v: number, a: number): number {
  return (1 + scale.hpLin * m + scale.hpQuad * m * m) * Math.pow(scale.hpVigil, v) * Math.pow(scale.hpAbyss, a);
}

/** Multiplicateur des dégâts des ennemis. */
export function enemyDamageScale(scale: ExpeditionTuning['scale'], m: number, v: number, a: number): number {
  return (1 + scale.dmgLin * m) * Math.pow(scale.dmgVigil, v) * Math.pow(scale.dmgAbyss, a);
}

/** Budget de menace reçu par seconde. */
export function threatPerSecond(threat: ExpeditionTuning['threat'], m: number, v: number, a: number): number {
  return (threat.base + threat.perMinute * m) * (1 + threat.perVigil * v) * (1 + threat.perAbyss * a);
}
