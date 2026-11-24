import { hurtHero, spawnEnemy, tickStatuses } from './combat.ts';
import { isSolidAt, isSolidTile } from './map.ts';
import { addTelegraph, emit, queryCircle, removeEnemyShot, removeTelegraph } from './stores.ts';
import {
  BH, CAP_ENEMY_SHOTS, EV, MAX_WEAPON_SLOTS, TG_CIRCLE, TG_LINE,
  type Run,
} from './types.ts';

const TAU = Math.PI * 2;
/** Rayon du champ de distances autour du héros, en tuiles. */
const FLOW_RADIUS = 30;
const UNREACHED = 0xffff;

const scratch = { x: 0, y: 0 };

/** Recalcule le champ de distances (en tuiles) vers le héros, pour contourner les obstacles. */
export function updateFlow(run: Run): void {
  const map = run.map;
  const hero = run.hero;
  const tx = Math.floor(hero.x / map.tile);
  const ty = Math.floor(hero.y / map.tile);
  run.flowAge++;
  if (tx === run.flowTileX && ty === run.flowTileY && run.flowAge < 90) return;
  run.flowTileX = tx;
  run.flowTileY = ty;
  run.flowAge = 0;
  const size = map.size;
  const flow = run.flow;
  flow.fill(UNREACHED);
  if (tx < 0 || ty < 0 || tx >= size || ty >= size) return;
  const queue = run.flowQueue;
  let head = 0;
  let tail = 0;
  flow[ty * size + tx] = 0;
  queue[tail++] = ty * size + tx;
  while (head < tail) {
    const idx = queue[head++]!;
    const d = flow[idx]!;
    if (d >= FLOW_RADIUS) continue;
    const x = idx % size;
    const y = (idx - x) / size;
    if (x > 0 && flow[idx - 1] === UNREACHED && map.solid[idx - 1] === 0) { flow[idx - 1] = d + 1; queue[tail++] = idx - 1; }
    if (x < size - 1 && flow[idx + 1] === UNREACHED && map.solid[idx + 1] === 0) { flow[idx + 1] = d + 1; queue[tail++] = idx + 1; }
    if (y > 0 && flow[idx - size] === UNREACHED && map.solid[idx - size] === 0) { flow[idx - size] = d + 1; queue[tail++] = idx - size; }
    if (y < size - 1 && flow[idx + size] === UNREACHED && map.solid[idx + size] === 0) { flow[idx + size] = d + 1; queue[tail++] = idx + size; }
  }
}

/** Direction à suivre depuis (x, y) pour contourner un obstacle. Résultat dans `scratch`. */
function flowDirection(run: Run, x: number, y: number): boolean {
  const map = run.map;
  const size = map.size;
  const tx = Math.floor(x / map.tile);
  const ty = Math.floor(y / map.tile);
  let best = UNREACHED;
  let bx = 0;
  let by = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const nx = tx + ox;
      const ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      // Une diagonale n'est permise que si les deux côtés sont libres.
      if (ox !== 0 && oy !== 0 && (isSolidTile(map, tx + ox, ty) || isSolidTile(map, tx, ty + oy))) continue;
      const d = run.flow[ny * size + nx]!;
      if (d < best) {
        best = d;
        bx = nx;
        by = ny;
      }
    }
  }
  if (best === UNREACHED) return false;
  const dx = (bx + 0.5) * map.tile - x;
  const dy = (by + 0.5) * map.tile - y;
  const d = Math.hypot(dx, dy) || 1;
  scratch.x = dx / d;
  scratch.y = dy / d;
  return true;
}

/** Déplace un ennemi au sol, avec glissement le long des obstacles. Renvoie vrai s'il a été bloqué. */
function moveGround(run: Run, i: number, dx: number, dy: number, dist: number, radius: number): boolean {
  const e = run.enemies;
  const map = run.map;
  const x = e.x[i]!;
  const y = e.y[i]!;
  const r = Math.min(radius, 10) * 0.7;
  const nx = x + dx * dist;
  const ny = y + dy * dist;
  const blockedX = dx !== 0 && isSolidAt(map, nx + Math.sign(dx) * r, y);
  const blockedY = dy !== 0 && isSolidAt(map, blockedX ? x : nx, ny + Math.sign(dy) * r);
  if (!blockedX) e.x[i] = nx;
  if (!blockedY) e.y[i] = ny;
  return blockedX || blockedY;
}

