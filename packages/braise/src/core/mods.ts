import type { RunModsRaw } from '../content/index.ts';

/** Ce que la Lanterne change aux règles d'une partie, tous champs renseignés. */
export type RunMods = Required<RunModsRaw>;

/** Aucun changement : la partie se joue comme sans Lanterne. */
export const NEUTRAL_MODS: Readonly<RunMods> = Object.freeze({
  gemsPerHeal: 0, noFlask: false, dashBurn: 0, dashBurnRadius: 0, dashCooldownMult: 1, lowHpPower: 0, lowHpShare: 0,
  healMult: 1, threatMult: 1, ultChargeMult: 1, skillCooldownMult: 1, eliteKillPower: 0, eliteHpMult: 1, firstReviveShare: 0,
});

/** Les champs qui multiplient une valeur du jeu : deux sources se multiplient. */
const MULTIPLIERS = ['dashCooldownMult', 'healMult', 'threatMult', 'ultChargeMult', 'skillCooldownMult', 'eliteHpMult'] as const;

/** Ajoute des modificateurs à d'autres, sans toucher à l'entrée. */
export function mergeMods(base: RunMods, add: RunModsRaw): RunMods {
  const out: RunMods = { ...base, ...add };
  for (const key of MULTIPLIERS) out[key] = base[key] * (add[key] ?? 1);
  out.noFlask = base.noFlask || add.noFlask === true;
  return out;
}
