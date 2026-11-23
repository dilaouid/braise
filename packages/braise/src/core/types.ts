import type { Rng } from '@owl/kit/rng';
import type { ClassDef, GameData, RegionDef } from '../content/index.ts';
import type { HeroStats, StatSheet } from './stats.ts';

/** Pas de simulation, en secondes. */
export const STEP = 1 / 60;

/** Capacités des réserves (document 08 §4.3). */
export const CAP_ENEMIES = 700;
export const CAP_SHOTS = 600;
export const CAP_ENEMY_SHOTS = 200;
export const CAP_ZONES = 200;
export const CAP_PICKUPS = 600;
export const CAP_TELEGRAPHS = 64;
export const CAP_EVENTS = 512;
/** Nombre d'emplacements d'armes pris en compte par ennemi (minuteries de contact). */
export const MAX_WEAPON_SLOTS = 6;

/** États d'un ennemi, en bits. */
export const ST_BURN = 1;
export const ST_SHOCK = 2;
export const ST_SLOW = 4;
export const ST_FROZEN = 8;
export const ST_BLEED = 16;

/** Drapeaux d'un coup. */
export const HIT_CRIT = 1;
export const HIT_WEAK = 2;
export const HIT_RESIST = 4;
export const HIT_BURN = 8;
export const HIT_BLEED = 16;
export const HIT_NO_NUMBER = 32;

/** Comportements d'ennemis, en indices. */
export const BH = { chase: 0, zigzag: 1, shooter: 2, swarm: 3, charger: 4, spawner: 5, 'boss-stag': 6 } as const;

/** Sortes de ramassables. */
export const PK_GEM = 0;
export const PK_GOLD = 1;
export const PK_ASH = 2;
export const PK_DROP = 3;
export const PK_CHEST = 4;
export const PK_CALL = 5;
export const PK_RED_GEM = 6;

/** Sortes de projectiles du joueur. */
export const SHOT_STRAIGHT = 0;
export const SHOT_HOMING = 1;
export const SHOT_LOB = 2;

/** Sortes de zones au sol. */
export const ZONE_PUDDLE = 0;
export const ZONE_BURST = 1;

/** Formes d'annonce d'attaque. */
export const TG_LINE = 0;
export const TG_CIRCLE = 1;

/** Événements émis pour le rendu et le son. `core` ne joue aucun son lui-même. */
export const EV = {
  hit: 1, kill: 2, damageNumber: 3, heroHurt: 4, heroDash: 5, heroHeal: 6, heroDeath: 7, heroRevive: 8,
  pickup: 9, levelUp: 10, arc: 11, nova: 12, shot: 13, lobLand: 14, enemyShot: 15, waveWarning: 16,
  eliteSpawn: 17, bossSpawn: 18, bossPhase: 19, bossDeath: 20, skill: 21, ultimate: 22, flask: 23,
  chestDrop: 24, evolution: 25, telegraph: 26, telegraphHit: 27, poiDone: 28, poiStart: 29, fissure: 30,
  eliteDeath: 31, flameCall: 32, burst: 33, charge: 34, ultTick: 35,
} as const;

export interface EnemyStore {
  count: number;
  nextUid: number;
  x: Float32Array; y: Float32Array;
  px: Float32Array; py: Float32Array;
  vx: Float32Array; vy: Float32Array;
  hp: Float32Array; maxHp: Float32Array;
  kind: Uint16Array;
  uid: Uint32Array; parent: Uint32Array;
  state: Uint8Array; timer: Float32Array; timer2: Float32Array; counter: Uint8Array;
  dirX: Float32Array; dirY: Float32Array;
  flowT: Float32Array;
  status: Uint8Array;
  burnT: Float32Array; burnDmg: Float32Array; burnTick: Float32Array;
  shockT: Float32Array;
  slowT: Float32Array; frozenT: Float32Array; freezeStacks: Uint8Array; freezeWindow: Float32Array;
  bleedT: Float32Array; bleedDmg: Float32Array; bleedTick: Float32Array; bleedStacks: Uint8Array;
  /** Minuterie de contact par emplacement d'arme (orbites, auras). */
  hitCd: Float32Array;
  dmgAcc: Float32Array; dmgAccT: Float32Array; dmgFlags: Uint8Array;
  /** Temps de flash blanc restant (lu par le rendu). */
  flash: Float32Array;
  facing: Int8Array;
}

