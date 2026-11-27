import { DMG_FIRE, type WeaponDef, type WeaponParams } from '../content/index.ts';
import { hurtEnemy, knockEnemy, stunEnemy, healHero } from './combat.ts';
import { tickLights, updateChain, updateLamp, updateVerge, updateWake } from './light-weapons.ts';
import { effectiveCooldown } from './stats.ts';
import { SHOT_HIT_MEMORY, emit, nearestEnemy, queryCircle, removeShot, removeZone } from './stores.ts';
import {
  CAP_SHOTS, CAP_ZONES, EV, HIT_BLEED, HIT_BURN, MAX_WEAPON_SLOTS, SHOT_HOMING, SHOT_LOB, SHOT_STRAIGHT, ZONE_PUDDLE, ZONE_TRAIL,
  type Run, type WeaponInstance,
} from './types.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Les noms de sprites de projectiles, par indice. */
export const SHOT_SPRITES = ['shot-spark', 'shot-arrow', 'shot-brand'] as const;

/** Les paramètres courants d'une arme portée. */
export function weaponParams(run: Run, w: WeaponInstance): WeaponParams {
  const def = run.data.weapons[w.def]!;
  return def.levels[Math.min(def.levels.length, w.level) - 1]!;
}

/** Donne une arme au héros. */
export function addWeapon(run: Run, def: number): WeaponInstance {
  const w: WeaponInstance = {
    def, level: 1, cd: 0.4, phase: 1, timer: 0, timer2: 0, angle: 0,
    burst: 0, burstT: 0, pending: 0, pendingT: 0, hitCount: 0, damageDone: 0, order: run.acquired++,
  };
  run.weapons.push(w);
  return w;
}

function addShot(
  run: Run, slot: number, kind: number, sprite: number, x: number, y: number, vx: number, vy: number,
  life: number, radius: number, pierce: number, dmg: number, flags: number,
): number {
  const s = run.shots;
  if (s.count >= CAP_SHOTS) return -1;
  const i = s.count++;
  s.x[i] = x; s.y[i] = y; s.px[i] = x; s.py[i] = y; s.vx[i] = vx; s.vy[i] = vy;
  s.life[i] = life; s.radius[i] = radius; s.pierce[i] = pierce; s.kind[i] = kind; s.slot[i] = slot;
  s.sprite[i] = sprite; s.tx[i] = 0; s.ty[i] = 0; s.t[i] = 0; s.hitN[i] = 0; s.dmg[i] = dmg; s.flags[i] = flags;
  return i;
}

/** Dégâts instantanés dans un cercle. Renvoie le nombre d'ennemis touchés. */
export function burstAt(run: Run, x: number, y: number, radius: number, damage: number, def: WeaponDef, slot: number, flags: number): number {
  const n = queryCircle(run, x, y, radius);
  for (let k = 0; k < n; k++) hurtEnemy(run, run.query[k]!, damage, def.damageType, def.scale, slot, flags);
  emit(run, EV.burst, x, y, radius, def.damageType);
  return n;
}

// ───────────────────────────── arc (Fauchée) ─────────────────────────────

function strikeArc(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, mirror: boolean): void {
  const hero = run.hero;
  const range = p.range * (1 + hero.stats.zone);
  const angle = Math.atan2(hero.aimY, hero.aimX);
  const half = (p.arc * DEG) / 2;
  const full = p.arc >= 360;
  const flags = p.bleed ? HIT_BLEED : 0;
  const e = run.enemies;
  const n = queryCircle(run, hero.x, hero.y, range);
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    const dx = e.x[i]! - hero.x;
    const dy = e.y[i]! - hero.y;
    if (!full) {
      const d = Math.hypot(dx, dy);
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      // Tolérance : un ennemi dont le cercle mord sur l'arc est touché.
      const tol = d > 1 ? Math.min(0.6, run.enemyRadius[e.kind[i]!]! / d) : Math.PI;
      if (Math.abs(diff) > half + tol) continue;
    }
    if (hurtEnemy(run, i, p.damage, def.damageType, def.scale, slot, flags) > 0) {
      knockEnemy(run, i, hero.x, hero.y, 26);
      if (p.healEvery > 0 && ++w.hitCount >= p.healEvery) {
        w.hitCount = 0;
        healHero(run, 1);
      }
    }
  }
  emit(run, EV.arc, hero.x, hero.y, angle, p.arc, range * (mirror ? -1 : 1));
}

