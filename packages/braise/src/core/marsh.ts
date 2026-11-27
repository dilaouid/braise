import type { EnemyDef } from '../content/index.ts';
import { hurtHero } from './combat.ts';
import { beaconAt } from './light.ts';
import { isDeepAt } from './map.ts';
import { emit } from './stores.ts';
import { EV, TG_CIRCLE, type Run } from './types.ts';

/** Au-delà, la plus vieille flaque disparaît. */
const MAX_MIRES = 48;
/** La vitesse à laquelle la Lueur suit ce que la brume lui laisse, en part par seconde. */
const DIM_RATE = 0.9;
/** Une Lanterne-mère aveugle jusqu'à cette distance. */
export const BLIND_RANGE = 520;

/** Pose une flaque de vase. */
export function addMire(run: Run, x: number, y: number, radius: number, life: number): void {
  if (run.mires.length >= MAX_MIRES) run.mires.shift();
  run.mires.push({ x, y, radius, life, maxLife: life });
  emit(run, EV.mire, x, y, radius);
}

/** Prend le héros dans la vase pour `seconds` (0 : flaque, 2 : étreinte). Sans effet pendant une ruée. */
export function mireHero(run: Run, seconds: number, cause = 0): void {
  const hero = run.hero;
  if (hero.dashT > 0 || hero.hp <= 0) return;
  if (hero.mireT <= 0) emit(run, EV.heroAfflict, hero.x, hero.y, cause);
  hero.mireT = Math.max(hero.mireT, seconds);
}

/** Une morsure de sangsue : plus de régénération pendant `seconds`. */
export function drainHero(run: Run, seconds: number): void {
  const hero = run.hero;
  if (hero.drainT <= 0) emit(run, EV.heroAfflict, hero.x, hero.y, 1);
  hero.drainT = Math.max(hero.drainT, seconds);
}

/**
 * L'esquive juste : la ruée a traversé un coup au moment où il frappait. Une fois par ruée : de l'élan
 * (de la Puissance un instant), de l'ultime, et une part de la recharge de la ruée rendue.
 */
export function grantDodge(run: Run): void {
  const hero = run.hero;
  if (hero.dodged || hero.dashT <= 0 || run.tutorial) return;
  const dodge = run.data.tuning.dodge;
  hero.dodged = true;
  hero.dodgeT = dodge.duration;
  hero.ultGauge = Math.min(run.data.tuning.ultimate.gaugeMax, hero.ultGauge + dodge.ult * run.mods.ultChargeMult);
  if (hero.dashCd > 0) hero.dashCd *= 1 - dodge.dashRefund;
  emit(run, EV.dodge, hero.x, hero.y);
}

/**
 * Un coup en cercle qui frappe tout de suite (un bond qui retombe, une Lueur qui éclate). Renvoie vrai s'il a porté.
 * Traversé en ruée, il donne l'esquive juste.
 */
export function strikeCircle(run: Run, x: number, y: number, radius: number, damage: number, kind: number): boolean {
  const hero = run.hero;
  emit(run, EV.telegraphHit, x, y, TG_CIRCLE, 0, radius);
  const r = radius + run.data.tuning.hero.radius * 0.5;
  const dx = hero.x - x;
  const dy = hero.y - y;
  if (dx * dx + dy * dy > r * r) return false;
  if (hero.dashT > 0) {
    grantDodge(run);
    return false;
  }
  return hurtHero(run, damage, kind);
}

/** Le rayon au-delà duquel l'arène est sous l'eau : il se resserre quand la marée monte, s'ouvre quand elle se retire. */
export function floodRadius(run: Run, def: EnemyDef): number {
  const d = run.director;
  const tide = d.tide;
  const cfg = def.tide;
  if (!tide || !cfg) return Infinity;
  if (tide.t < cfg.rise) return d.arenaR * (1 - tide.t / cfg.rise);
  if (tide.t < cfg.rise + cfg.hold) return 0;
  return d.arenaR * Math.min(1, (tide.t - cfg.rise - cfg.hold) / cfg.ebb);
}

/** Vrai si ce point est sous la marée : hors du rayon encore au sec, et sur aucun îlot. */
export function isFlooded(run: Run, x: number, y: number): boolean {
  const d = run.director;
  const tide = d.tide;
  if (!tide) return false;
  const def = run.data.enemies[run.region.bossIdx]!;
  const dry = floodRadius(run, def);
  const dx = x - d.arenaX;
  const dy = y - d.arenaY;
  if (dx * dx + dy * dy < dry * dry) return false;
  for (const islet of tide.islets) {
    const ix = x - islet.x;
    const iy = y - islet.y;
    if (ix * ix + iy * iy < islet.r * islet.r) return false;
  }
  return true;
}

