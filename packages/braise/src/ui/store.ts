import { signal } from '@preact/signals';
import type { GameData } from '../content/index.ts';
import { FR } from '../content/index.ts';
import type { FeedBlock } from '../core/flames.ts';
import type { RunResult } from '../core/rewards.ts';
import type { HeroStats } from '../core/stats.ts';
import type { Card, ChestResult, ShopItem } from '../core/types.ts';
import type { RunSummary } from '../meta/hero.ts';
import type { Save, Settings } from '../meta/save.ts';

export type Screen = 'boot' | 'title' | 'cinematic' | 'scene' | 'camp' | 'memories' | 'altar' | 'lantern' | 'door' | 'settings' | 'run' | 'end';
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
  /** Les états du héros : la vase, la morsure, la Lueur étouffée, l'eau profonde, l'élan d'une esquive juste. */
  statuses: Array<{ id: 'mire' | 'drain' | 'dim' | 'wade' | 'dodge'; icon: string }>;
  flasks: number;
  maxFlasks: number;
  /** La Lanterne empêche de boire : les fioles sont grisées. */
  flaskBlocked: boolean;
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
  /** Ruées prêtes, et combien le héros peut en garder. */
  dashCharges: number;
  dashMax: number;
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

/** Une Flamme proposée par le totem, telle que l'écran l'affiche. */
export interface FlameCardState {
  line: number;
  rarity: number;
  /** Points de Lueur que coûte la carte à sa rareté affichée. */
  cost: number;
  /** Ce qui empêche de la nourrir d'un cran de plus, ou null ; et ce que ce cran coûterait en plus. */
  block: FeedBlock | null;
  feedCost: number;
  canUnfeed: boolean;
  /** Points rendus en reprenant un cran. */
  unfeedGain: number;
  /** La Lueur qui resterait après l'avoir prise, en part de la Lueur de base. */
  glowAfter: number;
}

/** L'écran du totem : ses cartes, la Lueur du moment (1 : 100 %), et la rareté la plus haute ouverte. */
export interface TotemState {
  cards: FlameCardState[];
  glow: number;
  open: number;
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
  /** Part en expédition. `seed` : la graine à rejouer ; `regionId` : la région choisie à la porte. */
  depart(seed?: number, regionId?: string): void;
  /** Au refuge, passe à l'objet suivant ou précédent, et Moon y marche. */
  campJump(step: number): void;
  buyAltar(id: string): void;
  refundAltar(): void;
  toggleAltar(id: string): void;
  /** Pose une pièce sur une face de la Lanterne (0 à 3), vide une face, ou les vide toutes. */
  lanternPlace(face: number, id: string): void;
  lanternClear(face: number): void;
  lanternClearAll(): void;
  takeCard(index: number): void;
  reroll(): void;
  banish(index: number): void;
  skip(): void;
  closeChest(): void;
  /** Prend une Flamme du totem, la nourrit d'un cran, ou reprend un cran. */
  takeFlame(index: number): void;
  feedFlame(index: number): void;
  unfeedFlame(index: number): void;
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
/** Les Flammes proposées par le totem chargé. */
export const totemState = signal<TotemState | null>(null);
/** Les armes qu'un braséro allumé propose de faire évoluer : indices dans `data.weapons`, avant et après. */
export const forgeState = signal<Array<{ from: number; to: number }> | null>(null);
export const shopState = signal<ShopState | null>(null);
/** La trouvaille affichée : son indice (-2 : de l'or à la place) et cet or. */
export const findState = signal<{ find: number; gold: number } | null>(null);
/** Ce que l'écran de pause montre en plus : Flammes, trouvailles, pièces de Lanterne posées, celle ramassée, et la Lueur (1 : 100 %). */
export const runExtras = signal<{
  flames: Array<{ line: number; rarity: number }>; finds: number[]; lantern: Array<{ id: string; level: number }>; piece: string | null; glow: number;
}>({ flames: [], finds: [], lantern: [], piece: null, glow: 1 });
export const confirm = signal<ConfirmState | null>(null);
export const ending = signal<{ result: RunResult; summary: RunSummary; stats: HeroStats } | null>(null);
export const pauseReason = signal<string | null>(null);
export const pauseStats = signal<HeroStats | null>(null);
export const notice = signal<string | null>(null);
/** Le fichier de son de chaque son d'interface. */
export const UI_SOUNDS = { move: 'ui-move', confirm: 'ui-confirm', back: 'ui-back', refuse: 'refuse' } as const;

export const holdProgress = signal(0);
/** L'identifiant `data-focus` de l'élément au focus. */
export const focusedId = signal<string | null>(null);
export const lastSeed = signal<number | null>(null);
export const replaySeed = signal(false);
/** La cinématique : le carton affiché (clé de fr.json) et la progression du maintien pour passer, de 0 à 1. */
export const cineCard = signal<string | null>(null);
export const cineCaption = signal<string | null>(null);
export const cineSkip = signal(0);
/** La cinématique en cours se passe d'un seul appui (déjà vue), sans maintien. */
export const cineQuick = signal(false);
/** Le carton d'un boss : son nom et son titre à son arrivée ; « vaincu » et son nom à sa chute. `key` relance l'animation. */
export const bossCard = signal<{ name: string; title: string; felled: boolean; key: number } | null>(null);
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

/** Les objets du refuge présents dans cette sauvegarde. */
export function campVisible(data: GameData, s: Save): Set<string> {
  const out = new Set(['door', 'altar', 'lantern', 'fire']);
  if (knowsCream(s)) out.add('cream');
  if (data.memories.some((m) => s.account.unlocks.includes(m.id))) out.add('memories');
  return out;
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