function updateArc(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
    strikeArc(run, slot, w, def, p, false);
    w.pending = p.strikes - 1;
    w.pendingT = 0.2;
  }
  if (w.pending > 0) {
    w.pendingT -= dt;
    if (w.pendingT <= 0) {
      strikeArc(run, slot, w, def, p, true);
      w.pending--;
      w.pendingT = 0.2;
    }
  }
}

// ───────────────────────────── projectiles (Étincelles, Volée) ─────────────────────────────

/** Écrit dans `run.query` jusqu'à `count` ennemis parmi les plus proches du héros. Renvoie leur nombre. */
function nearestTargets(run: Run, range: number, count: number): number {
  const hero = run.hero;
  const e = run.enemies;
  const n = queryCircle(run, hero.x, hero.y, range);
  const q = run.query;
  const take = Math.min(count, n);
  // Sélection partielle : `count` est petit.
  for (let a = 0; a < take; a++) {
    let best = a;
    let bestD = Infinity;
    for (let b = a; b < n; b++) {
      const i = q[b]!;
      const dx = e.x[i]! - hero.x;
      const dy = e.y[i]! - hero.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    const tmp = q[a]!;
    q[a] = q[best]!;
    q[best] = tmp;
  }
  return take;
}

function fireProjectile(run: Run, slot: number, def: WeaponDef, p: WeaponParams, dirX: number, dirY: number): void {
  const hero = run.hero;
  const speed = p.speed * (1 + hero.stats.projectileSpeed);
  const sprite = Math.max(0, SHOT_SPRITES.indexOf(p.sprite as (typeof SHOT_SPRITES)[number]));
  addShot(
    run, slot, p.homing > 0 ? SHOT_HOMING : SHOT_STRAIGHT, sprite, hero.x + dirX * 8, hero.y + dirY * 8 - 6,
    dirX * speed, dirY * speed, p.range, p.radius, p.pierce, p.damage, p.burn ? HIT_BURN : 0,
  );
}

function fireVolley(run: Run, slot: number, def: WeaponDef, p: WeaponParams, count: number, index: number): boolean {
  const hero = run.hero;
  const e = run.enemies;
  if (def.aim === 'nearest') {
    const found = nearestTargets(run, p.range * 0.9, Math.max(1, count));
    if (found === 0) return false;
    // Les cibles sont recopiées : tirer ne doit pas dépendre du tampon de requête.
    for (let k = 0; k < count; k++) {
      const i = run.query[(k + index) % found]!;
      const dx = e.x[i]! - hero.x;
      const dy = e.y[i]! - (hero.y - 6);
      const d = Math.hypot(dx, dy) || 1;
      const jitter = (k >= found ? (k - found + 1) * 0.12 : 0) * (k % 2 === 0 ? 1 : -1);
      const a = Math.atan2(dy / d, dx / d) + jitter;
      fireProjectile(run, slot, def, p, Math.cos(a), Math.sin(a));
    }
  } else {
    const base = Math.atan2(hero.aimY, hero.aimX);
    for (let k = 0; k < count; k++) {
      const a = base + (k - (count - 1) / 2) * p.spread * DEG;
      fireProjectile(run, slot, def, p, Math.cos(a), Math.sin(a));
    }
  }
  emit(run, EV.shot, hero.x, hero.y, def.index);
  return true;
}

function updateProjectileWeapon(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  const count = p.count + run.hero.stats.projectiles;
  if (w.cd <= 0) {
    if (p.stagger > 0) {
      w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
      w.burst = count;
      w.burstT = 0;
    } else if (fireVolley(run, slot, def, p, count, 0)) {
      w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
    } else {
      // Aucune cible : l'arme reste prête.
      w.cd = 0.1;
    }
  }
  if (w.burst > 0) {
    w.burstT -= dt;
    while (w.burstT <= 0 && w.burst > 0) {
      fireVolley(run, slot, def, p, 1, w.burst);
      w.burst--;
      w.burstT += p.stagger;
    }
  }
}

// ───────────────────────────── orbites (Lucioles) ─────────────────────────────

const orb = { x: 0, y: 0 };

/** Nombre de lucioles d'une arme en orbite. */
export function orbCount(run: Run, w: WeaponInstance): number {
  return weaponParams(run, w).count;
}

/** Position de la luciole `k` (résultat dans un objet partagé, à lire tout de suite). */
export function orbPosition(run: Run, w: WeaponInstance, k: number, heroX = run.hero.x, heroY = run.hero.y): { x: number; y: number } {
  const p = weaponParams(run, w);
  const rings = Math.max(1, p.rings);
  const ring = k % rings;
  const perRing = Math.ceil(p.count / rings);
  const idx = Math.floor(k / rings);
  const radius = (p.radius + ring * p.ringGap) * (1 + run.hero.stats.zone);
  const dir = ring % 2 === 0 ? 1 : -1;
  const a = dir * w.angle + (idx / perRing) * TAU + ring * 0.6;
  orb.x = heroX + Math.cos(a) * radius;
  orb.y = heroY - 6 + Math.sin(a) * radius * 0.85;
  return orb;
}

function updateOrbit(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  const hero = run.hero;
  w.angle += (dt * TAU) / p.turnTime;
  if (w.angle > TAU * 64) w.angle -= TAU * 64;
  let active = true;
  if (p.pause > 0) {
    const on = p.active * (1 + hero.stats.duration);
    w.timer += dt;
    if (w.timer >= on + p.pause) w.timer -= on + p.pause;
    active = w.timer < on;
  }
  w.phase = active ? 1 : 0;
  if (!active) return;
  const e = run.enemies;
  const cdSlot = Math.min(slot, MAX_WEAPON_SLOTS - 1);
  for (let k = 0; k < p.count; k++) {
    const o = orbPosition(run, w, k);
    const ox = o.x;
    const oy = o.y;
    const n = queryCircle(run, ox, oy, p.orbRadius);
    for (let q = 0; q < n; q++) {
      const i = run.query[q]!;
      const c = i * MAX_WEAPON_SLOTS + cdSlot;
      if (e.hitCd[c]! > 0) continue;
      e.hitCd[c] = p.hitInterval;
      hurtEnemy(run, i, p.damage, def.damageType, def.scale, slot, 0);
    }
  }
  if (p.sparkEvery > 0) {
    w.timer2 -= dt;
    if (w.timer2 <= 0) {
      w.timer2 = p.sparkEvery;
      const target = nearestEnemy(run, hero.x, hero.y, 280);
      if (target >= 0) {
        const dx = e.x[target]! - hero.x;
        const dy = e.y[target]! - hero.y;
        const d = Math.hypot(dx, dy) || 1;
        addShot(run, slot, SHOT_STRAIGHT, 0, hero.x, hero.y - 6, (dx / d) * 260, (dy / d) * 260, 320, 4, 1, p.sparkDamage, 0);
      }
    }
  }
}

// ───────────────────────────── lobés (Brandon) ─────────────────────────────

function updateLob(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
  const hero = run.hero;
  const e = run.enemies;
  const count = p.count + hero.stats.projectiles;
  const rng = run.rngCombat;
  for (let k = 0; k < count; k++) {
    const n = queryCircle(run, hero.x, hero.y, 230);
    let tx: number;
    let ty: number;
    if (n > 0) {
      const i = run.query[rng.int(n)]!;
      tx = e.x[i]!;
      ty = e.y[i]!;
    } else {
      const a = rng.float() * TAU;
      const d = 40 + rng.float() * 80;
      tx = hero.x + Math.cos(a) * d;
      ty = hero.y + Math.sin(a) * d;
    }
    const flight = p.flight * (1 + k * 0.18);
    const s = addShot(run, slot, SHOT_LOB, 2, hero.x, hero.y - 6, (tx - hero.x) / flight, (ty - (hero.y - 6)) / flight, flight, 0, 0, p.damage, p.burn ? HIT_BURN : 0);
    if (s >= 0) {
      run.shots.tx[s] = tx;
      run.shots.ty[s] = ty;
      run.shots.t[s] = flight;
    }
  }
  emit(run, EV.shot, hero.x, hero.y, def.index);
}

function landLob(run: Run, s: number): void {
  const shots = run.shots;
  const slot = shots.slot[s]!;
  const w = run.weapons[slot];
  if (!w) return;
  const def = run.data.weapons[w.def]!;
  const p = weaponParams(run, w);
  const stats = run.hero.stats;
  const x = shots.tx[s]!;
  const y = shots.ty[s]!;
  burstAt(run, x, y, p.impactRadius * (1 + stats.zone), shots.dmg[s]!, def, slot, shots.flags[s]!);
  emit(run, EV.lobLand, x, y, p.impactRadius * (1 + stats.zone));
  const z = run.zones;
  if (p.puddleDuration > 0 && z.count < CAP_ZONES) {
    const i = z.count++;
    z.x[i] = x; z.y[i] = y;
    z.radius[i] = p.puddleRadius * (1 + stats.zone);
    z.life[i] = p.puddleDuration * (1 + stats.duration);
    z.maxLife[i] = z.life[i]!;
    z.interval[i] = p.puddleTick; z.tick[i] = p.puddleTick;
    z.damage[i] = p.puddleDamage; z.grow[i] = p.puddleGrow;
    z.slot[i] = slot; z.kind[i] = ZONE_PUDDLE; z.flags[i] = shots.flags[s]!;
  }
}

// ───────────────────────────── ondes (Marteau du foyer) ─────────────────────────────

function novaWave(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams): void {
  const hero = run.hero;
  const e = run.enemies;
  const radius = p.radius * (1 + hero.stats.zone);
  const n = queryCircle(run, hero.x, hero.y, radius);
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    if (hurtEnemy(run, i, p.damage, def.damageType, def.scale, slot, 0) > 0) {
      knockEnemy(run, i, hero.x, hero.y, p.knockback);
      if (p.stun > 0) stunEnemy(run, i, p.stun);
    }
  }
  emit(run, EV.nova, hero.x, hero.y, radius, def.damageType);
  if (p.fissures > 0) {
    // Des fissures partent en étoile ; elles tournent d'un demi-pas à chaque onde.
    w.angle += Math.PI / p.fissures;
    const len = p.fissureLength;
    const m = queryCircle(run, hero.x, hero.y, len);
    for (let f = 0; f < p.fissures; f++) {
      const a = w.angle + (f * TAU) / p.fissures;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      emit(run, EV.fissure, hero.x, hero.y, a, len, p.fissureWidth);
      for (let k = 0; k < m; k++) {
        const i = run.query[k]!;
        const dx = e.x[i]! - hero.x;
        const dy = e.y[i]! - hero.y;
        const along = dx * ux + dy * uy;
        if (along < radius * 0.5 || along > len) continue;
        const across = Math.abs(dx * uy - dy * ux);
        if (across <= p.fissureWidth / 2 + run.enemyRadius[e.kind[i]!]!) {
          hurtEnemy(run, i, p.fissureDamage, def.damageType, def.scale, slot, 0);
        }
      }
    }
  }
}