function approach(run: Run, i: number, dirX: number, dirY: number, dist: number, flying: boolean, radius: number, dt: number): void {
  const e = run.enemies;
  if (flying) {
    e.x[i]! += dirX * dist;
    e.y[i]! += dirY * dist;
    return;
  }
  if (e.flowT[i]! > 0) {
    e.flowT[i]! -= dt;
    if (flowDirection(run, e.x[i]!, e.y[i]!)) {
      moveGround(run, i, scratch.x, scratch.y, dist, radius);
      return;
    }
  }
  if (moveGround(run, i, dirX, dirY, dist, radius)) e.flowT[i] = 0.7;
}

function fireEnemyShot(run: Run, kind: number, x: number, y: number, dirX: number, dirY: number, speed: number, damage: number, radius: number, life: number): void {
  const s = run.enemyShots;
  if (s.count >= CAP_ENEMY_SHOTS) return;
  const i = s.count++;
  s.x[i] = x; s.y[i] = y; s.px[i] = x; s.py[i] = y;
  s.vx[i] = dirX * speed; s.vy[i] = dirY * speed;
  s.life[i] = life; s.damage[i] = damage; s.radius[i] = radius; s.kind[i] = kind;
  emit(run, EV.enemyShot, x, y);
}

function countChildren(run: Run, uid: number): number {
  const e = run.enemies;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.parent[i] === uid && e.hp[i]! > 0) n++;
  return n;
}

function clampToArena(run: Run, i: number): void {
  const d = run.director;
  if (!d.bossSpawned) return;
  const e = run.enemies;
  const dx = e.x[i]! - d.arenaX;
  const dy = e.y[i]! - d.arenaY;
  const dist = Math.hypot(dx, dy);
  const max = d.arenaR - 12;
  if (dist > max) {
    e.x[i] = d.arenaX + (dx / dist) * max;
    e.y[i] = d.arenaY + (dy / dist) * max;
  }
}

