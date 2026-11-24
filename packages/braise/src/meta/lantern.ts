import type { GameData, PieceDef, PieceEffect, StatBonus } from '../content/index.ts';
import { NEUTRAL_MODS, mergeMods, type RunMods } from '../core/mods.ts';
import type { RunResult } from '../core/rewards.ts';
import type { RunConfig } from '../core/types.ts';
import { LANTERN_FACES, type LanternSave, type Save } from './save.ts';

/** Une face occupée, telle qu'elle agit. */
export interface FaceView {
  id: string;
  /** Niveau de la rune, de 0 (éteinte) à 3. Toujours 0 pour un verre. */
  level: number;
  /** Le malus est retiré par le verre d'en face. */
  malusCleared: boolean;
  /** Les verres qui changent ce niveau. */
  sources: Array<{ id: string; delta: number }>;
}

/** La Lanterne résolue : ce qu'elle donne à une partie. */
export interface LanternView {
  faces: Array<FaceView | null>;
  stats: StatBonus;
  mods: RunMods;
  /** Nombre de faces ouvertes et occupées, runes éteintes comprises. */
  placed: number;
  /** Les pièces qui changent des statistiques, dans l'ordre des faces. */
  sources: Array<{ label: string; bonus: StatBonus; times: number }>;
}

const MAX_LEVEL = 3;

/** La pièce de cet identifiant, ou null. */
export function pieceById(data: GameData, id: string): PieceDef | null {
  return data.lantern.pieces.find((p) => p.id === id) ?? null;
}

function addStats(into: StatBonus, add: StatBonus): void {
  for (const key of Object.keys(add) as Array<keyof StatBonus>) into[key] = (into[key] ?? 0) + (add[key] ?? 0);
}

/**
 * Résout une disposition : le niveau de chaque rune d'après les verres voisins, les malus retirés,
 * puis la somme des bonus et des malus. Une face fermée, vide ou inconnue ne compte pour rien.
 */
export function resolveLantern(data: GameData, lantern: LanternSave): LanternView {
  const pieces: Array<PieceDef | null> = [];
  for (let i = 0; i < LANTERN_FACES; i++) {
    const id = i < lantern.opened ? lantern.faces[i] : null;
    pieces.push(id ? pieceById(data, id) : null);
  }
  const out: LanternView = { faces: [], stats: {}, mods: { ...NEUTRAL_MODS }, placed: 0, sources: [] };
  for (let i = 0; i < LANTERN_FACES; i++) {
    const piece = pieces[i];
    if (!piece) {
      out.faces.push(null);
      continue;
    }
    out.placed++;
    const previous = pieces[(i + LANTERN_FACES - 1) % LANTERN_FACES];
    const next = pieces[(i + 1) % LANTERN_FACES];
    const opposite = pieces[(i + LANTERN_FACES / 2) % LANTERN_FACES];
    const sources: FaceView['sources'] = [];
    let level = 0;
    if (piece.kind === 'rune') {
      // Vu du verre : la rune est la face suivante de sa précédente, et la précédente de sa suivante.
      if (previous && previous.shifts.next !== 0) sources.push({ id: previous.id, delta: previous.shifts.next });
      if (next && next.shifts.previous !== 0) sources.push({ id: next.id, delta: next.shifts.previous });
      if (opposite && opposite.shifts.opposite !== 0) sources.push({ id: opposite.id, delta: opposite.shifts.opposite });
      level = Math.min(MAX_LEVEL, Math.max(0, sources.reduce((sum, s) => sum + s.delta, 1)));
    }
    const malusCleared = opposite?.clearsOpposite === true;
    out.faces.push({ id: piece.id, level, malusCleared, sources });
    const effects: PieceEffect[] = [];
    if (level > 0) effects.push(piece.levels[level - 1]!);
    // Une rune éteinte ne fait rien, malus compris.
    if (!malusCleared && (piece.kind === 'glass' || level > 0)) effects.push(piece.malus);
    const bonus: StatBonus = {};
    for (const effect of effects) {
      addStats(bonus, effect.stats);
      out.mods = mergeMods(out.mods, effect.mods);
    }
    addStats(out.stats, bonus);
    if (Object.keys(bonus).length > 0) out.sources.push({ label: piece.id, bonus, times: 1 });
  }
  return out;
}

