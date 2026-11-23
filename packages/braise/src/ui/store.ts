import { signal } from '@preact/signals';
import type { GameData } from '../content/index.ts';
import { FR } from '../content/index.ts';
import type { RunResult } from '../core/rewards.ts';
import type { HeroStats } from '../core/stats.ts';
import type { Card, ChestResult } from '../core/types.ts';
import type { RunSummary } from '../meta/hero.ts';
import type { Save, Settings } from '../meta/save.ts';

export type Screen = 'boot' | 'title' | 'cinematic' | 'camp' | 'altar' | 'settings' | 'run' | 'end';
export type Overlay = 'none' | 'levelup' | 'chest' | 'pause';
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

export interface ConfirmState {
  text: string;
  yes: string;
  onYes: () => void;
}

/** Les actions que l'interface peut demander. Fournies par `app`, jamais l'inverse. */
export interface Actions {
  start(): void;
  /** Rejoue le prologue depuis l'écran titre. */
  prologue(): void;
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
export const cineSkip = signal(0);

/** Ce qu'une sauvegarde garde quand le prologue a été vu (dans `account.unlocks`). */
export const INTRO_SEEN = 'seen.intro';

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