/** Comportement, déplacement et états de tous les ennemis. */
export function updateEnemies(run: Run, dt: number): void {
  const e = run.enemies;
  const hero = run.hero;
  const enemies = run.data.enemies;
  const tuning = run.data.tuning;
  const map = run.map;
  const leash2 = tuning.leashDistance * tuning.leashDistance;
  const dir = run.director;
  const count = e.count;
  for (let i = 0; i < count; i++) {
    if (e.hp[i]! <= 0) continue;
    e.px[i] = e.x[i]!;
    e.py[i] = e.y[i]!;
    const def = enemies[e.kind[i]!]!;
    const factor = tickStatuses(run, i, dt);
    if (e.hp[i]! <= 0) continue;
    const base = i * MAX_WEAPON_SLOTS;
    for (let s = 0; s < MAX_WEAPON_SLOTS; s++) if (e.hitCd[base + s]! > 0) e.hitCd[base + s]! -= dt;

    // Recul : une vitesse qui s'amortit.
    const vx = e.vx[i]!;
    const vy = e.vy[i]!;
    if (vx !== 0 || vy !== 0) {
      const nx = e.x[i]! + vx * dt;
      const ny = e.y[i]! + vy * dt;
      if (def.flying || !isSolidAt(map, nx, ny)) {
        e.x[i] = nx;
        e.y[i] = ny;
      }
      const damp = Math.pow(0.0015, dt);
      e.vx[i] = Math.abs(vx) < 2 ? 0 : vx * damp;
      e.vy[i] = Math.abs(vy) < 2 ? 0 : vy * damp;
    }

    let dx = hero.x - e.x[i]!;
    let dy = hero.y - e.y[i]!;
    const dist2 = dx * dx + dy * dy;
    const dist = Math.sqrt(dist2) || 1;
    dx /= dist;
    dy /= dist;
    if (dx > 0.1) e.facing[i] = 1;
    else if (dx < -0.1) e.facing[i] = -1;
    if (factor === 0) continue;
    const speed = def.speed * factor * dt;

    switch (run.enemyBehavior[e.kind[i]!]) {
      case BH.chase:
        approach(run, i, dx, dy, speed, def.flying, def.radius, dt);
        break;
      case BH.zigzag: {
        e.timer[i]! += dt;
        const a = Math.sin(e.timer[i]! * 4 + e.dirX[i]!) * 0.9;
        const c = Math.cos(a);
        const s = Math.sin(a);
        e.x[i]! += (dx * c - dy * s) * speed;
        e.y[i]! += (dx * s + dy * c) * speed;
        break;
      }
      case BH.swarm: {
        e.timer[i]! += dt;
        const a = Math.sin(e.timer[i]! * 6 + e.dirX[i]!) * 0.5;
        const c = Math.cos(a);
        const s = Math.sin(a);
        e.x[i]! += (dx * c - dy * s) * speed;
        e.y[i]! += (dx * s + dy * c) * speed;
        break;
      }
      case BH.shooter: {
        const shot = def.shot!;
        if (dist > shot.keepDistance + 16) approach(run, i, dx, dy, speed, false, def.radius, dt);
        else if (dist < shot.keepDistance - 40) approach(run, i, -dx, -dy, speed * 0.6, false, def.radius, dt);
        e.timer[i]! -= dt;
        if (e.timer[i]! <= 0 && dist < shot.keepDistance + 110) {
          e.timer[i] = shot.interval;
          fireEnemyShot(run, e.kind[i]!, e.x[i]!, e.y[i]! - 6, dx, dy, shot.speed, shot.damage, shot.radius, shot.life);
        }
        break;
      }
      case BH.charger: {
        const ch = def.charge!;
        const state = e.state[i]!;
        if (state === 0) {
          approach(run, i, dx, dy, speed, false, def.radius, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0 && dist < ch.triggerRange) {
            e.state[i] = 1;
            e.timer[i] = ch.telegraph;
            e.dirX[i] = dx;
            e.dirY[i] = dy;
            addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, Math.atan2(dy, dx), ch.distance, ch.width, ch.telegraph, 0, e.uid[i]!, e.kind[i]!);
            emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 1);
          }
        } else if (state === 1) {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.state[i] = 2;
            e.timer[i] = ch.distance;
            emit(run, EV.charge, e.x[i]!, e.y[i]!);
          }
        } else {
          const step = ch.speed * dt;
          const blocked = moveGround(run, i, e.dirX[i]!, e.dirY[i]!, step, def.radius);
          e.timer[i]! -= step;
          if (blocked || e.timer[i]! <= 0) {
            e.state[i] = 0;
            e.timer2[i] = ch.cooldown;
          }
        }
        break;
      }
      case BH.spawner: {
        const sp = def.spawner!;
        const slam = def.slam!;
        e.timer[i]! -= dt;
        if (e.timer[i]! <= 0) {
          e.timer[i] = sp.interval;
          if (dist < 420 && countChildren(run, e.uid[i]!) < sp.max) {
            const a = run.rngSpawn.float() * TAU;
            const child = spawnEnemy(run, def.spawnerIndex, e.x[i]! + Math.cos(a) * 26, e.y[i]! + Math.sin(a) * 22, run.hpScaleNow);
            if (child >= 0) e.parent[child] = e.uid[i]!;
          }
        }
        e.timer2[i]! -= dt;
        if (e.timer2[i]! <= 0 && dist < slam.triggerRange) {
          e.timer2[i] = slam.cooldown;
          addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, slam.radius, slam.radius, slam.telegraph, slam.damage * run.dmgScale, e.uid[i]!, e.kind[i]!);
          emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 1);
        }
        break;
      }
      case BH['boss-stag']: {
        const ch = def.charge!;
        const roots = def.roots!;
        const summon = def.summon!;
        const frac = e.hp[i]! / e.maxHp[i]!;
        const phases = def.phases!;
        const phase = frac > phases[0]! ? 1 : frac > phases[1]! ? 2 : 3;
        if (phase !== dir.bossPhase) {
          dir.bossPhase = phase;
          emit(run, EV.bossPhase, e.x[i]!, e.y[i]!, phase);
        }
        const haste = phase === 3 ? (def.phase3Haste ?? 1) : 1;
        const minTele = tuning.boss.minTelegraph;
        if (phase === 3) {
          dir.bossSummonT -= dt;
          if (dir.bossSummonT <= 0) {
            dir.bossSummonT = summon.cooldown;
            for (let k = 0; k < summon.count; k++) {
              const a = run.rngSpawn.float() * TAU;
              const r = 30 + run.rngSpawn.float() * 50;
              spawnEnemy(run, def.summonIndex, e.x[i]! + Math.cos(a) * r, e.y[i]! + Math.sin(a) * r, run.hpScaleNow);
            }
          }
        }
        const state = e.state[i]!;
        if (state === 0) {
          approach(run, i, dx, dy, speed, false, 12, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0) {
            const useRoots = phase >= 2 && dir.bossAlt;
            dir.bossAlt = !dir.bossAlt;
            if (useRoots) {
              const tele = Math.max(minTele, roots.telegraph * haste);
              e.state[i] = 3;
              e.timer[i] = tele + 0.25;
              const offset = run.rngSpawn.float() * TAU;
              for (let k = 0; k < roots.lines; k++) {
                addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, offset + (k * TAU) / roots.lines, roots.length, roots.width, tele, roots.damage * run.dmgScale, e.uid[i]!, e.kind[i]!);
              }
              emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 2);
            } else {
              e.counter[i] = ch.repeats;
              e.state[i] = 1;
              e.timer[i] = -1;
            }
          }
        } else if (state === 1) {
          if (e.timer[i]! < 0) {
            // Nouvelle visée : la charge est tracée au sol avant de partir.
            const tele = Math.max(minTele, ch.telegraph * haste);
            e.timer[i] = tele;
            e.dirX[i] = dx;
            e.dirY[i] = dy;
            addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, Math.atan2(dy, dx), ch.distance, ch.width, tele, 0, e.uid[i]!, e.kind[i]!);
            emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 2);
          } else {
            e.timer[i]! -= dt;
            if (e.timer[i]! <= 0) {
              e.state[i] = 2;
              e.timer[i] = ch.distance;
              emit(run, EV.charge, e.x[i]!, e.y[i]!);
            }
          }
        } else if (state === 2) {
          const step = ch.speed * dt;
          const blocked = moveGround(run, i, e.dirX[i]!, e.dirY[i]!, step, 12);
          e.timer[i]! -= step;
          if (blocked || e.timer[i]! <= 0) {
            e.counter[i]!--;
            if (e.counter[i]! > 0) {
              e.state[i] = 1;
              e.timer[i] = -1;
            } else {
              e.state[i] = 0;
              e.timer2[i] = ch.cooldown * haste;
            }
          }
        } else {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.state[i] = 0;
            e.timer2[i] = roots.cooldown * haste * 0.5;
          }
        }
        clampToArena(run, i);
        break;
      }
      case BH['boss-watcher']: {
        // Le Guetteur : il approche, puis alterne une charge en ligne et un cercle autour de lui.
        const ch = def.charge!;
        const slam = def.slam!;
        const state = e.state[i]!;
        if (state === 0) {
          approach(run, i, dx, dy, speed, false, def.radius, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0) {
            if (e.counter[i] === 0) {
              e.state[i] = 1;
              e.timer[i] = ch.telegraph;
              e.dirX[i] = dx;
              e.dirY[i] = dy;
              addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, Math.atan2(dy, dx), ch.distance, ch.width, ch.telegraph, 0, e.uid[i]!, e.kind[i]!);
            } else {
              e.state[i] = 3;
              e.timer[i] = slam.telegraph + 0.25;
              addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, slam.radius, slam.radius, slam.telegraph, slam.damage * run.dmgScale, e.uid[i]!, e.kind[i]!);
            }
            e.counter[i] = e.counter[i] === 0 ? 1 : 0;
            emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 2);
          }
        } else if (state === 1) {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.state[i] = 2;
            e.timer[i] = ch.distance;
            emit(run, EV.charge, e.x[i]!, e.y[i]!);
          }
        } else if (state === 2) {
          const step = ch.speed * dt;
          const blocked = moveGround(run, i, e.dirX[i]!, e.dirY[i]!, step, def.radius);
          e.timer[i]! -= step;
          if (blocked || e.timer[i]! <= 0) {
            e.state[i] = 0;
            e.timer2[i] = ch.cooldown;
          }
        } else {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.state[i] = 0;
            e.timer2[i] = slam.cooldown;
          }
        }
        break;
      }
    }

    // Un ennemi ordinaire laissé trop loin est replacé sur l'anneau d'apparition, sans rien laisser.
    if (def.rank === 'normal' && dist2 > leash2 && !dir.bossSpawned && !run.tutorial) {
      const a = run.rngSpawn.float() * TAU;
      const r = tuning.spawnRing[0] + run.rngSpawn.float() * (tuning.spawnRing[1] - tuning.spawnRing[0]);
      const nx = hero.x + Math.cos(a) * r;
      const ny = hero.y + Math.sin(a) * r;
      if (def.flying || !isSolidAt(map, nx, ny)) {
        e.x[i] = nx; e.y[i] = ny; e.px[i] = nx; e.py[i] = ny;
        e.flowT[i] = 0;
      }
    }
  }
}

