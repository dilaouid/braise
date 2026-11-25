import { tickStatuses } from '../../src/core/combat.ts';
import { buildGrid } from '../../src/core/stores.ts';
import { MAX_WEAPON_SLOTS, STEP, type Run } from '../../src/core/types.ts';
import { updateWeapons } from '../../src/core/weapons.ts';
import { data, makeImmortal, makeRun, noTrait } from './helpers.ts';

export const crawler = data.enemies.findIndex((e) => e.id === 'enemy.crawler');

/**
 * Une partie sans horde, sans critique, sans trait ni attribut, avec cette seule arme au niveau voulu :
 * les dégâts de base du contenu se lisent tels quels.
 */
export function armed(id: string, level = 1): Run {
  const run = noTrait(makeRun(21));
  makeImmortal(run);
  const def = data.weapons.find((w) => w.id === id)!;
  run.weapons[0]!.def = def.index;
  run.weapons[0]!.level = level;
  run.weapons[0]!.cd = 0;
  const st = run.hero.stats;
  st.critChance = 0;
  st.power = 0;
  st.zone = 0;
  st.duration = 0;
  st.cadence = 0;
  for (const k of Object.keys(st.attrs) as Array<keyof typeof st.attrs>) st.attrs[k] = 0;
  run.director.waveIdx = 99;
  run.director.eliteIdx = 99;
  run.map.pois.length = 0;
  run.map.solid.fill(0);
  return run;
}

/** Fait jouer les armes et les états pendant ce nombre de pas. Personne ne bouge. */
export function hold(run: Run, steps: number): void {
  const e = run.enemies;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < e.count; i++) {
      tickStatuses(run, i, STEP);
      for (let k = 0; k < MAX_WEAPON_SLOTS; k++) if (e.hitCd[i * MAX_WEAPON_SLOTS + k]! > 0) e.hitCd[i * MAX_WEAPON_SLOTS + k]! -= STEP;
    }
    buildGrid(run);
    updateWeapons(run, STEP);
    run.evCount = 0;
  }
}

/** Les points de vie perdus par un ennemi. */
export function lost(run: Run, i: number): number {
  return Math.round(run.enemies.maxHp[i]! - run.enemies.hp[i]!);
}
