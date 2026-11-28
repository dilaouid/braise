import type { EnemyDef } from '../content/index.ts';
import { spawnEnemy } from './combat.ts';
import { isSolidAt } from './map.ts';
import { startTide } from './marsh.ts';
import { addTelegraph, emit, fireEnemyShot } from './stores.ts';
import { EV, TFX_MIRE, TFX_PUDDLE, TFX_PULL, TG_ARC, TG_CIRCLE, TG_LINE, TG_RING, type Run } from './types.ts';

const TAU = Math.PI * 2;

/** Les attaques de la Dame de Vase, dans l'ordre de ses clips d'annonce. */
export const L_HANDS = 0;
export const L_SWEEP = 1;
export const L_LANTERNS = 2;
export const L_DIVE = 3;
export const L_EMBRACE = 4;
export const L_TIDE = 5;
export const L_SCREAM = 6;
/** Ce qu'elle peut tirer à chaque phase : elle plonge et étreint à partir de la deuxième. La marée et le cri sont imposés. */
const LADY_POOLS = [
  [L_HANDS, L_SWEEP, L_LANTERNS],
  [L_HANDS, L_SWEEP, L_LANTERNS, L_DIVE, L_EMBRACE],
  [L_HANDS, L_SWEEP, L_LANTERNS, L_DIVE, L_EMBRACE],
];
/** En phase 3, certaines attaques en appellent une autre sans souffle : elle resurgit et les mains suivent, elle étreint et balaie. */
const LADY_CHAIN = [-1, -1, -1, L_HANDS, L_SWEEP, -1, -1];

/** Ses états. */
export const LS_IDLE = 0;
const LS_WAIT = 1;
const LS_HANDS = 3;
export const LS_DIVE = 4;
export const LS_SURGE = 5;
/** Son arrivée : sous l'eau, puis elle se lève. */
export const LS_EMERGE = 6;

/** Combien de temps avant son coup elle prend la pose, et combien de temps elle la tient (jusqu'au coup, ou presque). */
export const LADY_TELL = 0.6;
export const LADY_POSE = [1.5, 1.3, 1.5, 1.1, 1.3, 1.9, 1.7];
/** La fin de son arrivée, où on la voit sortir de l'eau. */
export const LADY_RISE = 1.3;
/**
 * Elle se tient à côté de Moon, un peu au-dessus, du côté où elle est déjà : ses coups portent loin, et la caméra,
 * centrée sur Moon, la voit en entier (son image fait 176 px de haut).
 */
export const LADY_SIDE = 120;
export const LADY_ABOVE = 16;

/** La place qu'elle cherche : à côté de Moon, du côté où elle se trouve. */
export function ladySpot(heroX: number, heroY: number, ladyX: number, out: { x: number; y: number }): void {
  out.x = heroX + (ladyX < heroX ? -LADY_SIDE : LADY_SIDE);
  out.y = heroY - LADY_ABOVE;
}

function ladyPick(run: Run, phase: number): number {
  const pool = LADY_POOLS[phase - 1]!;
  const attack = pool[Math.floor(run.rngSpawn.float() * pool.length)]!;
  return attack === run.director.bossLast ? pool[(pool.indexOf(attack) + 1) % pool.length]! : attack;
}

function tele(run: Run, base: number, haste: number): number {
  return Math.max(run.data.tuning.boss.minTelegraph, base * haste);
}

/** Ramène un point dans l'arène, à `margin` du bord. */
function intoArena(run: Run, x: number, y: number, margin: number, out: { x: number; y: number }): void {
  const d = run.director;
  const dx = x - d.arenaX;
  const dy = y - d.arenaY;
  const dist = Math.hypot(dx, dy);
  const max = d.arenaR - margin;
  if (dist > max && dist > 0) {
    out.x = d.arenaX + (dx / dist) * max;
    out.y = d.arenaY + (dy / dist) * max;
  } else {
    out.x = x;
    out.y = y;
  }
}

const spot = { x: 0, y: 0 };

/** Le cortège : des Noyés sortent de l'eau au bord de l'arène. */
function summonCortege(run: Run, def: EnemyDef): void {
  const d = run.director;
  const sm = def.summon!;
  const start = run.rngSpawn.float() * TAU;
  // Le cortège grossit à chaque phase.
  const count = sm.count + (d.bossPhase - 1) * 3;
  for (let k = 0; k < count; k++) {
    const a = start + (k * TAU) / count;
    const x = d.arenaX + Math.cos(a) * (d.arenaR - 34);
    const y = d.arenaY + Math.sin(a) * (d.arenaR - 34);
    if (!isSolidAt(run.map, x, y)) spawnEnemy(run, def.summonIndex, x, y, run.hpScaleNow);
  }
}