/** Écarte les ennemis les uns des autres : la horde s'étale au lieu de s'empiler. Un sur deux par pas. */
export function separateEnemies(run: Run): void {
  const e = run.enemies;
  const radii = run.enemyRadius;
  const hero = run.hero;
  const heroR = run.data.tuning.hero.radius;
  const map = run.map;
  const parity = run.tick & 1;
  const built = Math.min(e.count, run.gridBuiltCount);
  for (let i = parity; i < built; i += 2) {
    if (e.hp[i]! <= 0) continue;
    const kind = e.kind[i]!;
    const behavior = run.enemyBehavior[kind];
    if (behavior === BH.swarm || behavior === BH.spawner) continue;
    const r = radii[kind]!;
    let ox = 0;
    let oy = 0;
    const n = queryCircle(run, e.x[i]!, e.y[i]!, r * 0.9);
    for (let k = 0; k < n; k++) {
      const j = run.query[k]!;
      if (j === i) continue;
      const dx = e.x[i]! - e.x[j]!;
      const dy = e.y[i]! - e.y[j]!;
      // Un peu plus que la somme des rayons : les sprites sont plus larges que leur cercle de collision.
      const min = (r + radii[e.kind[j]!]!) * 1.2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      if (d2 < 0.01) {
        // Deux ennemis exactement superposés : on les écarte selon leur indice.
        ox += (i & 1) === 0 ? 0.5 : -0.5;
        oy += (i & 2) === 0 ? 0.5 : -0.5;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * 0.5;
      ox += dx * push;
      oy += dy * push;
    }
    // Les ennemis ne se tiennent pas sur le héros : ils l'entourent.
    const hx = e.x[i]! - hero.x;
    const hy = e.y[i]! - hero.y;
    const hmin = (r + heroR) * 0.8;
    const hd2 = hx * hx + hy * hy;
    if (hd2 < hmin * hmin && hd2 > 0.01) {
      const hd = Math.sqrt(hd2);
      ox += (hx / hd) * (hmin - hd);
      oy += (hy / hd) * (hmin - hd);
    }
    if (ox === 0 && oy === 0) continue;
    const max = 3;
    if (ox > max) ox = max; else if (ox < -max) ox = -max;
    if (oy > max) oy = max; else if (oy < -max) oy = -max;
    const nx = e.x[i]! + ox;
    const ny = e.y[i]! + oy;
    if (run.data.enemies[kind]!.flying || !isSolidAt(map, nx, ny)) {
      e.x[i] = nx;
      e.y[i] = ny;
    }
  }
}

/** Vrai si le point est dans la forme d'une annonce (avec une marge). */
export function insideTelegraph(run: Run, t: number, x: number, y: number, margin: number): boolean {
  const tg = run.telegraphs;
  const dx = x - tg.x[t]!;
  const dy = y - tg.y[t]!;
  if (tg.shape[t] === TG_CIRCLE) {
    const r = tg.width[t]! + margin;
    return dx * dx + dy * dy <= r * r;
  }
  const a = tg.angle[t]!;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const along = dx * ux + dy * uy;
  if (along < -margin || along > tg.length[t]! + margin) return false;
  return Math.abs(dx * uy - dy * ux) <= tg.width[t]! / 2 + margin;
}

/** Fait avancer les annonces d'attaque ; à leur terme, elles frappent le héros s'il est dedans. */
export function updateTelegraphs(run: Run, dt: number): void {
  const tg = run.telegraphs;
  const hero = run.hero;
  for (let t = tg.count - 1; t >= 0; t--) {
    tg.t[t]! += dt;
    if (tg.t[t]! < tg.duration[t]!) continue;
    if (tg.damage[t]! > 0) {
      emit(run, EV.telegraphHit, tg.x[t]!, tg.y[t]!, tg.shape[t]!, tg.angle[t]!, tg.shape[t] === TG_CIRCLE ? tg.width[t]! : tg.length[t]!);
      if (insideTelegraph(run, t, hero.x, hero.y, run.data.tuning.hero.radius * 0.5)) hurtHero(run, tg.damage[t]!, tg.kind[t]!);
    }
    removeTelegraph(tg, t);
  }
}

/** Retire les annonces d'un ennemi mort. */
export function clearTelegraphsOf(run: Run, uid: number): void {
  const tg = run.telegraphs;
  for (let t = tg.count - 1; t >= 0; t--) if (tg.owner[t] === uid) removeTelegraph(tg, t);
}

/** Déplace les projectiles ennemis ; ils sont arrêtés par les obstacles. */
export function updateEnemyShots(run: Run, dt: number): void {
  const s = run.enemyShots;
  const hero = run.hero;
  const heroR = run.data.tuning.hero.radius;
  for (let i = s.count - 1; i >= 0; i--) {
    s.px[i] = s.x[i]!;
    s.py[i] = s.y[i]!;
    s.x[i]! += s.vx[i]! * dt;
    s.y[i]! += s.vy[i]! * dt;
    s.life[i]! -= dt;
    if (s.life[i]! <= 0 || isSolidAt(run.map, s.x[i]!, s.y[i]!)) {
      removeEnemyShot(s, i);
      continue;
    }
    const dx = s.x[i]! - hero.x;
    const dy = s.y[i]! - (hero.y - 6);
    const r = s.radius[i]! + heroR + 2;
    if (dx * dx + dy * dy <= r * r && hero.dashT <= 0) {
      if (hurtHero(run, s.damage[i]! * run.dmgScale, s.kind[i]!)) removeEnemyShot(s, i);
    }
  }
}

/** Dégâts de contact des ennemis sur le héros. */
export function contactDamage(run: Run): void {
  const hero = run.hero;
  if (hero.invuln > 0 || hero.dashT > 0 || hero.hp <= 0) return;
  const e = run.enemies;
  const n = queryCircle(run, hero.x, hero.y, run.data.tuning.hero.radius);
  let worst = 0;
  let worstKind = -1;
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    if (e.status[i]! & 8) continue;
    const def = run.data.enemies[e.kind[i]!]!;
    const charging = def.charge !== undefined && e.state[i] === 2;
    const dmg = charging ? def.charge!.damage : def.damage;
    if (dmg > worst) {
      worst = dmg;
      worstKind = e.kind[i]!;
    }
  }
  if (worst > 0) hurtHero(run, worst * run.dmgScale, worstKind);
}
