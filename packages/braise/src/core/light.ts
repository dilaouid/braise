import type { Run } from './types.ts';

/** Le rayon éclairé par Moon : la Lueur plus la marge du disque de lumière dessiné à l'écran. */
export function litRadius(run: Run): number {
  return run.hero.stats.glow + run.data.tuning.hero.lightMargin;
}

/** Vrai si ce point est éclairé : dans le disque de Moon, ou dans la lumière d'une Veilleuse. */
export function isLit(run: Run, x: number, y: number): boolean {
  const lit = litRadius(run);
  const dx = x - run.hero.x;
  const dy = y - run.hero.y;
  if (dx * dx + dy * dy < lit * lit) return true;
  for (const lamp of run.lamps) {
    const lx = x - lamp.x;
    const ly = y - lamp.y;
    if (lx * lx + ly * ly < lamp.radius * lamp.radius) return true;
  }
  return false;
}