function updateNova(run: Run, slot: number, w: WeaponInstance, def: WeaponDef, p: WeaponParams, dt: number): void {
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd += effectiveCooldown(p.cooldown, run.hero.stats.cadence);
    novaWave(run, slot, w, def, p);
    w.pending = p.waves - 1;
    w.pendingT = 0.35;
  }
  if (w.pending > 0) {
    w.pendingT -= dt;
    if (w.pendingT <= 0) {
      novaWave(run, slot, w, def, p);
      w.pending--;
      w.pendingT = 0.35;
    }
  }
}

/** Fait avancer toutes les armes d'un pas : rechargements, tirs, zones autour du héros. */
export function updateWeapons(run: Run, dt: number): void {
  tickLights(run, dt);
  for (let slot = 0; slot < run.weapons.length; slot++) {
    const w = run.weapons[slot]!;
    const def = run.data.weapons[w.def]!;
    const p = weaponParams(run, w);
    switch (def.behavior) {
      case 'arc': updateArc(run, slot, w, def, p, dt); break;
      case 'projectile': updateProjectileWeapon(run, slot, w, def, p, dt); break;
      case 'orbit': updateOrbit(run, slot, w, def, p, dt); break;
      case 'lob': updateLob(run, slot, w, def, p, dt); break;
      case 'nova': updateNova(run, slot, w, def, p, dt); break;
      case 'verge': updateVerge(run, slot, def, p); break;
      case 'chain': updateChain(run, slot, w, def, p, dt); break;
      case 'lamp': updateLamp(run, slot, w, def, p, dt); break;
      case 'wake': updateWake(run, slot, def, p); break;
    }
  }
}

