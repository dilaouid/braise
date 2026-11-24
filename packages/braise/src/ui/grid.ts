/**
 * La case suivante dans une grille à trous (`cells` : indices occupés, rangée par rangée). À l'horizontale, l'ordre de
 * lecture : aucune case ne peut rester hors d'atteinte. À la verticale, la rangée occupée la plus proche, puis la colonne.
 */
export function gridStep(cells: readonly number[], from: number, dx: number, dy: number, cols: number): number | null {
  if (dx !== 0) {
    const side = cells.filter((c) => (dx > 0 ? c > from : c < from));
    return side.length === 0 ? null : dx > 0 ? Math.min(...side) : Math.max(...side);
  }
  const row = Math.floor(from / cols);
  const rows = cells.filter((c) => (dy > 0 ? Math.floor(c / cols) > row : Math.floor(c / cols) < row));
  if (rows.length === 0) return null;
  const score = (c: number): number => Math.abs(Math.floor(c / cols) - row) * cols * 2 + Math.abs((c % cols) - (from % cols));
  return rows.reduce((best, c) => (score(c) < score(best) ? c : best));
}
