import type { Run } from './types.ts';

/**
 * Le journal des parties : la même fiche pour une partie jouée à la main et pour une partie du robot,
 * pour comparer les deux au lieu de croire le robot sur parole.
 *
 * Le suivi vit hors de la partie (`JournalTrack`) : il ne fait que lire l'état après chaque pas,
 * sans rien changer à la simulation ni à son empreinte.
 */

/** Une minute de partie. */
export interface JournalMinute {
  /** La minute, à partir de 0 (0 : de 0:00 à 0:59). La dernière peut être incomplète. */
  m: number;
  level: number;
  hp: number;
  maxHp: number;
  /** Dégâts subis et coups reçus pendant cette minute. */
  hurt: number;
  hits: number;
  kills: number;
  /** Ennemis vivants à la fin de la minute. */
  alive: number;
  /** Les armes portées à la fin de la minute, « identifiant:niveau ». */
  weapons: string[];
  /** L'heure de la Nuit à la fin de la minute, en minutes (à une décimale). */
  night: number;
}

/** Le combat de boss, s'il a eu lieu. */
export interface JournalBoss {
  id: string;
  /** Le temps de partie où il est apparu, en secondes. */
  at: number;
  hpMax: number;
  /** Ses points de vie à la fin de la partie (0 s'il est battu). */
  hpLeft: number;
  /** Durée du combat jusqu'à sa chute, ou jusqu'à la fin de la partie. */
  seconds: number;
  heroHpStart: number;
  hurt: number;
  hits: number;
  hurtBy: Record<string, number>;
}

export interface JournalEntry {
  v: 1;
  /** « joueur », ou « robot:<nom> ». */
  source: string;
  /** Vrai si un outil de mise au point a joué à la place du joueur pendant la partie. */
  assisted: boolean;
  date: string;
  /** Le commit du jeu, suivi de « + » si la copie de travail avait des changements. */
  build: string;
  seed: number;
  region: string;
  classId: string;
  vigil: number;
  reborn: boolean;
  heroLevel: number;
  altarRanks: number;
  talentRanks: number;
  lanternPlaced: number;
  outcome: 'victory' | 'death' | 'abandon';
  seconds: number;
  runLevel: number;
  kills: number;
  elites: number;
  evolutions: number;
  flames: number;
  /** L'ennemi qui a porté le dernier coup (null : victoire, abandon, ou dégâts sans source). */
  killer: string | null;
  hurt: number;
  hits: number;
  hurtBy: Record<string, number>;
  /** Ce que le joueur a déclenché : ruées, fioles, compétences, ultimes. */
  actions: { dashes: number; flasks: number; skills: number; ultimates: number };
  weapons: Array<{ id: string; level: number; damage: number }>;
  minutes: JournalMinute[];
  boss: JournalBoss | null;
  /** Qui a fait venir le boss : la cloche, la Nuit, ou personne. */
  bossCall: 'bell' | 'night' | null;
  /** L'heure de la Nuit à l'arrivée du boss, en minutes (à une décimale). */
  nightAtBoss: number | null;
  /** Cendres de hâte gagnées en sonnant la cloche. */
  haste: number;
}

/** Ce que la partie ne garde pas elle-même, relevé pas à pas. */
export interface JournalTrack {
  assisted: boolean;
  hits: number;
  lastKind: number;
  dashes: number;
  flasks: number;
  skills: number;
  ultimates: number;
  minutes: JournalMinute[];
  /** Les valeurs du pas précédent, pour voir ce qui vient de changer. */
  prev: { hurt: number; dashT: number; flasks: number; skillCd: number; ultT: number; byKind: Float32Array };
  /** Le début de la minute en cours. */
  minute: { m: number; hurt: number; hits: number; kills: number };
  boss: { uid: number; kind: number; at: number; night: number; hpMax: number; hp: number; end: number; heroHp: number; hurt0: number; hits0: number; byKind0: Float32Array } | null;
}

/** Un suivi neuf, à créer avec la partie. */
export function newTrack(run: Run): JournalTrack {
  const hero = run.hero;
  return {
    assisted: false, hits: 0, lastKind: -1, dashes: 0, flasks: 0, skills: 0, ultimates: 0, minutes: [],
    prev: { hurt: hero.damageTaken, dashT: hero.dashT, flasks: hero.flasks, skillCd: hero.skillCd, ultT: hero.ultT, byKind: run.damageByKind.slice() },
    minute: { m: Math.floor(run.time / 60), hurt: hero.damageTaken, hits: 0, kills: hero.kills },
    boss: null,
  };
}

function closeMinute(run: Run, t: JournalTrack): void {
  const hero = run.hero;
  const w = t.minute;
  t.minutes.push({
    m: w.m, level: hero.level, hp: Math.round(Math.max(0, hero.hp)), maxHp: Math.round(hero.stats.maxHp),
    hurt: Math.round(hero.damageTaken - w.hurt), hits: t.hits - w.hits, kills: hero.kills - w.kills, alive: run.enemies.count,
    weapons: run.weapons.map((x) => `${run.data.weapons[x.def]!.id}:${x.level}`),
    night: Math.round(run.night * 10) / 10,
  });
}

