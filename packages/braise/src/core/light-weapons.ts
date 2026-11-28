import type { WeaponDef, WeaponParams } from '../content/index.ts';
import { hurtEnemy, isDust } from './combat.ts';
import { isLit, litRadius } from './light.ts';
import { effectiveCooldown } from './stats.ts';
import { emit, queryCircle } from './stores.ts';
import {
  EV, HIT_BURN, HIT_FREEZE, HIT_SHOCK, MAX_WEAPON_SLOTS, STEP, type Run, type Thread, type WeaponInstance,
} from './types.ts';
import { burstAt, weaponParams } from './weapons.ts';

const TAU = Math.PI * 2;

/** Les armes qui lisent la lumière ou la ruée : Lisière, Guet d'orage, Veilleuses, Sillage. */

/** Minuterie d'un Éteint pour l'arme de cet emplacement. */
function hitTimer(i: number, slot: number): number {
  return i * MAX_WEAPON_SLOTS + Math.min(slot, MAX_WEAPON_SLOTS - 1);
}

/** Distance d'un point au segment (x1, y1)–(x2, y2). */
function segmentDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2)) : 0;
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

/** Écrit dans `run.query` les ennemis dont le corps touche le segment épais. Renvoie leur nombre. */
function querySegment(run: Run, x1: number, y1: number, x2: number, y2: number, width: number): number {
  const e = run.enemies;
  const q = run.query;
  const n = queryCircle(run, (x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) / 2 + width / 2);
  let out = 0;
  for (let k = 0; k < n; k++) {
    const i = q[k]!;
    const reach = width / 2 + run.enemyRadius[e.kind[i]!]!;
    if (segmentDistance(e.x[i]!, e.y[i]!, x1, y1, x2, y2) <= reach) q[out++] = i;
  }
  return out;
}

/** Fait vieillir les Veilleuses et les fils. */
export function tickLights(run: Run, dt: number): void {
  for (let i = run.lamps.length - 1; i >= 0; i--) {
    const lamp = run.lamps[i]!;
    lamp.life -= dt;
    if (lamp.life <= 0) run.lamps.splice(i, 1);
  }
  for (let i = run.threads.length - 1; i >= 0; i--) {
    const t = run.threads[i]!;
    t.life -= dt;
    if (t.life <= 0) {
      run.threads.splice(i, 1);
      snapThread(run, t);
    }
  }
}

/** Un fil qui se rompt au bout de sa vie éclate sur toute sa longueur, si son arme le sait. */
function snapThread(run: Run, t: Thread): void {
  const w = run.weapons[t.slot];
  if (!w) return;
  const def = run.data.weapons[w.def]!;
  if (def.behavior !== 'wake') return;
  const p = weaponParams(run, w);
  if (p.snapDamage <= 0) return;
  const zone = 1 + run.hero.stats.zone;
  const n = querySegment(run, t.x1, t.y1, t.x2, t.y2, p.width * 2.4 * zone);
  // Copiée : un coup peut tuer, et une mort relance des recherches.
  const hit = run.query.slice(0, n);
  const flags = p.shock ? HIT_SHOCK : 0;
  for (const i of hit) hurtEnemy(run, i, p.snapDamage, def.damageType, def.scale, t.slot, flags);
  const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
  const bursts = Math.max(2, Math.round(len / 40));
  for (let k = 0; k <= bursts; k++) {
    const u = k / bursts;
    emit(run, EV.burst, t.x1 + (t.x2 - t.x1) * u, t.y1 + (t.y2 - t.y1) * u, p.width * 1.2 * zone, def.damageType);
  }
}

// ───────────────────────────── bord de la lumière (Lisière) ─────────────────────────────