function endShot(run: Run, s: number): void {
  const shots = run.shots;
  const w = run.weapons[shots.slot[s]!];
  if (w) {
    const p = weaponParams(run, w);
    if (p.endZoneRadius > 0) {
      const def = run.data.weapons[w.def]!;
      burstAt(run, shots.x[s]!, shots.y[s]!, p.endZoneRadius * (1 + run.hero.stats.zone), p.endZoneDamage, def, shots.slot[s]!, 0);
    }
  }
  removeShot(shots, s);
}

/** Déplace les projectiles du joueur et résout leurs collisions. */
export function updateShots(run: Run, dt: number): void {
  const s = run.shots;
  const e = run.enemies;
  for (let i = s.count - 1; i >= 0; i--) {
    s.px[i] = s.x[i]!;
    s.py[i] = s.y[i]!;
    const kind = s.kind[i]!;
    if (kind === SHOT_LOB) {
      s.x[i]! += s.vx[i]! * dt;
      s.y[i]! += s.vy[i]! * dt;
      s.life[i]! -= dt;
      if (s.life[i]! <= 0) {
        landLob(run, i);
        removeShot(s, i);
      }
      continue;
    }
    if (kind === SHOT_HOMING) {
      const w = run.weapons[s.slot[i]!];
      const turn = (w ? weaponParams(run, w).homing : 5) * dt;
      const target = nearestEnemy(run, s.x[i]!, s.y[i]!, 150);
      if (target >= 0) {
        const speed = Math.hypot(s.vx[i]!, s.vy[i]!);
        const want = Math.atan2(e.y[target]! - s.y[i]!, e.x[target]! - s.x[i]!);
        const cur = Math.atan2(s.vy[i]!, s.vx[i]!);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const a = cur + Math.max(-turn, Math.min(turn, diff));
        s.vx[i] = Math.cos(a) * speed;
        s.vy[i] = Math.sin(a) * speed;
      }
    }
    const stepX = s.vx[i]! * dt;
    const stepY = s.vy[i]! * dt;
    s.x[i]! += stepX;
    s.y[i]! += stepY;
    s.life[i]! -= Math.hypot(stepX, stepY);
    let ended = s.life[i]! <= 0;
    const n = queryCircle(run, s.x[i]!, s.y[i]!, s.radius[i]!);
    if (n > 0) {
      const slot = s.slot[i]!;
      const w = run.weapons[slot];
      const def = w ? run.data.weapons[w.def]! : null;
      // Un tir qui s'éteint en volant frappe moins fort de loin.
      const p = w ? weaponParams(run, w) : null;
      const fade = p && p.fade > 0 && p.range > 0 ? 1 - p.fade * Math.min(1, Math.max(0, 1 - s.life[i]! / p.range)) : 1;
      for (let k = 0; k < n && !ended; k++) {
        const t = run.query[k]!;
        const uid = e.uid[t]!;
        let seen = false;
        const base = i * SHOT_HIT_MEMORY;
        const mem = Math.min(s.hitN[i]!, SHOT_HIT_MEMORY);
        for (let h = 0; h < mem; h++) if (s.hits[base + h] === uid) seen = true;
        if (seen) continue;
        s.hits[base + (s.hitN[i]! % SHOT_HIT_MEMORY)] = uid;
        s.hitN[i]!++;
        if (def) {
          hurtEnemy(run, t, s.dmg[i]! * fade, def.damageType, def.scale, slot, s.flags[i]!);
          knockEnemy(run, t, s.x[i]! - s.vx[i]!, s.y[i]! - s.vy[i]!, 14);
        }
        if (s.pierce[i]! <= 0) ended = true;
        else s.pierce[i]!--;
      }
    }
    if (ended) endShot(run, i);
  }
}

