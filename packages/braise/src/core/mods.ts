import type { RunModsRaw } from '../content/index.ts';

/** Ce que la Lanterne, les Flammes et les talents changent aux règles d'une partie, tous champs renseignés. */
export type RunMods = Required<RunModsRaw>;

/** Aucun changement : la partie se joue comme sans Lanterne. */
export const NEUTRAL_MODS: Readonly<RunMods> = Object.freeze({
  gemsPerHeal: 0, noFlask: false, dashBurn: 0, dashBurnRadius: 0, dashCooldownMult: 1, lowHpPower: 0, lowHpShare: 0,
  healMult: 1, threatMult: 1, ultChargeMult: 1, skillCooldownMult: 1, eliteKillPower: 0, eliteHpMult: 1, firstReviveShare: 0,
  dashCharges: 0, dashTrail: 0, haloBurn: 0, shadowCrit: 0, recallEvery: 0,
  flaskHealMult: 1, flaskRefillEvery: 0, lastStand: false, dashCooldownCut: 0, dodgeExtra: 0, dashCrit: 0, dodgeRefill: false,
  litPower: 0, fogResist: 0, beaconPulse: 0,
});

/** Les champs qui multiplient une valeur du jeu : deux sources se multiplient. */
const MULTIPLIERS = ['dashCooldownMult', 'healMult', 'threatMult', 'ultChargeMult', 'skillCooldownMult', 'eliteHpMult', 'flaskHealMult'] as const;

/** Ajoute des modificateurs à d'autres, sans toucher à l'entrée. */
export function mergeMods(base: RunMods, add: RunModsRaw): RunMods {
  const out: RunMods = { ...base, ...add };
  for (const key of MULTIPLIERS) out[key] = base[key] * (add[key] ?? 1);
  out.noFlask = base.noFlask || add.noFlask === true;
  return out;
}

/** Les champs qui ne s'ajoutent pas : une période, un seuil ou un rayon. La valeur la plus forte l'emporte. */
const STRONGEST = ['recallEvery', 'flaskRefillEvery', 'beaconPulse', 'gemsPerHeal'] as const;

/**
 * Cumule des modificateurs venus d'une autre source (les talents sur la Lanterne) : les multiplicateurs se
 * multiplient, les vrais l'emportent, les périodes gardent la plus courte, le reste s'ajoute.
 */
export function stackMods(base: RunMods, add: RunModsRaw): RunMods {
  const out: RunMods = { ...base };
  const o = out as unknown as Record<string, number | boolean>;
  for (const [key, value] of Object.entries(add) as Array<[keyof RunMods, number | boolean | undefined]>) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') o[key] = (o[key] as boolean) || value;
    else if ((MULTIPLIERS as readonly string[]).includes(key)) o[key] = (o[key] as number) * value;
    else if ((STRONGEST as readonly string[]).includes(key)) o[key] = (o[key] as number) > 0 ? Math.min(o[key] as number, value) : value;
    else if (key === 'fogResist' || key === 'lowHpShare' || key === 'firstReviveShare') o[key] = Math.max(o[key] as number, value);
    else o[key] = (o[key] as number) + value;
  }
  return out;
}