/** Pose une pièce sur une face ouverte. Si elle était déjà posée, les deux faces échangent leur contenu. */
export function placePiece(data: GameData, lantern: LanternSave, face: number, id: string): boolean {
  if (face < 0 || face >= lantern.opened || !lantern.owned.includes(id) || !pieceById(data, id)) return false;
  const from = lantern.faces.indexOf(id);
  if (from >= 0) lantern.faces[from] = lantern.faces[face] ?? null;
  lantern.faces[face] = id;
  return true;
}

/** Vide une face. */
export function clearFace(lantern: LanternSave, face: number): void {
  if (face >= 0 && face < LANTERN_FACES) lantern.faces[face] = null;
}

/** Vide toutes les faces. */
export function clearLantern(lantern: LanternSave): void {
  lantern.faces.fill(null);
}

/** Les pièces possédées que le jeu connaît, dans l'ordre du contenu. */
export function ownedPieces(data: GameData, lantern: LanternSave): PieceDef[] {
  return data.lantern.pieces.filter((p) => lantern.owned.includes(p.id));
}

/** Les pièces qui peuvent encore tomber : des runes seulement tant qu'aucune pièce n'est possédée. */
export function missingPieces(data: GameData, lantern: LanternSave): string[] {
  const none = ownedPieces(data, lantern).length === 0;
  return data.lantern.pieces.filter((p) => !lantern.owned.includes(p.id) && (!none || p.kind === 'rune')).map((p) => p.id);
}

/** Les nouveautés possibles : les pièces possédées, et les faces ouvertes en cours de partie. */
function newsKeys(lantern: LanternSave): string[] {
  const keys = lantern.owned.slice();
  for (let face = 2; face <= lantern.opened; face++) keys.push(`face.${face}`);
  return keys;
}

/** Une pièce ou une face n'a pas encore été vue dans l'écran de la Lanterne. */
export function lanternNews(data: GameData, lantern: LanternSave): boolean {
  return newsKeys(lantern).some((key) => !lantern.seen.includes(key) && (key.startsWith('face.') || pieceById(data, key) !== null));
}

/** L'écran de la Lanterne vient de s'ouvrir : tout est vu. */
export function markLanternSeen(lantern: LanternSave): void {
  lantern.seen = newsKeys(lantern);
}

/** Ce que la Lanterne donne à une partie qui commence. Une graine rejouée ne rapporte aucune pièce. */
export function lanternRun(data: GameData, save: Save, replay: boolean): { mods: RunMods; lantern: NonNullable<RunConfig['lantern']> } {
  const lantern = save.account.lantern;
  const view = resolveLantern(data, lantern);
  return {
    mods: view.mods,
    lantern: {
      pool: replay ? [] : missingPieces(data, lantern),
      guaranteed: !replay && ownedPieces(data, lantern).length === 0,
      placed: view.placed,
    },
  };
}

/** Verse une partie finie dans la Lanterne : la pièce ramenée, la victoire comptée, la face ouverte (une au plus). */
export function applyLantern(data: GameData, lantern: LanternSave, result: RunResult): { piece: string | null; face: number | null } {
  if (result.outcome !== 'victory') return { piece: null, face: null };
  const { kept, placed, reborn } = result.lantern;
  let piece: string | null = null;
  if (kept !== null && !lantern.owned.includes(kept)) {
    lantern.owned.push(kept);
    piece = kept;
  }
  if (placed >= 1) lantern.wins++;
  const opens = lantern.opened === 1 ? reborn
    : lantern.opened === 2 ? lantern.wins >= data.lantern.winsForThird
      : lantern.opened === 3 ? reborn && placed >= 3 : false;
  if (!opens) return { piece, face: null };
  lantern.opened++;
  return { piece, face: lantern.opened };
}
