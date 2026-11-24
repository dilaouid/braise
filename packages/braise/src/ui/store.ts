import { signal } from '@preact/signals';
import type { GameData } from '../content/index.ts';
import { FR } from '../content/index.ts';
import type { RunResult } from '../core/rewards.ts';
import type { HeroStats } from '../core/stats.ts';
import type { Card, ChestResult, ShopItem } from '../core/types.ts';
import type { RunSummary } from '../meta/hero.ts';
import type { Save, Settings } from '../meta/save.ts';

export type Screen = 'boot' | 'title' | 'cinematic' | 'scene' | 'camp' | 'memories' | 'altar' | 'settings' | 'run' | 'end';
export type Overlay = 'none' | 'levelup' | 'chest' | 'forge' | 'totem' | 'shop' | 'find' | 'pause' | 'dialogue';
export type Device = 'keyboard' | 'gamepad';

/** Ce que le HUD affiche. Recopié de la simulation une dizaine de fois par seconde. */
export interface HudState {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNext: number;
  time: number;
  boss: { name: string; frac: number; phase: number } | null;
  flasks: number;
  maxFlasks: number;
  gold: number;
  ashes: number;
  kills: number;
  vigil: number;
  weapons: Array<{ icon: string; level: number; max: number; ready: boolean }>;
  relics: Array<{ icon: string; level: number; max: number }>;
  skillFrac: number;
  ultFrac: number;
  ultActive: boolean;
  dashFrac: number;
  message: string | null;
  fps: number;
}

export interface LevelUpState {
  level: number;
  cards: Card[];
  rerolls: number;
  banishes: number;
  /** Progression du maintien de B pour passer, de 0 à 1. */
  skipHold: number;
}

/** Un article de boutique tel que l'écran l'affiche. */
export type ShopEntry = ShopItem & { can: boolean };

export interface ShopState {
  kind: 'smith' | 'herbalist';
  gold: number;
  items: ShopEntry[];
}

export interface ConfirmState {
  text: string;
  yes: string;
  onYes: () => void;
}

/** La réplique affichée dans la boîte de dialogue. `id` change à chaque ligne. */
export interface DialogueState {
  who: 'moon' | 'cream';
  face: string;
  /** Le texte entier, déjà traduit ; `dialogueShown` dit combien de lettres sont écrites. */
  text: string;
  id: number;
  /** Vrai pour une réplique seule (Cream au refuge) : A ou B la ferme, il n'y a rien à passer. */
  single: boolean;
}

/** Ce que le tutoriel ajoute au HUD : le bandeau de leçon, son bouton, la réplique courte de Cream. */
export interface TutoHudState {
  banner: string | null;
  glyph: string | null;
  bark: string | null;
}

/** Les actions que l'interface peut demander. Fournies par `app`, jamais l'inverse. */
export interface Actions {
  start(): void;
  /** Rejoue le prologue depuis l'écran titre. */
  prologue(): void;
  /** Rejoue le tutoriel depuis l'écran titre, sans rien changer à la sauvegarde. */
  tutorial(): void;
  /** Passe le tutoriel en cours et va au refuge. */
  skipTutorial(): void;
  /** Finit la ligne de dialogue en cours, ou passe à la suivante. */
  dialogueNext(): void;
  /** Passe tout le dialogue en cours. */
  dialogueSkip(): void;
  /** Cream, au refuge, dit une réplique. */
  creamTalk(): void;
  /** Rejoue la scène d'un souvenir obtenu, depuis la liste du refuge, puis y revient. */
  replayMemory(id: string): void;
  /** Ferme le carton « Souvenir retrouvé » : le bilan s'affiche. */
  closeMemoryCard(): void;
  goto(screen: Screen): void;
  depart(seed?: number): void;
  buyAltar(id: string): void;
  refundAltar(): void;
  toggleAltar(id: string): void;
  takeCard(index: number): void;
  reroll(): void;
  banish(index: number): void;
  skip(): void;
  closeChest(): void;
  takeBoon(index: number): void;
  takeEvolution(index: number): void;
  closeForge(): void;
  buy(index: number): void;
  closeShop(): void;
  closeFind(): void;
  pause(on: boolean): void;
  abandon(): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  fullscreen(): void;
  eraseSave(): void;
  uiSound(name: 'move' | 'confirm' | 'back' | 'refuse'): void;
}