/**
 * La gerbe de vase : quoi qu'elle fasse, les lanternes de ses cheveux crachent un anneau de boules de vase à son rythme.
 * Chaque anneau est tourné par rapport au précédent : une spirale lente qu'il faut lire pour passer entre les boules.
 * En phase 3, un second anneau suit, décalé d'une demi-maille.
 */
function spray(run: Run, i: number, def: EnemyDef, phase: number, dt: number): void {
  const dir = run.director;
  const sp = def.spray!;
  dir.bossSprayT -= dt;
  if (dir.bossSprayT > 0) return;
  dir.bossSprayT = sp.every[phase - 1]!;
  const e = run.enemies;
  const n = sp.shots[phase - 1]!;
  const rings = phase === 3 ? 2 : 1;
  const x = e.x[i]!;
  const y = e.y[i]! - 70;
  for (let r = 0; r < rings; r++) {
    const start = dir.bossSprayA + (r * Math.PI) / n;
    const speed = sp.speed * (1 - r * 0.25);
    for (let k = 0; k < n; k++) {
      const a = start + (k * TAU) / n;
      fireEnemyShot(run, e.kind[i]!, x, y, Math.cos(a), Math.sin(a), speed, sp.damage, sp.radius, sp.life);
    }
  }
  dir.bossSprayA += sp.turn;
}

/** Fin d'une attaque : elle souffle, moins longtemps à chaque phase, ou enchaîne en phase 3. */
function ladyRecover(run: Run, i: number, def: EnemyDef, attack: number): void {
  const e = run.enemies;
  const dir = run.director;
  const phase = dir.bossPhase;
  e.state[i] = LS_IDLE;
  dir.bossTellT = -1;
  if (dir.bossNext === L_SCREAM) {
    e.timer2[i] = 0.2;
    return;
  }
  const chained = phase === 3 && dir.bossNext < 0 ? LADY_CHAIN[attack] ?? -1 : -1;
  if (chained >= 0) {
    dir.bossNext = chained;
    e.timer2[i] = 0.35;
    return;
  }
  e.timer2[i] = def.pauses![phase - 1]!;
  // Dans le silence entre deux coups, on l'entend chanter.
  if (attack !== L_SCREAM) emit(run, EV.bossHum, e.x[i]!, e.y[i]!);
}

