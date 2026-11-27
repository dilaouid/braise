import type { ClassDef, TalentNodeRaw } from '../content/index.ts';

/** Un nombre à la française : deux décimales au plus, sans zéro inutile, virgule décimale. */
export function frNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Une part (0,04) en pourcentage lisible (« 4 »). */
function pct(n: number): string {
  return frNum(n * 100);
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** Une ligne par effet : la clé de traduction et sa valeur déjà mise en forme. Les effets nuls sont tus. */
function effectLine(key: string, value: number | boolean, t: Tr): string | null {
  if (value === false || value === 0) return null;
  if (value === true) return t(`talents.fx.${key}`);
  switch (key) {
    case 'maxHpShare': case 'speedShare': case 'glowShare': case 'zone': case 'dashCrit': case 'litPower': case 'fogResist':
      return t(`talents.fx.${key}`, { v: pct(value) });
    case 'flaskHealMult': case 'healMult':
      return t(`talents.fx.${key}`, { v: pct(value - 1) });
    case 'dashCooldownMult':
      return t(`talents.fx.${key}`, { v: pct(1 - value) });
    case 'flasks': case 'dashCharges':
      return t(`talents.fx.${key}${value > 1 ? '.many' : ''}`, { v: frNum(value) });
    default:
      return t(`talents.fx.${key}`, { v: frNum(value) });
  }
}

/**
 * Ce que donne ce nœud à ce rang, tout compris : une ligne par effet. Vide au rang 0.
 * `perRank` : le bonus multiplié par le rang ; `levels` : l'effet total du rang.
 */
export function talentEffects(node: TalentNodeRaw, rank: number, t: Tr): string[] {
  if (rank <= 0) return [];
  const r = Math.min(rank, node.ranks);
  const parts: Array<[string, number | boolean]> = [];
  if (node.perRank) {
    for (const [k, v] of Object.entries(node.perRank)) parts.push([k, (v as number) * r]);
  } else if (node.levels) {
    const level = node.levels[r - 1]!;
    for (const [k, v] of Object.entries(level.stats)) parts.push([k, v as number]);
    for (const [k, v] of Object.entries(level.mods)) parts.push([k, v as number | boolean]);
  }
  return parts.map(([k, v]) => effectLine(k, v, t)).filter((s): s is string => s !== null);
}

/** La place logique d'un nœud : sa colonne (deux par branche, une demie pour un nœud seul) et sa rangée (0 en haut). */
export interface Slot {
  node: TalentNodeRaw;
  col: number;
  row: number;
}

export function talentSlots(cls: ClassDef): Slot[] {
  const out: Slot[] = [];
  cls.tree.branches.forEach((branch, b) => {
    for (const tier of [4, 3, 2, 1]) {
      const row = cls.tree.nodes.filter((n) => n.branch === branch && n.tier === tier);
      row.forEach((node, k) => out.push({ node, col: b * 2 + (row.length === 1 ? 0.5 : k), row: 4 - tier }));
    }
  });
  return out;
}

/**
 * La croix dans l'arbre : à l'horizontale, le nœud voisin sur la même rangée (d'une branche à l'autre au bord) ;
 * à la verticale, l'étage voisin de la même branche, du côté d'où l'on vient. Jamais de saut en diagonale.
 */
export function treeStep(all: readonly Slot[], from: Slot, dx: number, dy: number, prefer: number): Slot | null {
  if (dx !== 0) {
    const row = all.filter((s) => s.row === from.row && (dx > 0 ? s.col > from.col : s.col < from.col));
    if (row.length === 0) return null;
    return row.reduce((a, b) => (Math.abs(b.col - from.col) < Math.abs(a.col - from.col) ? b : a));
  }
  const branch = Math.floor(from.col / 2);
  const next = all.filter((s) => s.row === from.row + dy && Math.floor(s.col / 2) === branch);
  if (next.length === 0) return null;
  const want = from.col % 1 === 0 ? from.col : prefer;
  return next.reduce((a, b) => (Math.abs(b.col - want) < Math.abs(a.col - want) ? b : a));
}