export function updateVerge(run: Run, slot: number, def: WeaponDef, p: WeaponParams): void {
  const hero = run.hero;
  const e = run.enemies;
  const lit = litRadius(run);
  const half = (p.band / 2) * (1 + hero.stats.zone);
  const missing = Math.max(0, 1 - hero.stats.glow / run.data.tuning.hero.glow);
  const damage = p.damage * (1 + p.bite * missing);
  const n = queryCircle(run, hero.x, hero.y, lit + half);
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    const c = hitTimer(i, slot);
    if (e.hitCd[c]! > 0) continue;
    const d = Math.hypot(e.x[i]! - hero.x, e.y[i]! - hero.y);
    const reach = half + run.enemyRadius[e.kind[i]!]!;
    let touched = false;
    for (let r = 1; r <= p.rings && !touched; r++) touched = Math.abs(d - (lit * r) / p.rings) <= reach;
    if (!touched) continue;
    e.hitCd[c] = p.hitInterval;
    if (hurtEnemy(run, i, damage, def.damageType, def.scale, slot, p.freeze ? HIT_FREEZE : 0) > 0) emit(run, EV.frost, e.x[i]!, e.y[i]!);
  }
}

// ───────────────────────────── éclair dans le noir (Guet d'orage) ─────────────────────────────

/** L'ennemi vivant le plus proche de (x, y), hors de `skip`, et dans le noir si `dark`. -1 : aucun. */
function strikable(run: Run, x: number, y: number, range: number, skip: number[], dark: boolean): number {
  const e = run.enemies;
  const n = queryCircle(run, x, y, range);
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d >= bestD || skip.includes(i) || isDust(run, i) || (dark && isLit(run, e.x[i]!, e.y[i]!))) continue;
    bestD = d;
    best = i;
  }
  return best;
}

/** L'éclat d'un éclair à l'impact : les Éteints autour de la cible, dans le noir comme dans la lumière, prennent une part du coup. */
function splashBolt(run: Run, target: number, x: number, y: number, radius: number, damage: number, def: WeaponDef, slot: number, flags: number): void {
  const e = run.enemies;
  const n = queryCircle(run, x, y, radius);
  // Copiée : un coup peut tuer, et une mort peut relancer une recherche.
  const near: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    if (i === target || e.hp[i]! <= 0 || isDust(run, i)) continue;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    if (dx * dx + dy * dy <= radius * radius) near.push(i);
  }
  for (const i of near) hurtEnemy(run, i, damage, def.damageType, def.scale, slot, flags);
  emit(run, EV.burst, x, y, radius, def.damageType);
}

export function updateChain(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  if (w.cd > 0) return;
  const hero = run.hero;
  const e = run.enemies;
  const jumps = p.jumps + hero.stats.projectiles;
  const flags = p.shock ? HIT_SHOCK : 0;
  const firsts: number[] = [];
  for (let b = 0; b < p.count; b++) {
    // Choisie éclair par éclair : celui d'avant a pu tuer la cible suivante.
    const first = strikable(run, hero.x, hero.y, p.range, firsts, true);
    if (first < 0) break;
    firsts.push(first);
    const seen: number[] = [];
    let target = first;
    for (let k = 0; target >= 0; k++) {
      const x = e.x[target]!;
      const y = e.y[target]!;
      const from = seen.length > 0 ? seen[seen.length - 1]! : -1;
      seen.push(target);
      hurtEnemy(run, target, p.damage, def.damageType, def.scale, slot, flags);
      // Le premier trait tombe du ciel (c : 1), les suivants partent de la cible d'avant ; un éclair qui éclate est épais (c : + 2).
      emit(run, EV.bolt, x, y, from >= 0 ? e.x[from]! : x, from >= 0 ? e.y[from]! : y, (from >= 0 ? 0 : 1) + (p.splash > 0 ? 2 : 0));
      if (p.splash > 0) splashBolt(run, target, x, y, p.splash * (1 + hero.stats.zone), p.damage * p.splashShare, def, slot, flags);
      if (k >= jumps) break;
      target = strikable(run, x, y, p.jumpRange, seen, !p.jumpsIntoLight);
    }
  }
  // Rien dans le noir : l'arme reste prête.
  if (firsts.length > 0) w.cd += effectiveCooldown(p.cooldown, hero.stats.cadence);
  else w.cd = 0;
}