/** Vrai si le héros patauge : eau profonde de la carte, ou marée. */
export function isWading(run: Run, x: number, y: number): boolean {
  return isDeepAt(run.map, x, y) || isFlooded(run, x, y);
}

/** La marée monte : des îlots sont tirés, dont un à portée de ruée du héros. */
export function startTide(run: Run, def: EnemyDef): void {
  const d = run.director;
  const cfg = def.tide!;
  const rng = run.rngSpawn;
  const hero = run.hero;
  const max = d.arenaR - cfg.isletRadius - 14;
  const islets: Array<{ x: number; y: number; r: number }> = [];
  for (let k = 0; k < cfg.islets; k++) {
    let best: { x: number; y: number; r: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = rng.float() * Math.PI * 2;
      let x: number;
      let y: number;
      if (k === 0) {
        // Le premier îlot est proche : on doit pouvoir l'atteindre avant que l'eau n'arrive.
        const r = 50 + rng.float() * 50;
        x = hero.x + Math.cos(a) * r;
        y = hero.y + Math.sin(a) * r;
      } else {
        const r = Math.sqrt(rng.float()) * max;
        x = d.arenaX + Math.cos(a) * r;
        y = d.arenaY + Math.sin(a) * r;
      }
      const ox = x - d.arenaX;
      const oy = y - d.arenaY;
      const od = Math.hypot(ox, oy);
      if (od > max) {
        x = d.arenaX + (ox / od) * max;
        y = d.arenaY + (oy / od) * max;
      }
      const candidate = { x, y, r: cfg.isletRadius };
      best ??= candidate;
      if (islets.every((o) => Math.hypot(o.x - x, o.y - y) > cfg.isletRadius * 2.4)) {
        best = candidate;
        break;
      }
    }
    if (best) islets.push(best);
  }
  d.tide = { t: 0, islets, tick: cfg.tick };
  d.tideCd = cfg.cooldown;
  emit(run, EV.tideStart, d.arenaX, d.arenaY, cfg.rise + cfg.hold + cfg.ebb);
}

function updateTide(run: Run, dt: number): void {
  const d = run.director;
  const tide = d.tide!;
  const def = run.data.enemies[run.region.bossIdx]!;
  const cfg = def.tide;
  if (!cfg || d.bossDead) {
    d.tide = null;
    return;
  }
  tide.t += dt;
  const hero = run.hero;
  if (hero.dashT <= 0 && hero.hp > 0 && isFlooded(run, hero.x, hero.y)) {
    tide.tick -= dt;
    if (tide.tick <= 0) {
      tide.tick = cfg.tick;
      hurtHero(run, cfg.damage * run.dmgScaleFlat, def.index);
    }
  } else {
    // Au sec, le prochain tic se réarme à moitié : toucher l'eau un instant ne coûte rien.
    tide.tick = Math.min(cfg.tick, tide.tick + dt);
  }
  if (tide.t >= cfg.rise + cfg.hold + cfg.ebb) {
    d.tide = null;
    emit(run, EV.tideEnd, d.arenaX, d.arenaY);
  }
}

/** Ce que le Marais fait à chaque pas : la vase, les lanternes noyées, la brume, la marée. */
export function updateMarsh(run: Run, dt: number): void {
  const hero = run.hero;
  const mires = run.mires;
  let touched = false;
  for (let i = mires.length - 1; i >= 0; i--) {
    const m = mires[i]!;
    m.life -= dt;
    if (m.life <= 0) {
      mires.splice(i, 1);
      continue;
    }
    const dx = hero.x - m.x;
    const dy = hero.y - m.y;
    if (dx * dx + dy * dy < m.radius * m.radius) touched = true;
  }
  if (touched) mireHero(run, run.data.tuning.heroStatuses.mireLinger);

  const bc = run.region.beacons;
  if (bc) {
    for (const b of run.map.beacons) {
      if (b.life > 0) b.life = Math.max(0, b.life - dt);
      const dx = hero.x - b.x;
      const dy = hero.y - b.y;
      if (dx * dx + dy * dy < bc.reach * bc.reach && b.life < bc.seconds - 1) {
        if (b.life <= 0) emit(run, EV.beaconLit, b.x, b.y);
        b.life = bc.seconds;
      }
    }
  }

  // La brume étouffe la Lueur, sauf dans la lumière d'une lanterne ravivée ; une Lanterne-mère l'étouffe partout.
  const fog = run.region.fog;
  let target = fog && !run.tutorial && beaconAt(run, hero.x, hero.y) === null ? fog.glowMult : 1;
  target *= run.blind;
  const step = DIM_RATE * dt;
  run.dim += Math.max(-step, Math.min(step, target - run.dim));

  if (run.director.tide) updateTide(run, dt);
}