export interface ShotStore {
  count: number;
  x: Float32Array; y: Float32Array;
  px: Float32Array; py: Float32Array;
  vx: Float32Array; vy: Float32Array;
  /** Distance restante (tirs droits) ou temps de vol restant (lobés). */
  life: Float32Array;
  radius: Float32Array;
  pierce: Int16Array;
  kind: Uint8Array;
  slot: Uint8Array;
  sprite: Uint8Array;
  tx: Float32Array; ty: Float32Array; t: Float32Array;
  hits: Uint32Array;
  hitN: Uint8Array;
  /** Dégâts de base et drapeaux de coup, fixés au tir. */
  dmg: Float32Array;
  flags: Uint8Array;
}

export interface EnemyShotStore {
  count: number;
  x: Float32Array; y: Float32Array;
  px: Float32Array; py: Float32Array;
  vx: Float32Array; vy: Float32Array;
  life: Float32Array; damage: Float32Array; radius: Float32Array;
  /** Sorte de l'ennemi qui a tiré. */
  kind: Uint16Array;
}

export interface ZoneStore {
  count: number;
  x: Float32Array; y: Float32Array;
  radius: Float32Array; life: Float32Array; maxLife: Float32Array;
  tick: Float32Array; interval: Float32Array; damage: Float32Array; grow: Float32Array;
  slot: Uint8Array; kind: Uint8Array; flags: Uint8Array;
}

export interface TelegraphStore {
  count: number;
  shape: Uint8Array;
  x: Float32Array; y: Float32Array;
  angle: Float32Array; length: Float32Array; width: Float32Array;
  t: Float32Array; duration: Float32Array; damage: Float32Array;
  owner: Uint32Array;
  kind: Uint16Array;
}

export interface PickupStore {
  count: number;
  x: Float32Array; y: Float32Array;
  px: Float32Array; py: Float32Array;
  kind: Uint8Array; value: Float32Array;
  attracted: Uint8Array; speed: Float32Array; age: Float32Array;
}

/** Un point d'intérêt de la carte. */
export interface Poi {
  kind: 'brazier' | 'spring' | 'cache' | 'portal' | 'totem' | 'smith' | 'herbalist' | 'treasure';
  x: number;
  y: number;
  /** 0 : intact · 1 : en cours · 2 : terminé. */
  state: number;
  progress: number;
  discovered: boolean;
  /** L'élite qui garde une cache (0 : aucun). */
  guardUid: number;
  /** Les offres d'un Ferrailleur, tirées à sa première ouverture. */
  offers: Card[] | null;
  /** Faux tant que le héros n'est pas ressorti du cercle d'une boutique qu'il vient de fermer. */
  armed: boolean;
}

/** Un décor posé sur une tuile pleine. */
export interface Prop {
  /** Indice dans `region.decor`, ou -1 pour le décor de bordure. */
  decor: number;
  x: number;
  y: number;
}

export interface GameMap {
  /** Côté de la carte, en tuiles. */
  size: number;
  /** Côté d'une tuile, en pixels. */
  tile: number;
  /** 0 : libre · 1 : obstacle · 2 : bordure. */
  solid: Uint8Array;
  /** Terrain aux coins des tuiles ((size + 1)²) : 0 cendre, 1 chemin. */
  corners: Uint8Array;
  props: Prop[];
  pois: Poi[];
  /** Part de l'intérieur couverte par des obstacles. */
  coverage: number;
}

/** Une arme portée pendant la partie. */
export interface WeaponInstance {
  def: number;
  /** Niveau, à partir de 1. */
  level: number;
  cd: number;
  /** Phase d'activité (orbites) et minuteries secondaires. */
  phase: number;
  timer: number;
  timer2: number;
  angle: number;
  /** Tirs restants d'une salve échelonnée, et frappes en attente. */
  burst: number;
  burstT: number;
  pending: number;
  pendingT: number;
  /** Compteur d'ennemis touchés (soin de la Moisson rouge). */
  hitCount: number;
  damageDone: number;
  /** Numéro d'acquisition, pour l'ordre des évolutions. */
  order: number;
}

export interface RelicInstance {
  def: number;
  level: number;
}

/** Une carte de montée de niveau. */
export interface Card {
  kind: 'weapon' | 'relic' | 'gold' | 'heal';
  /** Indice de l'arme ou de la relique. */
  def: number;
  /** Niveau obtenu en prenant la carte (1 : nouvelle). */
  level: number;
  /** Vrai si la carte fait progresser une évolution. */
  evolves: boolean;
}

/** Le contenu d'un coffre de braise. */
export interface ChestResult {
  /** Indice de l'arme évoluée obtenue, ou -1. */
  evolvedTo: number;
  evolvedFrom: number;
  gold: number;
  /** Vrai si le coffre, faute d'évolution prête, donne un choix de carte gratuit. */
  freeLevel: boolean;
}