// ───────────────────────────── lumières posées (Veilleuses) ─────────────────────────────

function placeLamps(run: Run, slot: number, w: WeaponInstance, p: WeaponParams): void {
  const hero = run.hero;
  const stats = hero.stats;
  const count = p.count + stats.projectiles;
  const life = p.life * (1 + stats.duration);
  const radius = p.radiusShare * litRadius(run) * (1 + stats.zone);
  const around = count - 1;
  for (let k = 0; k < count; k++) {
    const a = k > 0 ? w.angle + ((k - 1) * TAU) / around : 0;
    const d = k > 0 ? p.scatter : 0;
    run.lamps.push({ x: hero.x + Math.cos(a) * d, y: hero.y + Math.sin(a) * d, radius, life, maxLife: life, slot });
  }
  // Les poses suivantes tournent d'un demi-pas, pour ne pas se recouvrir.
  if (around > 0) w.angle = (w.angle + Math.PI / around) % TAU;
  if (run.lamps.length > p.max) run.lamps.splice(0, run.lamps.length - p.max);
}

export function updateLamp(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
    placeLamps(run, slot, w, p);
    emit(run, EV.lamp, run.hero.x, run.hero.y);
  }
  const e = run.enemies;
  const strike = (i: number, damage: number, flags: number): void => {
    const c = hitTimer(i, slot);
    if (e.hitCd[c]! > 0) return;
    e.hitCd[c] = p.hitInterval;
    hurtEnemy(run, i, damage, def.damageType, def.scale, slot, flags);
  };
  // Les fils d'abord : un Éteint sous le fil et la lumière prend le coup du fil.
  if (p.linkRange > 0) {
    for (let k = 1; k < run.lamps.length; k++) {
      const a = run.lamps[k - 1]!;
      const b = run.lamps[k]!;
      if (!lampsLinked(a, b, p.linkRange)) continue;
      const n = querySegment(run, a.x, a.y, b.x, b.y, p.linkWidth * (1 + run.hero.stats.zone));
      for (let q = 0; q < n; q++) strike(run.query[q]!, p.linkDamage, p.burn ? HIT_BURN : 0);
    }
  }
  for (const lamp of run.lamps) {
    const n = queryCircle(run, lamp.x, lamp.y, lamp.radius);
    for (let q = 0; q < n; q++) strike(run.query[q]!, p.damage, 0);
  }
}

/** Vrai si un fil de Guirlande tient entre ces deux Veilleuses. */
export function lampsLinked(a: { x: number; y: number }, b: { x: number; y: number }, range: number): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= range;
}

// ───────────────────────────── fil de ruée (Sillage) ─────────────────────────────

/** Fin de ruée : chaque Sillage porté tend un fil entre le départ et l'arrivée. */
export function layThreads(run: Run, x1: number, y1: number, x2: number, y2: number): void {
  for (let slot = 0; slot < run.weapons.length; slot++) {
    const w = run.weapons[slot]!;
    if (run.data.weapons[w.def]!.behavior !== 'wake') continue;
    const p = weaponParams(run, w);
    if (Math.hypot(x2 - x1, y2 - y1) < p.minLength) continue;
    const life = p.life * (1 + run.hero.stats.duration);
    run.threads.push({ x1, y1, x2, y2, life, maxLife: life, slot, fresh: true, zapT: 0 });
    if (run.threads.length > p.max) run.threads.splice(0, run.threads.length - p.max);
    emit(run, EV.thread, x2, y2);
  }
}

/** Marge aux bouts d'un fil : une ruée partie du bout de la précédente la touche sans la croiser. */
const END_MARGIN = 1e-3;

