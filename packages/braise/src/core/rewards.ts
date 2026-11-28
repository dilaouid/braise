import type { Run } from './types.ts';

/** Le résultat d'une expédition, tel que l'affiche l'écran de fin. */
export interface RunResult {
  outcome: 'victory' | 'death' | 'abandon';
  seed: number;
  regionId: string;
  classId: string;
  vigil: number;
  seconds: number;
  runLevel: number;
  kills: number;
  elites: number;
  bossKills: number;
  gems: number;
  braziers: number;
  evolutions: number;
  /** L'or qui restait à la fin : il ne sert qu'aux marchands et ne quitte pas la partie. */
  goldLeft: number;
  /** Or dépensé chez les marchands. */
  goldSpent: number;
  ashesCollected: number;
  ashesKept: number;
  /** Cendres de hâte, déjà comprises dans `ashesCollected` : la cloche sonnée avant la fin de la Nuit. */
  haste: number;
  heroXp: number;
  damageByWeapon: Array<{ id: string; damage: number }>;
  killsByEnemy: Record<string, number>;
  /** Le souvenir ramassé dans l'arène, ou null. */
  memory: string | null;
  /** La Lanterne : la pièce ramenée ou perdue, les pièces posées au départ, et si c'était le boss reformé. */
  lantern: { kept: string | null; lost: string | null; placed: number; reborn: boolean };
}

/**
 * Les minutes qui paient les récompenses « par minute » : celles de la Nuit, plus celles qui restaient quand la
 * cloche a sonné. Une partie raccourcie par la cloche ne rapporte pas moins pour le temps.
 */
export function rewardMinutes(run: Run): number {
  return run.night + run.nightCredit;
}

/** Calcule les récompenses de fin d'expédition (document 02 §11 et document 05 §5). */
export function computeResult(run: Run): RunResult {
  const tuning = run.data.tuning;
  const hero = run.hero;
  const outcome = run.outcome ?? 'abandon';
  const v = run.cfg.vigil - 1;
  const minutes = rewardMinutes(run);
  const victory = outcome === 'victory';
  const bonus = victory ? tuning.victoryBonus : 1;
  const share = victory ? 1 : tuning.death.keptShare;
  const ashesCollected = Math.round((tuning.ashes.perMinute * minutes + hero.ashDrops) * (1 + 0.5 * v)) + run.haste;
  const rw = run.data.heroTuning.rewards;
  const heroXp = Math.round(
    (rw.perMinute * minutes + rw.perRunLevelSq * hero.level * hero.level + rw.perElite * hero.elites + rw.perBoss * hero.bossKills)
      * (1 + hero.stats.wisdom) * Math.pow(rw.vigilGrowth, v),
  );
  const piece = run.piece;
  const pieceId = piece ? run.data.lantern.pieces[piece.index]!.id : null;
  // Une pièce du boss, ou la première de toutes, n'a pas besoin d'avoir été ramassée.
  const pieceKept = victory && piece !== null && (piece.taken || piece.fromBoss || run.cfg.lantern?.guaranteed === true);
  const killsByEnemy: Record<string, number> = {};
  run.data.enemies.forEach((e, i) => {
    if (run.killsByKind[i]! > 0) killsByEnemy[e.id] = run.killsByKind[i]!;
  });
  return {
    outcome,
    seed: run.cfg.seed,
    regionId: run.cfg.regionId,
    classId: run.cfg.classId,
    vigil: run.cfg.vigil,
    seconds: run.time,
    runLevel: hero.level,
    kills: hero.kills,
    elites: hero.elites,
    bossKills: hero.bossKills,
    gems: hero.gems,
    braziers: run.braziersLit,
    evolutions: run.evolutions,
    goldLeft: hero.gold,
    goldSpent: hero.goldSpent,
    ashesCollected,
    ashesKept: Math.round(ashesCollected * bonus * share),
    haste: run.haste,
    heroXp,
    damageByWeapon: run.weapons
      .map((w) => ({ id: run.data.weapons[w.def]!.id, damage: Math.round(w.damageDone) }))
      .sort((a, b) => b.damage - a.damage),
    killsByEnemy,
    memory: victory && run.memoryTaken ? (run.cfg.memory ?? null) : null,
    lantern: {
      kept: pieceKept ? pieceId : null,
      lost: !victory && piece?.taken ? pieceId : null,
      placed: run.cfg.lantern?.placed ?? 0,
      reborn: run.cfg.reborn === true && run.region.rebornBossIdx >= 0 && run.region.bossIdx === run.region.rebornBossIdx,
    },
  };
}
