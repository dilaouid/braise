import type { Beacon, Run } from './types.ts';

/** Le Phare : pendant ses 4 dernières secondes de chaque période, la Lueur double. */
export const PULSE_SECONDS = 4;

/** Vrai si le Phare brille en ce moment. */
export function pulsing(run: Run): boolean {
  const every = run.mods.beaconPulse;
  return every > 0 && run.pulseT % every >= every - PULSE_SECONDS;
}

/** La Lueur du moment : celle de la feuille, moins ce que la brume ou une Lanterne-mère en étouffe, doublée par le Phare. */
export function glowNow(run: Run): number {
  return run.hero.stats.glow * run.dim * (pulsing(run) ? 2 : 1);
}

/** Le rayon éclairé par Moon : la Lueur plus la marge du disque de lumière dessiné à l'écran. */
export function litRadius(run: Run): number {
  return glowNow(run) + run.data.tuning.hero.lightMargin;
}

/** La lanterne noyée ravivée dont la lumière couvre ce point, ou null. */
export function beaconAt(run: Run, x: number, y: number): Beacon | null {
  const radius = run.region.beacons?.radius ?? 0;
  for (const b of run.map.beacons) {
    if (b.life <= 0) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < radius * radius) return b;
  }
  return null;
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
  return run.map.beacons.length > 0 && beaconAt(run, x, y) !== null;
}