/** Le point où deux fils se croisent, hors de leurs bouts, ou null. */
function crossing(a: Thread, b: Thread): { x: number; y: number } | null {
  const ax = a.x2 - a.x1;
  const ay = a.y2 - a.y1;
  const bx = b.x2 - b.x1;
  const by = b.y2 - b.y1;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-6) return null;
  const ox = b.x1 - a.x1;
  const oy = b.y1 - a.y1;
  const t = (ox * by - oy * bx) / det;
  const u = (ox * ay - oy * ax) / det;
  if (t < END_MARGIN || t > 1 - END_MARGIN || u < END_MARGIN || u > 1 - END_MARGIN) return null;
  return { x: a.x1 + ax * t, y: a.y1 + ay * t };
}

export function updateWake(run: Run, slot: number, def: WeaponDef, p: WeaponParams): void {
  const e = run.enemies;
  const flags = p.shock ? HIT_SHOCK : 0;
  const zone = 1 + run.hero.stats.zone;
  for (let k = 0; k < run.threads.length; k++) {
    const t = run.threads[k]!;
    if (t.slot !== slot) continue;
    if (t.fresh) {
      // Un fil neuf éclate sur ceux qu'il croise : une fois par paire, au moment où il est tendu.
      t.fresh = false;
      for (let o = 0; o < k && p.crossRadius > 0; o++) {
        const at = crossing(t, run.threads[o]!);
        if (!at) continue;
        burstAt(run, at.x, at.y, p.crossRadius * zone, p.crossDamage, def, slot, flags);
        emit(run, EV.threadCross, at.x, at.y, p.crossRadius * zone);
      }
    }
    const n = querySegment(run, t.x1, t.y1, t.x2, t.y2, p.width * zone);
    for (let q = 0; q < n; q++) {
      const i = run.query[q]!;
      const c = hitTimer(i, slot);
      if (e.hitCd[c]! > 0) continue;
      e.hitCd[c] = p.hitInterval;
      hurtEnemy(run, i, p.damage, def.damageType, def.scale, slot, flags);
    }
    if (p.zapEvery > 0) zapFromThread(run, t, slot, def, p, flags, zone);
  }
}

const zapped: number[] = [];

/** Le fil crépite : à son rythme, il lance des éclairs aux Éteints les plus proches de lui, depuis le point du fil le plus près. */
function zapFromThread(run: Run, t: Thread, slot: number, def: WeaponDef, p: WeaponParams, flags: number, zone: number): void {
  t.zapT -= STEP;
  if (t.zapT > 0) return;
  t.zapT += p.zapEvery;
  const e = run.enemies;
  const range = p.zapRange * zone;
  const dx = t.x2 - t.x1;
  const dy = t.y2 - t.y1;
  const len2 = dx * dx + dy * dy || 1;
  zapped.length = 0;
  for (let z = 0; z < p.zapCount; z++) {
    // Le plus proche du fil parmi ceux pas encore frappés par ce crépitement.
    const n = querySegment(run, t.x1, t.y1, t.x2, t.y2, range * 2);
    let best = -1;
    let bestD = Infinity;
    for (let q = 0; q < n; q++) {
      const i = run.query[q]!;
      if (zapped.includes(i) || e.hp[i]! <= 0 || isDust(run, i)) continue;
      const d = segmentDistance(e.x[i]!, e.y[i]!, t.x1, t.y1, t.x2, t.y2);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    zapped.push(best);
    const x = e.x[best]!;
    const y = e.y[best]!;
    const u = Math.max(0, Math.min(1, ((x - t.x1) * dx + (y - t.y1) * dy) / len2));
    emit(run, EV.bolt, x, y, t.x1 + dx * u, t.y1 + dy * u, p.snapDamage > 0 ? 2 : 0);
    hurtEnemy(run, best, p.zapDamage, def.damageType, def.scale, slot, flags);
  }
}
