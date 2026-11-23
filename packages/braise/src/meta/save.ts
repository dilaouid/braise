import type { Attributes } from '../core/stats.ts';

/** Version courante du format de sauvegarde. */
export const SAVE_VERSION = 1;

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

export interface HeroSave {
  level: number;
  xp: number;
  shardLevel: number;
  freeAttributes: Attributes;
  talents: Record<string, number>;
  bestDepth: number;
}

export interface SaveV1 {
  version: 1;
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
  };
  heroes: Record<string, HeroSave>;
  activeHero: string | null;
  settings: Settings;
  /** Une expédition interrompue (jalon M2). */
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
  return { level: 1, xp: 0, shardLevel: 0, freeAttributes: { str: 0, agi: 0, spi: 0, vig: 0, luck: 0 }, talents: {}, bestDepth: 0 };
}

/** Une sauvegarde neuve. `now` est fourni par l'appelant : `meta` ne lit pas l'horloge. */
export function newSave(now: number): SaveV1 {
  return {
    version: 1,
    createdAt: now, updatedAt: now, playSeconds: 0,
    account: {
      gold: 0, ashes: 0, shards: 0,
      materials: { filings: 0, essence: 0, hearts: 0 },
      altar: {}, altarDisabled: [], camp: {}, npcs: [], unlocks: [],
      codex: { kills: {}, seen: [], steles: [] },
      regions: {}, abyss: { bestDepth: 0 }, stats: {},
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

/**
 * Vérifie une sauvegarde lue et complète ses champs manquants.
 * Lève une erreur si ce n'est pas une sauvegarde.
 */
export function validateSave(raw: unknown): SaveV1 {
  if (!raw || typeof raw !== 'object') throw new Error('Sauvegarde illisible');
  const r = raw as Partial<SaveV1> & { account?: Partial<SaveV1['account']> };
  if (r.version !== 1 || !r.account || typeof r.account !== 'object') throw new Error('Sauvegarde illisible');
  const base = newSave(num(r.createdAt, 0));
  const a = r.account;
  const save: SaveV1 = {
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
    },
    heroes: {},
    activeHero: typeof r.activeHero === 'string' ? r.activeHero : null,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    run: null,
  };
  for (const [id, h] of Object.entries(r.heroes ?? {})) {
    const hero = newHero();
    save.heroes[id] = {
      ...hero,
      ...h,
      level: Math.max(1, Math.floor(num(h?.level, 1))),
      xp: Math.max(0, num(h?.xp, 0)),
      freeAttributes: { ...hero.freeAttributes, ...(h?.freeAttributes ?? {}) },
      talents: { ...(h?.talents ?? {}) },
    };
  }
  return save;
}

/** Les migrations : `MIGRATIONS[n]` amène une sauvegarde de la version n à la version n + 1. */
export const MIGRATIONS: Record<number, (old: any) => any> = {};

/** Plafond des monnaies : un entier sûr (document 05 §9). */
export const CURRENCY_CAP = 9e15;
