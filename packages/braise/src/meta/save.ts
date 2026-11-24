import type { Attributes } from '../core/stats.ts';

/** Version courante du format de sauvegarde. */
export const SAVE_VERSION = 2;

/** Les réglages, propres à chaque sauvegarde (donc à chaque profil OwlLeaf). */
export interface Settings {
  autoSkills: boolean;
  damageNumbers: boolean;
  /** Tremblement d'écran et flashs, de 0 à 1. */
  screenShake: number;
  flashes: number;
  volumeMaster: number;
  volumeMusic: number;
  volumeSfx: number;
  swapAB: boolean;
  deadzoneLeft: number;
  deadzoneRight: number;
  showFps: boolean;
}

/** Des rangs de talents : identifiant de nœud → rang, à partir de 1. Un nœud sans point n'y figure pas. */
export type TalentRanks = Record<string, number>;

/**
 * Un objet d'équipement. Sa forme complète (rareté, niveau d'objet, trempe, affixes, pouvoir)
 * arrive avec le butin, au jalon M3 ; d'ici là, aucun héros n'en porte.
 */
export interface ItemSave {
  /** Identifiant de l'objet de base, dans `content/`. */
  base: string;
  [field: string]: unknown;
}

export interface HeroSave {
  level: number;
  xp: number;
  shardLevel: number;
  freeAttributes: Attributes;
  /** Les talents en place : ceux que la prochaine expédition utilisera. */
  talents: TalentRanks;
  /** Les dispositions de talents enregistrées (document 03 §7.2 : deux, à partir du niveau 30). */
  loadouts: TalentRanks[];
  /** Emplacement → objet porté. Un emplacement vide vaut `null` ou n'y figure pas. */
  equipment: Record<string, ItemSave | null>;
  bestDepth: number;
}

/**
 * Une expédition interrompue, à reprendre au prochain lancement (document 08 §7.2).
 * L'en-tête sert à proposer « Reprendre » sans relire l'état ; l'état lui-même appartient à la simulation.
 */
export interface RunSnapshot {
  /**
   * Version du format de `state`, tenue par la simulation. Un instantané d'un autre format ne se
   * migre pas : la partie est abandonnée.
   */
  format: number;
  /** Date de l'instantané, fournie par l'appelant. */
  savedAt: number;
  classId: string;
  regionId: string;
  vigil: number;
  seed: number;
  /** Temps de partie écoulé, en secondes. */
  seconds: number;
  /** Niveau de partie atteint. */
  runLevel: number;
  /** L'état entier de la simulation et ses générateurs, sérialisés par `core`. */
  state: unknown;
}

/** Le nombre de faces de la Lanterne. */
export const LANTERN_FACES = 4;

/** La Lanterne du compte : ce qu'on possède, ce qu'on a posé, ce qui est ouvert. */
export interface LanternSave {
  /** Les pièces possédées. */
  owned: string[];
  /** Les pièces et les faces (« face.2 ») déjà vues dans son écran. */
  seen: string[];
  /** La pièce posée sur chaque face, ou `null`. */
  faces: Array<string | null>;
  /** Le nombre de faces ouvertes, de 1 à 4. */
  opened: number;
  /** Les victoires avec au moins une pièce posée. */
  wins: number;
}

export interface SaveV2 {
  version: 2;
  createdAt: number;
  updatedAt: number;
  playSeconds: number;
  account: {
    gold: number;
    ashes: number;
    shards: number;
    materials: { filings: number; essence: number; hearts: number };
    /** Identifiant de boost → rang. */
    altar: Record<string, number>;
    altarDisabled: string[];
    camp: Record<string, number>;
    npcs: string[];
    unlocks: string[];
    codex: { kills: Record<string, number>; seen: string[]; steles: string[] };
    regions: Record<string, { lit: boolean; bestVigil: number; bossKills: number }>;
    abyss: { bestDepth: number };
    stats: Record<string, number>;
    lantern: LanternSave;
  };
  heroes: Record<string, HeroSave>;
  activeHero: string | null;
  settings: Settings;
  /** Une expédition interrompue, ou `null`. */
  run: RunSnapshot | null;
}

/** La sauvegarde, dans la version courante du format. */
export type Save = SaveV2;