/** Gestionnaires de boutons de l'écran courant. */
export interface Handlers {
  back?: () => void;
  x?: () => void;
  y?: () => void;
  pause?: () => void;
  tabPrev?: () => void;
  tabNext?: () => void;
  /** Gauche / droite sur l'élément au focus (curseurs des réglages). Renvoie vrai si la direction est consommée. */
  nav?: (dx: number, dy: number) => boolean;
}

export const screen = signal<Screen>('boot');
export const overlay = signal<Overlay>('none');
export const device = signal<Device>('keyboard');
export const save = signal<Save | null>(null);
/** Incrémenté à chaque changement de la sauvegarde : l'objet lui-même est modifié en place. */
export const saveRev = signal(0);
export const hud = signal<HudState | null>(null);
export const levelUp = signal<LevelUpState | null>(null);
export const chest = signal<ChestResult | null>(null);
/** Les buffs proposés par le totem chargé (indices dans `data.boons`). */
export const totemState = signal<number[] | null>(null);
/** Les armes qu'un braséro allumé propose de faire évoluer : indices dans `data.weapons`, avant et après. */
export const forgeState = signal<Array<{ from: number; to: number }> | null>(null);
export const shopState = signal<ShopState | null>(null);
/** La trouvaille affichée : son indice (-2 : de l'or à la place) et cet or. */
export const findState = signal<{ find: number; gold: number } | null>(null);
/** Buffs et trouvailles portés, pour l'écran de pause. */
export const runExtras = signal<{ boons: number[]; finds: number[] }>({ boons: [], finds: [] });
export const confirm = signal<ConfirmState | null>(null);
export const ending = signal<{ result: RunResult; summary: RunSummary; stats: HeroStats } | null>(null);
export const pauseReason = signal<string | null>(null);
export const pauseStats = signal<HeroStats | null>(null);
export const notice = signal<string | null>(null);
export const holdProgress = signal(0);
export const lastSeed = signal<number | null>(null);
export const replaySeed = signal(false);
/** La cinématique : le carton affiché (clé de fr.json) et la progression du maintien pour passer, de 0 à 1. */
export const cineCard = signal<string | null>(null);
export const cineCaption = signal<string | null>(null);
export const cineSkip = signal(0);
/** La cinématique en cours se passe d'un seul appui (déjà vue), sans maintien. */
export const cineQuick = signal(false);
/** Le carton posé après la scène d'un souvenir : son identifiant, et combien sont obtenus à ce moment. */
export const memoryCard = signal<{ id: string; have: number; total: number } | null>(null);

/** Le dialogue : la réplique affichée (nulle pour une ligne muette) et le nombre de lettres déjà écrites. */
export const dialogueState = signal<DialogueState | null>(null);
export const dialogueShown = signal(0);
/** Non nul pendant le tutoriel. */
export const tutoHud = signal<TutoHudState | null>(null);

/** Ce qu'une sauvegarde garde quand le prologue a été vu (dans `account.unlocks`). */
export const INTRO_SEEN = 'seen.intro';
/** Ce qu'une sauvegarde garde quand le tutoriel a été fini ou passé. */
export const TUTORIAL_SEEN = 'seen.tutorial';

/** Cream est au refuge, et le tutoriel se rejoue, dès qu'un héros existe ou que le tutoriel a été vu. */
export function knowsCream(s: Save): boolean {
  return Object.keys(s.heroes).length > 0 || s.account.unlocks.includes(TUTORIAL_SEEN);
}

/** Références partagées, posées par `app` au démarrage. */
export const refs: {
  data: GameData | null;
  actions: Actions | null;
  atlas: { rect(name: string): { x: number; y: number; w: number; h: number } | null; size: { width: number; height: number } } | null;
  atlasUrl: string;
  handlers: Handlers[];
} = { data: null, actions: null, atlas: null, atlasUrl: '', handlers: [] };

export function actions(): Actions {
  if (!refs.actions) throw new Error('Actions non initialisées');
  return refs.actions;
}

export function gameData(): GameData {
  if (!refs.data) throw new Error('Données non chargées');
  return refs.data;
}

/** Le texte d'une clé, avec ses variables « {nom} ». Une clé inconnue s'affiche telle quelle. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let text = FR[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Un nombre lisible : espaces de milliers, et abrégé au-delà du million. */
export function fmt(n: number): string {
  const v = Math.floor(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} M`;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Une durée en minutes et secondes. */
export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}