function ladyStart(run: Run, i: number, def: EnemyDef, attack: number, dx: number, dy: number, haste: number): void {
  const e = run.enemies;
  const dir = run.director;
  const hero = run.hero;
  const x = e.x[i]!;
  const y = e.y[i]!;
  const uid = e.uid[i]!;
  const kind = e.kind[i]!;
  const phase = dir.bossPhase;
  const scale = run.dmgScaleFlat;
  dir.bossLast = attack;
  switch (attack) {
    case L_HANDS: {
      e.state[i] = LS_HANDS;
      e.counter[i] = def.hands!.count + (phase - 1) * 2;
      e.timer[i] = 0.1;
      break;
    }
    case L_SWEEP: {
      // Le voile balaie devant elle ; puis derrière, là où l'on s'était réfugié ; en phase 3, devant encore, plus loin.
      const sw = def.sweep!;
      const a = Math.atan2(dy, dx);
      const t = tele(run, sw.telegraph, haste);
      const dmg = sw.damage * scale;
      addTelegraph(run, TG_ARC, x, y, a, sw.radius, sw.arc / 2, t, dmg, uid, kind);
      let total = t;
      if (phase >= 2) {
        addTelegraph(run, TG_ARC, x, y, a + Math.PI, sw.radius, sw.arc / 2, t, dmg, uid, kind, sw.gap);
        total += sw.gap;
      }
      if (phase === 3) {
        addTelegraph(run, TG_ARC, x, y, a, sw.radius * 1.2, sw.arc / 2, t, dmg, uid, kind, sw.gap * 2);
        total += sw.gap;
      }
      e.state[i] = LS_WAIT;
      e.timer[i] = total + 0.25;
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    case L_LANTERNS: {
      // Des lanternes noyées retombent autour de Moon : la première sur lui, la deuxième là où il va, les autres autour.
      // Chacune frappe et laisse sa vase.
      const ln = def.lanterns!;
      const n = ln.count + (phase - 1) * 2;
      const t = tele(run, ln.telegraph, haste);
      const dmg = ln.damage * scale;
      for (let k = 0; k < n; k++) {
        let px = hero.x;
        let py = hero.y;
        if (k === 1 && hero.moving) {
          px += hero.faceX * ln.lead;
          py += hero.faceY * ln.lead;
        } else if (k > 0) {
          const a = run.rngSpawn.float() * TAU;
          const r = 44 + run.rngSpawn.float() * ln.scatter;
          px += Math.cos(a) * r;
          py += Math.sin(a) * r;
        }
        intoArena(run, px, py, ln.radius, spot);
        addTelegraph(run, TG_CIRCLE, spot.x, spot.y, 0, ln.radius, ln.radius, t, dmg, uid, kind, k * ln.stagger, TFX_PUDDLE, ln.mire.duration, ln.mire.radius);
      }
      e.state[i] = LS_WAIT;
      e.timer[i] = t + n * ln.stagger + 0.2;
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    case L_DIVE: {
      e.state[i] = LS_DIVE;
      e.timer[i] = def.dive!.seconds;
      e.status[i] = 0;
      dir.bossHidden = true;
      emit(run, EV.bossDive, x, y);
      break;
    }
    case L_EMBRACE: {
      // Ses bras s'allongent : touché, Moon est tiré contre elle, là où le sol va se soulever.
      const em = def.embrace!;
      const slam = def.slam!;
      const a = Math.atan2(dy, dx);
      const t = tele(run, em.telegraph, haste);
      addTelegraph(run, TG_LINE, x, y, a, em.length, em.width, t, em.damage * scale, uid, kind, 0, TFX_PULL, em.pull, em.slow);
      const t2 = tele(run, slam.telegraph, haste);
      addTelegraph(run, TG_CIRCLE, x, y, 0, slam.radius, slam.radius, t2, slam.damage * scale, uid, kind, t + 0.15);
      e.state[i] = LS_WAIT;
      e.timer[i] = t + 0.15 + t2 + 0.25;
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    case L_TIDE: {
      startTide(run, def);
      e.state[i] = LS_WAIT;
      e.timer[i] = 1.7;
      break;
    }
    default: {
      // Le cri d'un changement de phase : le voile se lève, l'eau se soulève tout autour d'elle, et le cortège sort.
      dir.bossNext = -1;
      const slam = def.slam!;
      const r = slam.radius * 1.5;
      addTelegraph(run, TG_CIRCLE, x, y, 0, r, r, 1.1, slam.damage * scale, uid, kind);
      e.state[i] = LS_WAIT;
      e.timer[i] = 1.6;
      dir.bossSummonT = 0.9;
      // En phase 3, la marée suit le cri.
      if (phase === 3) dir.tideCd = 2.2;
      emit(run, EV.telegraph, x, y, 2);
    }
  }
}

/**
 * La Dame de Vase. Elle dérive vers Moon sans jamais courir : ses coups portent loin. Trois phases, à deux tiers et un tiers de sa vie.
 * Elle ne se laisse pas distancer, et ses mains et ses lanternes visent là où va Moon.
 * Phase 1 : les mains de vase, le balayage du voile, les lanternes noyées. Phase 2 : elle plonge et resurgit, elle étreint,
 * le cortège des Noyés sort de l'eau. Phase 3 : la marée, et les enchaînements.
 */
export function updateLady(run: Run, i: number, dx: number, dy: number, dist: number, speed: number, dt: number): void {
  const e = run.enemies;
  const dir = run.director;
  const hero = run.hero;
  const def = run.data.enemies[e.kind[i]!]!;
  const state = e.state[i]!;
  if (state === LS_EMERGE) {
    // L'arène s'est refermée et il n'y a personne : l'eau frémit, puis elle se lève.
    e.timer[i]! -= dt;
    dir.bossHidden = e.timer[i]! > LADY_RISE;
    if (e.timer[i]! <= 0) {
      dir.bossHidden = false;
      e.state[i] = LS_IDLE;
      e.timer2[i] = 1.6;
      emit(run, EV.bossSurge, e.x[i]!, e.y[i]!, 1);
    }
    return;
  }
  const frac = e.hp[i]! / e.maxHp[i]!;
  const phases = def.phases!;
  const phase = frac > phases[0]! ? 1 : frac > phases[1]! ? 2 : 3;
  if (phase !== dir.bossPhase) {
    dir.bossPhase = phase;
    emit(run, EV.bossPhase, e.x[i]!, e.y[i]!, phase);
    dir.bossNext = L_SCREAM;
    if (state === LS_IDLE) e.timer2[i] = Math.min(e.timer2[i]!, 0.2);
  }
  const haste = phase === 3 ? (def.phase3Haste ?? 1) : 1;
  if (!dir.bossHidden) {
    dir.bossSummonT -= dt;
    if (dir.bossSummonT <= 0) {
      dir.bossSummonT = def.summon!.cooldown;
      summonCortege(run, def);
    }
    if (def.spray && state !== LS_SURGE) spray(run, i, def, phase, dt);
  }
  if (phase === 3 && !dir.tide) {
    dir.tideCd -= dt;
    if (dir.tideCd <= 0 && dir.bossNext < 0) dir.bossNext = L_TIDE;
  }
  if (dir.bossTellT >= 0) {
    dir.bossTellT += dt;
    if (dir.bossTellT > (LADY_POSE[dir.bossTell >= 0 ? dir.bossTell : dir.bossLast] ?? 1.3)) dir.bossTellT = -1;
  }

  if (state === LS_IDLE) {
    // Elle dérive vers sa place, à côté de Moon ; distancée, elle glisse sur l'eau plus vite qu'il ne court.
    ladySpot(hero.x, hero.y, e.x[i]!, spot);
    const tx = spot.x - e.x[i]!;
    const ty = spot.y - e.y[i]!;
    const td = Math.hypot(tx, ty);
    if (td > 4) {
      const glide = def.glide && td > def.glide.range ? def.glide.speed / def.speed : 1;
      const step = Math.min(td, speed * glide);
      e.x[i]! += (tx / td) * step;
      e.y[i]! += (ty / td) * step;
    }
    e.timer2[i]! -= dt;
    if (e.timer2[i]! <= LADY_TELL) {
      const want = dir.bossNext >= 0 ? dir.bossNext : dir.bossTell >= 0 ? dir.bossTell : ladyPick(run, phase);
      if (want !== dir.bossTell) {
        dir.bossTell = want;
        dir.bossTellT = 0;
      }
    }
    if (e.timer2[i]! <= 0) {
      const attack = dir.bossTell;
      dir.bossTell = -1;
      if (attack === dir.bossNext) dir.bossNext = -1;
      ladyStart(run, i, def, attack, dx, dy, haste);
    }
  } else if (state === LS_HANDS) {
    // Une main sous Moon, puis une autre qui l'attend là où il va.
    const hands = def.hands!;
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) {
      const t = tele(run, hands.telegraph, haste);
      if (e.counter[i]! > 0) {
        e.counter[i]!--;
        e.timer[i] = hands.interval * haste;
        let tx = hero.x;
        let ty = hero.y;
        if ((e.counter[i]! & 1) === 1 && hero.moving) {
          tx += hero.faceX * 46;
          ty += hero.faceY * 46;
        }
        intoArena(run, tx, ty, 12, spot);
        addTelegraph(run, TG_CIRCLE, spot.x, spot.y, 0, hands.radius, hands.radius, t, hands.damage * run.dmgScaleFlat, e.uid[i]!, e.kind[i]!, 0, TFX_MIRE, hands.slow);
        emit(run, EV.handRise, spot.x, spot.y, t, hands.radius);
      } else {
        e.state[i] = LS_WAIT;
        e.timer[i] = t * 0.7;
      }
    }
  } else if (state === LS_DIVE) {
    // Sous l'eau, elle suit Moon plus vite qu'il ne marche. Puis l'eau se bombe : elle va sortir là.
    const dv = def.dive!;
    const step = Math.min(dist, dv.speed * dt);
    if (dist > 6) {
      e.x[i]! += dx * step;
      e.y[i]! += dy * step;
    }
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) {
      const t = tele(run, dv.telegraph, haste);
      const dmg = dv.damage * run.dmgScaleFlat;
      const x = e.x[i]!;
      const y = e.y[i]!;
      addTelegraph(run, TG_CIRCLE, x, y, 0, dv.radius, dv.radius, t, dmg, e.uid[i]!, e.kind[i]!);
      for (let k = 0; k < dv.rings; k++) {
        addTelegraph(run, TG_RING, x, y, 0, dv.radius + k * dv.ringWidth, dv.radius + (k + 1) * dv.ringWidth, t, dmg * 0.7, e.uid[i]!, e.kind[i]!, (k + 1) * dv.stagger);
      }
      e.state[i] = LS_SURGE;
      e.timer[i] = t;
      emit(run, EV.telegraph, x, y, 2);
    }
  } else if (state === LS_SURGE) {
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) {
      const dv = def.dive!;
      dir.bossHidden = false;
      emit(run, EV.bossSurge, e.x[i]!, e.y[i]!, 0);
      e.state[i] = LS_WAIT;
      e.timer[i] = dv.rings * dv.stagger + 0.35;
    }
  } else {
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) ladyRecover(run, i, def, dir.bossLast);
  }

  // Elle reste dans l'arène.
  const ax = e.x[i]! - dir.arenaX;
  const ay = e.y[i]! - dir.arenaY;
  const ad = Math.hypot(ax, ay);
  const max = dir.arenaR - 24;
  if (ad > max) {
    e.x[i] = dir.arenaX + (ax / ad) * max;
    e.y[i] = dir.arenaY + (ay / ad) * max;
  }
}
