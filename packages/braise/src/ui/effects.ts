import type { GameData, PieceDef, PieceEffect } from '../content/index.ts';
import { pieceById, type FaceView, type LanternView } from '../meta/lantern.ts';

/** Un morceau de pastille : une image (barrée ou non) ou un court texte. */
export type ChipPart = { icon: string; cross?: boolean } | { text: string };

/** Une pastille : un effet, en images et en nombres. */
export interface Chip {
  kind: 'good' | 'bad';
  parts: ChipPart[];
  /** Le malus est retiré par le verre d'en face. */
  cleared?: boolean;
}

const icon = (name: string): ChipPart => ({ icon: name });
const text = (value: string): ChipPart => ({ text: value });
const pct = (share: number): string => `${Math.round(share * 100)} %`;
const signed = (share: number): string => `${share > 0 ? '+' : ''}${pct(share)}`;
const delta = (n: number): string => (n > 0 ? `+${n}` : String(n));
/** Un multiplicateur, dit comme un écart : 1,5 devient « +50 % ». */
const over = (mult: number): string => signed(mult - 1);

/** Les effets qui ne se montrent pas seuls : un autre les dit avec lui. */
const SILENT = new Set(['dashBurnRadius', 'lowHpShare', 'firstReviveShare']);

type Draw = (data: GameData, value: number, effect: PieceEffect) => ChipPart[];

const DRAW: Record<string, Draw> = {
  wisdom: (_d, v) => [icon('sign-wisdom'), text(signed(v))],
  critMult: (_d, v) => [icon('sign-crit'), text(signed(v))],
  glowShare: (_d, v) => [icon('sign-glow'), text(signed(v))],
  maxHpShare: (_d, v) => [icon('sign-heart'), text(signed(v))],
  revives: (_d, v, e) => [icon('icon-find-scarf'), text(e.mods.firstReviveShare ? `${delta(v)} · ${pct(e.mods.firstReviveShare)}` : delta(v))],
  gemsPerHeal: (_d, v) => [icon('pickup-gem-small'), text(`${v} ▸`), icon('sign-heart'), text('+1')],
  noFlask: () => [{ icon: 'pickup-drop', cross: true }],
  dashBurn: (_d, v) => [icon('icon-dash'), icon('sign-flame'), text(String(v))],
  dashCooldownMult: (_d, v) => [icon('icon-dash'), icon('sign-hourglass'), text(over(v))],
  lowHpPower: (_d, v, e) => [icon('sign-heart'), text(`< ${pct(e.mods.lowHpShare ?? 0)} ▸`), icon('sign-power'), text(signed(v))],
  healMult: (_d, v) => [icon('sign-heart'), icon('sign-plus'), text(`÷ ${Math.round(1 / v)}`)],
  threatMult: (_d, v) => [icon('sign-horde'), text(over(v))],
  ultChargeMult: (d, v) => [icon(hero(d).ultimate.icon), text(over(v))],
  skillCooldownMult: (d, v) => [icon(hero(d).skill.icon), icon('sign-hourglass'), text(over(v))],
  eliteKillPower: (_d, v) => [icon('sign-elite'), text('▸'), icon('sign-power'), text(signed(v))],
  eliteHpMult: (_d, v) => [icon('sign-elite'), icon('sign-heart'), text(over(v))],
};

/** La classe jouée : la seule du jeu pour l'instant. */
function hero(data: GameData): GameData['classes'][string] {
  return Object.values(data.classes)[0]!;
}

/** Les pastilles d'un effet. Un effet que la table ne sait pas dessiner est une erreur de contenu. */
export function effectChips(data: GameData, effect: PieceEffect, kind: Chip['kind']): Chip[] {
  const out: Chip[] = [];
  for (const [key, value] of [...Object.entries(effect.stats), ...Object.entries(effect.mods)]) {
    if (value === undefined || SILENT.has(key)) continue;
    const draw = DRAW[key];
    if (!draw) throw new Error(`Effet sans pastille : ${key}`);
    out.push({ kind, parts: draw(data, Number(value), effect) });
  }
  return out;
}

const SHIFTS = [['previous', 'sign-prev'], ['next', 'sign-next'], ['opposite', 'sign-opposite']] as const;

/** Les pastilles d'une pièce posée : ce qu'elle donne, puis ce qu'elle coûte. Une rune éteinte ne fait rien. */
export function pieceChips(data: GameData, face: FaceView): Chip[] {
  const piece = pieceById(data, face.id);
  if (!piece || (piece.kind === 'rune' && face.level === 0)) return [];
  const good: Chip[] = piece.kind === 'rune' ? effectChips(data, piece.levels[face.level - 1]!, 'good') : [];
  const bad: Chip[] = [];
  if (piece.clearsOpposite) good.push({ kind: 'good', parts: [icon('sign-opposite'), { icon: 'sign-malus', cross: true }] });
  for (const [where, sign] of SHIFTS) {
    const n = piece.shifts[where];
    if (n !== 0) (n > 0 ? good : bad).push({ kind: n > 0 ? 'good' : 'bad', parts: [icon(sign), text(delta(n))] });
  }
  const malus = effectChips(data, piece.malus, 'bad').map((c) => (face.malusCleared ? { ...c, cleared: true } : c));
  return [...good, ...bad, ...malus];
}

/** Les clés des phrases d'une pièce, et ce qui n'agit pas : un malus chiffré retiré, une rune éteinte. */
export function pieceWords(data: GameData, face: FaceView): { bonus: string; malus: string; bonusOff: boolean; malusOff: boolean } {
  const piece = pieceById(data, face.id)!;
  const off = piece.kind === 'rune' && face.level === 0;
  return {
    bonus: piece.kind === 'glass' ? `${piece.id}.bonus` : `${piece.id}.bonus.${Math.max(1, face.level)}`,
    malus: `${piece.id}.malus`,
    bonusOff: off,
    malusOff: off || (face.malusCleared && hasNumericMalus(piece)),
  };
}

/** Un malus de niveau fait partie du verre : le Verre fendu ne retire que les malus chiffrés. */
export function hasNumericMalus(piece: PieceDef): boolean {
  return Object.keys(piece.malus.stats).length + Object.keys(piece.malus.mods).length > 0;
}

/** Tout ce que la Lanterne donne à l'expédition : sans les changements de niveau, ni les malus retirés. */
export function lanternChips(data: GameData, view: LanternView): Chip[] {
  return view.faces.flatMap((face) => {
    const piece = face ? pieceById(data, face.id) : null;
    if (!face || !piece || (piece.kind === 'rune' && face.level === 0)) return [];
    return [
      ...(piece.kind === 'rune' ? effectChips(data, piece.levels[face.level - 1]!, 'good') : []),
      ...(face.malusCleared ? [] : effectChips(data, piece.malus, 'bad')),
    ];
  });
}