/**
 * Le héros du format v1 (jalon M1). Figé : il ne sert plus qu'à la migration.
 */
export interface HeroSaveV1 {
  level: number;
  xp: number;
  shardLevel: number;
  freeAttributes: Attributes;
  talents: Record<string, number>;
  bestDepth: number;
}

/**
 * Le format v1 (jalon M1). Figé : il ne sert plus qu'à la migration.
 */
export interface SaveV1 {
  version: 1;
  createdAt: number;
  updatedAt: number;
  playSeconds: number;
  account: SaveV2['account'];
  heroes: Record<string, HeroSaveV1>;
  activeHero: string | null;
  settings: Settings;
  run: null;
}

export function defaultSettings(): Settings {
  return {
    autoSkills: false, damageNumbers: true, screenShake: 1, flashes: 1,
    volumeMaster: 0.8, volumeMusic: 0.6, volumeSfx: 0.8,
    swapAB: false, deadzoneLeft: 0.25, deadzoneRight: 0.35, showFps: false,
  };
}

export function newHero(): HeroSave {
  return {
    level: 1, xp: 0, shardLevel: 0, freeAttributes: { str: 0, agi: 0, spi: 0, vig: 0, luck: 0 },
    talents: {}, loadouts: [], equipment: {}, bestDepth: 0,
  };
}

/** Une Lanterne neuve : une face ouverte, aucune pièce. */
export function newLantern(): LanternSave {
  return { owned: [], seen: [], faces: new Array<string | null>(LANTERN_FACES).fill(null), opened: 1, wins: 0 };
}