/** Fait avancer les zones au sol : croissance, dégâts périodiques, disparition. */
export function updateZones(run: Run, dt: number): void {
  const z = run.zones;
  for (let i = z.count - 1; i >= 0; i--) {
    z.life[i]! -= dt;
    if (z.life[i]! <= 0) {
      removeZone(z, i);
      continue;
    }
    z.radius[i]! += z.grow[i]! * dt;
    z.tick[i]! -= dt;
    if (z.tick[i]! > 0) continue;
    z.tick[i]! += z.interval[i]!;
    if (z.kind[i] === ZONE_TRAIL) {
      // Les braises de la ruée : du feu, avec la Puissance du héros, sans arme créditée.
      const hits = queryCircle(run, z.x[i]!, z.y[i]!, z.radius[i]!);
      for (let k = 0; k < hits; k++) hurtEnemy(run, run.query[k]!, z.damage[i]!, DMG_FIRE, null, -1, 0);
      continue;
    }
    const slot = z.slot[i]!;
    const w = run.weapons[slot];
    if (!w) continue;
    const def = run.data.weapons[w.def]!;
    const n = queryCircle(run, z.x[i]!, z.y[i]!, z.radius[i]!);
    for (let k = 0; k < n; k++) hurtEnemy(run, run.query[k]!, z.damage[i]!, def.damageType, def.scale, slot, z.flags[i]!);
  }
}