/** À appeler après chaque pas de simulation. */
export function trackStep(run: Run, t: JournalTrack): void {
  const hero = run.hero;
  const p = t.prev;
  if (hero.damageTaken > p.hurt) {
    t.hits++;
    // Un coup par pas au plus (l'invulnérabilité suit) : la source est la sorte dont le total a monté.
    t.lastKind = -1;
    const by = run.damageByKind;
    for (let k = 0; k < by.length; k++) if (by[k]! > p.byKind[k]!) t.lastKind = k;
    p.byKind.set(by);
  }
  if (hero.dashT > 0 && p.dashT <= 0) t.dashes++;
  if (hero.flasks < p.flasks) t.flasks += p.flasks - hero.flasks;
  if (hero.skillCd > p.skillCd + 1e-6) t.skills++;
  if (hero.ultT > 0 && p.ultT <= 0) t.ultimates++;
  p.hurt = hero.damageTaken;
  p.dashT = hero.dashT;
  p.flasks = hero.flasks;
  p.skillCd = hero.skillCd;
  p.ultT = hero.ultT;

  const m = Math.floor(run.time / 60);
  if (m > t.minute.m) {
    closeMinute(run, t);
    t.minute = { m, hurt: hero.damageTaken, hits: t.hits, kills: hero.kills };
  }

  const d = run.director;
  if (d.bossSpawned && d.bossUid !== 0) {
    const e = run.enemies;
    let i = -1;
    for (let k = 0; k < e.count; k++) if (e.uid[k] === d.bossUid) i = k;
    if (!t.boss || t.boss.uid !== d.bossUid) {
      if (i < 0) return;
      // Le premier boss compte ; un boss reformé garde la fiche du premier.
      if (!t.boss) {
        t.boss = {
          uid: d.bossUid, kind: e.kind[i]!, at: run.time, night: run.night, hpMax: e.maxHp[i]!, hp: e.hp[i]!, end: -1,
          heroHp: hero.hp, hurt0: hero.damageTaken, hits0: t.hits, byKind0: run.damageByKind.slice(),
        };
      } else {
        t.boss.uid = d.bossUid;
        t.boss.kind = e.kind[i]!;
      }
    }
    const b = t.boss;
    if (b.end < 0) {
      b.hp = i >= 0 ? Math.max(0, e.hp[i]!) : 0;
      if (d.bossDead) {
        b.hp = 0;
        b.end = run.time;
      }
    }
  }
}

/** Ce que l'appelant sait et que la partie ignore. */
export interface JournalMeta {
  source: string;
  date: string;
  build: string;
  heroLevel: number;
  altarRanks: number;
  talentRanks: number;
}

function byKind(run: Run, now: Float32Array, base?: Float32Array): Record<string, number> {
  const out: Record<string, number> = {};
  run.data.enemies.forEach((def, k) => {
    const v = now[k]! - (base ? base[k]! : 0);
    if (v >= 0.5) out[def.id] = Math.round(v);
  });
  return out;
}

/** La fiche de la partie terminée. */
export function journalEntry(run: Run, t: JournalTrack, meta: JournalMeta): JournalEntry {
  const hero = run.hero;
  const outcome = run.outcome ?? (run.phase === 'victory' ? 'victory' : 'death');
  // La dernière minute, même incomplète.
  if (t.minutes.length === 0 || t.minutes[t.minutes.length - 1]!.m !== t.minute.m) closeMinute(run, t);
  const b = t.boss;
  return {
    v: 1, source: meta.source, assisted: t.assisted, date: meta.date, build: meta.build,
    seed: run.cfg.seed, region: run.cfg.regionId, classId: run.cfg.classId, vigil: run.cfg.vigil, reborn: run.cfg.reborn === true,
    heroLevel: meta.heroLevel, altarRanks: meta.altarRanks, talentRanks: meta.talentRanks, lanternPlaced: run.cfg.lantern?.placed ?? 0,
    outcome, seconds: Math.round(run.time * 10) / 10, runLevel: hero.level, kills: hero.kills, elites: hero.elites,
    evolutions: run.evolutions, flames: run.flames.length,
    killer: outcome === 'death' && t.lastKind >= 0 ? run.data.enemies[t.lastKind]!.id : null,
    hurt: Math.round(hero.damageTaken), hits: t.hits, hurtBy: byKind(run, run.damageByKind),
    actions: { dashes: t.dashes, flasks: t.flasks, skills: t.skills, ultimates: t.ultimates },
    weapons: run.weapons.map((w) => ({ id: run.data.weapons[w.def]!.id, level: w.level, damage: Math.round(w.damageDone) })),
    minutes: t.minutes,
    bossCall: run.bossCall,
    nightAtBoss: b ? Math.round(b.night * 10) / 10 : null,
    haste: run.haste,
    boss: b && {
      id: run.data.enemies[b.kind]!.id, at: Math.round(b.at * 10) / 10, hpMax: Math.round(b.hpMax), hpLeft: Math.round(b.hp),
      seconds: Math.round(((b.end >= 0 ? b.end : run.time) - b.at) * 10) / 10, heroHpStart: Math.round(b.heroHp),
      hurt: Math.round(hero.damageTaken - b.hurt0), hits: t.hits - b.hits0, hurtBy: byKind(run, run.damageByKind, b.byKind0),
    },
  };
}