/** Une sauvegarde neuve. `now` est fourni par l'appelant : `meta` ne lit pas l'horloge. */
export function newSave(now: number): Save {
  return {
    version: 2,
    createdAt: now, updatedAt: now, playSeconds: 0,
    account: {
      gold: 0, ashes: 0, shards: 0,
      materials: { filings: 0, essence: 0, hearts: 0 },
      altar: {}, altarDisabled: [], camp: {}, npcs: [], unlocks: [],
      codex: { kills: {}, seen: [], steles: [] },
      regions: {}, abyss: { bestDepth: 0 }, stats: {}, lantern: newLantern(),
    },
    heroes: {},
    activeHero: null,
    settings: defaultSettings(),
    run: null,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Des rangs de talents lus : seuls les rangs entiers d'au moins 1 sont gardés. */
function cleanRanks(raw: unknown): TalentRanks {
  const out: TalentRanks = {};
  if (!isRecord(raw)) return out;
  for (const [id, rank] of Object.entries(raw)) {
    const r = Math.floor(num(rank, 0));
    if (r >= 1) out[id] = r;
  }
  return out;
}

/** L'équipement lu : un emplacement tient un objet ou rien. */
function cleanEquipment(raw: unknown): Record<string, ItemSave | null> {
  const out: Record<string, ItemSave | null> = {};
  if (!isRecord(raw)) return out;
  for (const [slot, item] of Object.entries(raw)) {
    if (item === null) out[slot] = null;
    else if (isRecord(item) && typeof item.base === 'string') out[slot] = { ...item } as ItemSave;
  }
  return out;
}

/** Les chaînes d'une liste lue, sans doublon. */
function cleanStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string'))] : [];
}

/** La Lanterne lue. Une face ne garde qu'une pièce possédée, posée une seule fois, sur une face ouverte. */
function cleanLantern(raw: unknown): LanternSave {
  const out = newLantern();
  if (!isRecord(raw)) return out;
  out.owned = cleanStrings(raw.owned);
  out.seen = cleanStrings(raw.seen);
  out.opened = Math.min(LANTERN_FACES, Math.max(1, Math.floor(num(raw.opened, 1))));
  out.wins = Math.max(0, Math.floor(num(raw.wins, 0)));
  const faces: unknown[] = Array.isArray(raw.faces) ? raw.faces : [];
  for (let i = 0; i < out.opened; i++) {
    const id = faces[i];
    if (typeof id === 'string' && out.owned.includes(id) && !out.faces.includes(id)) out.faces[i] = id;
  }
  return out;
}

/** L'instantané lu : entier, ou rien. Une partie abîmée ne se reprend pas à moitié. */
function cleanRun(raw: unknown): RunSnapshot | null {
  if (!isRecord(raw)) return null;
  const numbers = [raw.format, raw.savedAt, raw.vigil, raw.seed, raw.seconds, raw.runLevel];
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (typeof raw.classId !== 'string' || typeof raw.regionId !== 'string') return null;
  if (raw.state === undefined || raw.state === null) return null;
  return {
    format: raw.format as number, savedAt: raw.savedAt as number,
    classId: raw.classId, regionId: raw.regionId, vigil: raw.vigil as number, seed: raw.seed as number,
    seconds: raw.seconds as number, runLevel: raw.runLevel as number, state: raw.state,
  };
}

/**
 * Vérifie une sauvegarde lue, dans la version courante, et complète ses champs manquants.
 * Lève une erreur si ce n'est pas une sauvegarde. Une version plus ancienne passe d'abord
 * par `MIGRATIONS`.
 */
export function validateSave(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') throw new Error('Sauvegarde illisible');
  const r = raw as Partial<Save> & { account?: Partial<Save['account']> };
  if (r.version !== SAVE_VERSION || !r.account || typeof r.account !== 'object') throw new Error('Sauvegarde illisible');
  const base = newSave(num(r.createdAt, 0));
  const a = r.account;
  const save: Save = {
    ...base,
    updatedAt: num(r.updatedAt, 0),
    playSeconds: num(r.playSeconds, 0),
    account: {
      ...base.account,
      ...a,
      gold: Math.max(0, Math.floor(num(a.gold, 0))),
      ashes: Math.max(0, Math.floor(num(a.ashes, 0))),
      shards: Math.max(0, Math.floor(num(a.shards, 0))),
      materials: { ...base.account.materials, ...(a.materials ?? {}) },
      altar: { ...(a.altar ?? {}) },
      altarDisabled: Array.isArray(a.altarDisabled) ? a.altarDisabled.slice() : [],
      unlocks: Array.isArray(a.unlocks) ? a.unlocks.slice() : [],
      codex: { ...base.account.codex, ...(a.codex ?? {}) },
      regions: { ...(a.regions ?? {}) },
      abyss: { ...base.account.abyss, ...(a.abyss ?? {}) },
      stats: { ...(a.stats ?? {}) },
      lantern: cleanLantern(a.lantern),
    },
    heroes: {},
    activeHero: typeof r.activeHero === 'string' ? r.activeHero : null,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    run: cleanRun(r.run),
  };
  for (const [id, h] of Object.entries(r.heroes ?? {})) {
    const hero = newHero();
    save.heroes[id] = {
      ...hero,
      ...h,
      level: Math.max(1, Math.floor(num(h?.level, 1))),
      xp: Math.max(0, num(h?.xp, 0)),
      freeAttributes: { ...hero.freeAttributes, ...(h?.freeAttributes ?? {}) },
      talents: cleanRanks(h?.talents),
      loadouts: Array.isArray(h?.loadouts) ? h.loadouts.filter(isRecord).map(cleanRanks) : [],
      equipment: cleanEquipment(h?.equipment),
    };
  }
  return save;
}

/**
 * v1 (jalon M1) → v2 (jalon M2). Fonction pure : l'entrée n'est pas modifiée, et la sortie ne
 * partage rien avec elle.
 *
 * Ce qui change : chaque héros reçoit ses dispositions de talents et son équipement, vides, et
 * la sauvegarde peut porter une expédition interrompue. Rien d'autre ne bouge : les points
 * libres que M1 répartissait d'office restent placés, le compte et les réglages sont recopiés.
 */
export function migrateV1toV2(old: SaveV1): SaveV2 {
  const copy = JSON.parse(JSON.stringify(old)) as SaveV1;
  const heroes: Record<string, HeroSave> = {};
  for (const [id, hero] of Object.entries(copy.heroes ?? {})) {
    heroes[id] = { ...hero, talents: hero?.talents ?? {}, loadouts: [], equipment: {} };
  }
  return { ...copy, version: 2, heroes, run: null };
}

/** Les migrations : `MIGRATIONS[n]` amène une sauvegarde de la version n à la version n + 1. */
export const MIGRATIONS: Record<number, (old: any) => any> = {
  1: migrateV1toV2,
};

/** Plafond des monnaies : un entier sûr (document 05 §9). */
export const CURRENCY_CAP = 9e15;