export type RunPhase = 'playing' | 'levelup' | 'chest' | 'victory' | 'dead';

/** Les actions du joueur pour un pas. Un instantané par pas : la simulation reste déterministe. */
export interface StepInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  dash: boolean;
  skill: boolean;
  ultimate: boolean;
  flask: boolean;
}

export interface Hero {
  x: number; y: number;
  px: number; py: number;
  /** Dernière direction de déplacement, normalisée. */
  faceX: number; faceY: number;
  /** Direction de visée des armes dirigées. */
  aimX: number; aimY: number;
  /** Direction de sprite, 0 à 7 (0 : sud, sens horaire vu de dessus : sud-ouest, ouest…). */
  facing: number;
  moving: boolean;
  hp: number;
  invuln: number;
  dashT: number; dashCd: number; dashX: number; dashY: number;
  flasks: number;
  skillCd: number;
  buffT: number;
  ultGauge: number;
  ultT: number; ultTick: number;
  revives: number;
  level: number; xp: number; xpNext: number;
  /** Or, Cendres et gemmes ramassés pendant la partie (avant les multiplicateurs de fin). */
  gold: number; ashDrops: number; gems: number;
  kills: number; elites: number; bossKills: number;
  rerolls: number; banishes: number;
  damageTaken: number;
  stats: HeroStats;
}

export interface Director {
  budget: number;
  bank: number;
  breathT: number;
  second: number;
  waveIdx: number;
  waveWarned: boolean;
  waveAngle: number;
  eliteIdx: number;
  eliteOrder: number[];
  bossSpawned: boolean;
  bossUid: number;
  bossPhase: number;
  bossSummonT: number;
  bossAlt: boolean;
  bossDead: boolean;
  arenaX: number; arenaY: number; arenaR: number;
  /** Poids de travail, un par sorte d'ennemi. */
  scratch: Float32Array;
}

export interface RunConfig {
  seed: number;
  regionId: string;
  classId: string;
  /** Rang de Veillée, à partir de 1. */
  vigil: number;
  /** La feuille de statistiques du héros avant la partie (classe, niveau, Autel). */
  sheet: StatSheet;
  /** Identifiants des armes et des reliques proposables. */
  unlockedWeapons: string[];
  unlockedRelics: string[];
  autoSkills: boolean;
}

/** L'état entier d'une expédition. */
export interface Run {
  data: GameData;
  cfg: RunConfig;
  region: RegionDef;
  cls: ClassDef;
  rngMap: Rng; rngSpawn: Rng; rngDraw: Rng; rngCombat: Rng;
  tick: number;
  /** Temps de jeu écoulé, en secondes (les pauses ne comptent pas). */
  time: number;
  phase: RunPhase;
  map: GameMap;
  hero: Hero;
  sheet: StatSheet;
  weapons: WeaponInstance[];
  relics: RelicInstance[];
  acquired: number;
  enemies: EnemyStore;
  shots: ShotStore;
  enemyShots: EnemyShotStore;
  zones: ZoneStore;
  telegraphs: TelegraphStore;
  pickups: PickupStore;
  director: Director;
  /** Multiplicateurs des dégâts et des points de vie des ennemis au temps courant. */
  dmgScale: number;
  hpScaleNow: number;
  // Montée de niveau
  pendingLevels: number;
  cards: Card[];
  banned: Set<string>;
  pityCount: number;
  weaponPool: number[];
  relicPool: number[];
  // Coffres
  pendingChests: number;
  chest: ChestResult | null;
  evolutions: number;
  // Grille spatiale
  gridStart: Int32Array;
  gridItems: Int32Array;
  gridCursor: Int32Array;
  gridCols: number;
  gridBuiltCount: number;
  query: Int32Array;
  /** Rayon de collision par sorte d'ennemi. */
  enemyRadius: Float32Array;
  /** Indice de comportement par sorte d'ennemi. */
  enemyBehavior: Uint8Array;
  // Champ de distances vers le héros
  flow: Uint16Array;
  flowQueue: Int32Array;
  flowTileX: number; flowTileY: number; flowAge: number;
  // File d'événements
  evCount: number;
  evType: Uint8Array;
  evX: Float32Array; evY: Float32Array; evA: Float32Array; evB: Float32Array; evC: Float32Array;
  // Statistiques par sorte d'ennemi
  killsByKind: Uint32Array;
  /** Dégâts subis par le héros, par sorte d'ennemi (pour l'équilibrage). */
  damageByKind: Float32Array;
  braziersLit: number;
  outcome: 'victory' | 'death' | 'abandon' | null;
}
