import type { EnemyDef } from '../content/index.ts';
import { updateLady } from './boss-lady.ts';
import { hurtHero, isDust, spawnEnemy, tickStatuses } from './combat.ts';
import { isDeepAt, isSolidAt, isSolidTile } from './map.ts';
import { BLIND_RANGE, addMire, drainHero, grantDodge, mireHero, strikeCircle } from './marsh.ts';
import { addTelegraph, emit, queryCircle, removeEnemyShot, removeTelegraph } from './stores.ts';
import {
  BH, CAP_ENEMY_SHOTS, EV, MAX_WEAPON_SLOTS, TFX_MIRE, TFX_PUDDLE, TFX_PULL, TG_ARC, TG_CIRCLE, TG_LINE, TG_RING,
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

/** Le multiplicateur des dégâts d'un ennemi au temps courant. */
function damageScale(run: Run, def: EnemyDef): number {
  return def.flatDamage ? run.dmgScaleFlat : run.dmgScale;
}

/** Les attaques du Cerf sans lumière. */
const A_CHARGE = 0;
const A_ROOTS = 1;
const A_STOMP = 2;
const A_STALK = 3;
const A_VOLLEY = 4;
const A_ROAR = 5;
/** Ce qu'il peut tirer à chaque phase : il apprend ses coups en perdant ses forces. */
const STAG_POOLS = [
  [A_CHARGE, A_STOMP, A_STALK],
  [A_CHARGE, A_ROOTS, A_STOMP, A_STALK, A_VOLLEY],
  [A_CHARGE, A_ROOTS, A_STOMP, A_STALK, A_VOLLEY],
];
/** En phase 3, certaines attaques en appellent une autre sans souffle : l'étoile chasse Moon de sa place, les racines la suivent. */
const STAG_CHAIN = [-1, A_STALK, A_CHARGE, -1, -1, -1];

/** États du Cerf. La course reste l'état 2 : c'est elle qui donne les dégâts de charge au contact. */
const ST_IDLE = 0;
const ST_AIM = 1;
const ST_RUN = 2;
const ST_WAIT = 3;
const ST_STALK = 4;
const ST_VOLLEY = 5;

/** Combien de temps avant son coup le Cerf prend la pose de l'attaque (moins si son souffle est plus court). */
export const STAG_TELL = 0.5;
/** Combien de temps, depuis le début de l'annonce, il tient la pose de chaque attaque : jusqu'au coup, ou presque. */
export const STAG_POSE = [1.3, 1.4, 1.35, 1.25, 1.2, 1.8];

/** Le tirage de la prochaine attaque : une de la phase, jamais deux fois la même d'affilée. */
function stagPick(run: Run, phase: number): number {
  const pool = STAG_POOLS[phase - 1]!;
  const attack = pool[Math.floor(run.rngSpawn.float() * pool.length)]!;
  return attack === run.director.bossLast ? pool[(pool.indexOf(attack) + 1) % pool.length]! : attack;
}

function stagTele(run: Run, base: number, haste: number): number {
  return Math.max(run.data.tuning.boss.minTelegraph, base * haste);
}

/** Fin d'une attaque : le Cerf souffle, moins longtemps à chaque phase, ou enchaîne en phase 3. */
function stagRecover(run: Run, i: number, def: EnemyDef, attack: number, extra = 0): void {
  const e = run.enemies;
  const dir = run.director;
  const phase = dir.bossPhase;
  e.state[i] = ST_IDLE;
  dir.bossTellT = -1;
  if (dir.bossNext === A_ROAR) {
    e.timer2[i] = 0.2;
    return;
  }
  const chained = phase === 3 ? STAG_CHAIN[attack] ?? -1 : -1;
  if (chained >= 0) {
    dir.bossNext = chained;
    e.timer2[i] = 0.25;
    return;
  }
  e.timer2[i] = def.pauses![phase - 1]! + extra;
}

function stagStart(run: Run, i: number, def: EnemyDef, attack: number, dx: number, dy: number, haste: number): void {
  const e = run.enemies;
  const dir = run.director;
  const x = e.x[i]!;
  const y = e.y[i]!;
  const uid = e.uid[i]!;
  const kind = e.kind[i]!;
  dir.bossLast = attack;
  switch (attack) {
    case A_CHARGE: {
      // Deux charges d'abord, trois ensuite.
      e.counter[i] = dir.bossPhase === 1 ? Math.max(1, def.charge!.repeats - 1) : def.charge!.repeats;
      e.state[i] = ST_AIM;
      e.timer[i] = -1;
      break;
    }
    case A_ROOTS: {
      // L'étoile : une vague, puis une seconde tournée d'un demi-cran qui couvre les trous de la première.
      const roots = def.roots!;
      const tele = stagTele(run, roots.telegraph, haste);
      const offset = run.rngSpawn.float() * TAU;
      const step = TAU / roots.lines;
      const dmg = roots.damage * damageScale(run, def);
      for (let k = 0; k < roots.lines; k++) {
        addTelegraph(run, TG_LINE, x, y, offset + k * step, roots.length, roots.width, tele, dmg, uid, kind);
      }
      const second = dir.bossPhase >= 2;
      if (second) {
        for (let k = 0; k < roots.lines; k++) {
          addTelegraph(run, TG_LINE, x, y, offset + (k + 0.5) * step, roots.length, roots.width, tele, dmg, uid, kind, roots.cooldown);
        }
      }
      e.state[i] = ST_WAIT;
      e.timer[i] = tele + (second ? roots.cooldown : 0) + 0.2;
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    case A_STOMP: {
      // L'onde : des anneaux partent du Cerf l'un après l'autre. On s'en sort en rentrant dans celui qui vient de frapper.
      const st = def.stomp!;
      const tele = stagTele(run, st.telegraph, haste);
      const stagger = st.stagger * (dir.bossPhase === 3 ? 0.85 : 1);
      const dmg = st.damage * damageScale(run, def);
      for (let k = 0; k < st.rings; k++) {
        const outer = (k + 1) * st.ringWidth;
        if (k === 0) addTelegraph(run, TG_CIRCLE, x, y, 0, outer, outer, tele, dmg, uid, kind);
        else addTelegraph(run, TG_RING, x, y, 0, k * st.ringWidth, outer, tele, dmg, uid, kind, k * stagger);
      }
      e.state[i] = ST_WAIT;
      e.timer[i] = (st.rings - 1) * stagger + tele + 0.2;
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    case A_STALK: {
      e.state[i] = ST_STALK;
      e.counter[i] = def.stalk!.count + (dir.bossPhase - 1);
      e.timer[i] = 0;
      break;
    }
    case A_VOLLEY: {
      e.state[i] = ST_VOLLEY;
      e.counter[i] = def.volley!.waves;
      e.timer[i] = stagTele(run, def.volley!.windup, haste);
      emit(run, EV.telegraph, x, y, 2);
      break;
    }
    default: {
      // Le rugissement d'un changement de phase : il se fige, puis le sol se soulève tout autour de lui.
      dir.bossNext = -1;
      const slam = def.slam!;
      const r = slam.radius * 1.6;
      addTelegraph(run, TG_CIRCLE, x, y, 0, r, r, 1, slam.damage * damageScale(run, def), uid, kind);
      e.state[i] = ST_WAIT;
      e.timer[i] = 1.3;
      emit(run, EV.telegraph, x, y, 2);
      if (dir.bossPhase === 3) dir.bossSummonT = 0.8;
    }
  }
}

/** Le Cerf sans lumière : six attaques, une phase de plus à chaque tiers de vie, de moins en moins de répit. */
function updateStag(run: Run, i: number, dx: number, dy: number, speed: number, dt: number): void {
  const e = run.enemies;
  const dir = run.director;
  const def = run.data.enemies[e.kind[i]!]!;
  const ch = def.charge!;
  const summon = def.summon!;
  if (dir.bossReformT > 0) {
    // En poussière : il ne bouge ni ne frappe. Il se relève d'un coup, prêt à attaquer.
    dir.bossReformT = Math.max(0, dir.bossReformT - dt);
    dir.bossTell = -1;
    dir.bossTellT = -1;
    e.state[i] = ST_IDLE;
    e.timer2[i] = 0.6;
    return;
  }
  const frac = e.hp[i]! / e.maxHp[i]!;
  const phases = def.phases!;
  // Relevé de sa poussière, il reste dans sa dernière phase.
  const phase = dir.bossReformed ? 3 : frac > phases[0]! ? 1 : frac > phases[1]! ? 2 : 3;
  const shed = def.shed;
  if (shed) {
    // Des éclats tous les `every` de vie perdue ; un très gros coup les étale sur plusieurs pas.
    for (let n = 0; n < shed.maxPerStep && frac <= 1 - (dir.bossShed + 1) * shed.every; n++) {
      dir.bossShed++;
      for (let k = 0; k < shed.count; k++) {
        const a = run.rngSpawn.float() * TAU;
        const r = 30 + run.rngSpawn.float() * 40;
        spawnEnemy(run, def.shedIndex, e.x[i]! + Math.cos(a) * r, e.y[i]! + Math.sin(a) * r, run.hpScaleNow);
      }
    }
  }
  if (phase !== dir.bossPhase) {
    const first = dir.bossPhase === 0;
    dir.bossPhase = phase;
    emit(run, EV.bossPhase, e.x[i]!, e.y[i]!, phase);
    if (!first) {
      dir.bossNext = A_ROAR;
      if (e.state[i] === ST_IDLE) e.timer2[i] = Math.min(e.timer2[i]!, 0.2);
    }
  }
  const haste = phase === 3 ? (def.phase3Haste ?? 1) : 1;
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
  if (dir.bossTellT >= 0) {
    dir.bossTellT += dt;
    if (dir.bossTellT > (STAG_POSE[dir.bossTell >= 0 ? dir.bossTell : dir.bossLast] ?? 1.3)) dir.bossTellT = -1;
  }
  if (state === ST_IDLE) {
    approach(run, i, dx, dy, speed * (phase === 3 ? 1.2 : 1), false, 12, dt);
    e.timer2[i]! -= dt;
    if (e.timer2[i]! <= STAG_TELL) {
      // Il prend la pose de son attaque avant de la lancer ; un rugissement imposé remplace l'annonce en cours.
      const want = dir.bossNext >= 0 ? dir.bossNext : dir.bossTell >= 0 ? dir.bossTell : stagPick(run, phase);
      if (want !== dir.bossTell) {
        dir.bossTell = want;
        dir.bossTellT = 0;
      }
    }
    if (e.timer2[i]! <= 0) {
      const attack = dir.bossTell;
      dir.bossTell = -1;
      if (attack !== A_ROAR) dir.bossNext = -1;
      stagStart(run, i, def, attack, dx, dy, haste);
    }
  } else if (state === ST_AIM) {
    if (e.timer[i]! < 0) {
      // Nouvelle visée : la charge est tracée au sol avant de partir.
      const tele = stagTele(run, ch.telegraph, haste);
      e.timer[i] = tele;
      e.dirX[i] = dx;
      e.dirY[i] = dy;
      addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, Math.atan2(dy, dx), ch.distance, ch.width, tele, 0, e.uid[i]!, e.kind[i]!);
      emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 2);
    } else {
      e.timer[i]! -= dt;
      if (e.timer[i]! <= 0) {
        e.state[i] = ST_RUN;
        dir.bossTellT = -1;
        e.timer[i] = ch.distance;
        emit(run, EV.charge, e.x[i]!, e.y[i]!);
      }
    }
  } else if (state === ST_RUN) {
    const step = ch.speed * dt;
    const blocked = moveGround(run, i, e.dirX[i]!, e.dirY[i]!, step, 12);
    e.timer[i]! -= step;
    if (blocked || e.timer[i]! <= 0) {
      // En phase 3, chaque arrivée frappe le sol : ne pas rester collé à sa course.
      if (phase === 3) {
        const slam = def.slam!;
        const tele = stagTele(run, slam.telegraph, 1);
        addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, slam.radius, slam.radius, tele, slam.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
      }
      e.counter[i]!--;
      if (e.counter[i]! > 0) {
        e.state[i] = ST_AIM;
        e.timer[i] = -1;
      } else {
        stagRecover(run, i, def, A_CHARGE, ch.cooldown);
      }
    }
  } else if (state === ST_STALK) {
    // Les racines traquantes : un cercle là où se tient Moon, puis un autre, tant qu'il en reste.
    const stalk = def.stalk!;
    approach(run, i, dx, dy, speed * 0.5, false, 12, dt);
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) {
      const tele = stagTele(run, stalk.telegraph, haste);
      if (e.counter[i]! > 0) {
        e.counter[i]!--;
        e.timer[i] = stalk.interval * (phase === 3 ? 0.85 : 1);
        const hero = run.hero;
        addTelegraph(run, TG_CIRCLE, hero.x, hero.y, 0, stalk.radius, stalk.radius, tele, stalk.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
        emit(run, EV.telegraph, hero.x, hero.y, 1);
      } else {
        e.state[i] = ST_WAIT;
        e.timer[i] = tele * 0.6;
      }
    }
  } else if (state === ST_VOLLEY) {
    // La volée : des éclats d'andouiller en éventail, une vague sur deux décalée pour boucher les trous de l'autre.
    const v = def.volley!;
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) {
      if (e.counter[i]! > 0) {
        const wave = v.waves - e.counter[i]!;
        e.counter[i]!--;
        e.timer[i] = v.interval;
        const base = Math.atan2(dy, dx);
        const step = v.shots > 1 ? v.spread / (v.shots - 1) : 0;
        const shift = (wave & 1) === 1 ? step / 2 : 0;
        for (let k = 0; k < v.shots; k++) {
          const a = base - v.spread / 2 + k * step + shift;
          fireEnemyShot(run, e.kind[i]!, e.x[i]!, e.y[i]! - 14, Math.cos(a), Math.sin(a), v.speed, v.damage, v.radius, v.life);
        }
      } else {
        stagRecover(run, i, def, A_VOLLEY);
      }
    }
  } else {
    e.timer[i]! -= dt;
    if (e.timer[i]! <= 0) stagRecover(run, i, def, dir.bossLast);
  }
  clampToArena(run, i);
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
    // Les sangsues filent dans l'eau profonde.
    const speed = def.speed * factor * dt * (def.waterSpeed !== undefined && isDeepAt(map, e.x[i]!, e.y[i]!) ? def.waterSpeed : 1);

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
          addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, slam.radius, slam.radius, slam.telegraph, slam.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
          emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 1);
        }
        break;
      }
      case BH.wisp: {
        // La Lueur trompeuse : elle fonce en dansant, s'arrête contre Moon, enfle, puis éclate en flaque de vase.
        const w = def.wisp!;
        if (e.state[i] === 0) {
          e.timer[i]! += dt;
          const a = Math.sin(e.timer[i]! * 5 + e.dirX[i]!) * 0.7;
          const c = Math.cos(a);
          const s = Math.sin(a);
          e.x[i]! += (dx * c - dy * s) * speed;
          e.y[i]! += (dx * s + dy * c) * speed;
          if (dist < w.triggerRange) {
            e.state[i] = 1;
            e.timer2[i] = w.fuse;
            addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, w.radius, w.radius, w.fuse, 0, e.uid[i]!, e.kind[i]!);
          }
        } else {
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0) {
            strikeCircle(run, e.x[i]!, e.y[i]!, w.radius, w.damage * damageScale(run, def), e.kind[i]!);
            addMire(run, e.x[i]!, e.y[i]!, w.mire.radius, w.mire.duration);
            emit(run, EV.wispPop, e.x[i]!, e.y[i]!);
            e.hp[i] = 0;
          }
        }
        break;
      }
      case BH.leaper: {
        // Le Crapaud-outre : il rampe, puis bondit là où se tient Moon ; un cercle annonce où il retombe.
        const lp = def.leap!;
        if (e.state[i] === 0) {
          approach(run, i, dx, dy, speed, false, def.radius, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0 && dist < lp.range && dist > lp.minRange) {
            if (isSolidAt(map, hero.x, hero.y)) {
              e.timer2[i] = 0.5;
            } else {
              e.state[i] = 1;
              e.timer[i] = lp.telegraph;
              e.dirX[i] = hero.x;
              e.dirY[i] = hero.y;
              addTelegraph(run, TG_CIRCLE, hero.x, hero.y, 0, lp.radius, lp.radius, lp.telegraph, 0, e.uid[i]!, e.kind[i]!);
              emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 1);
            }
          }
        } else {
          // En l'air : il glisse vers son point de chute, par-dessus tout.
          const left = Math.max(dt, e.timer[i]!);
          const k = Math.min(1, dt / left);
          e.x[i]! += (e.dirX[i]! - e.x[i]!) * k;
          e.y[i]! += (e.dirY[i]! - e.y[i]!) * k;
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            strikeCircle(run, e.x[i]!, e.y[i]!, lp.radius, lp.damage * damageScale(run, def), e.kind[i]!);
            e.state[i] = 0;
            e.timer2[i] = lp.cooldown;
          }
        }
        break;
      }
      case BH.grabber: {
        // La Main noyée : elle replonge et ressort sous Moon, un peu devant lui s'il marche. Touché, il est retenu.
        const g = def.grab!;
        if (e.state[i] === 0) {
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0 && dist < g.reach) {
            const tx = hero.x + (hero.moving ? hero.faceX * g.lead : 0);
            const ty = hero.y + (hero.moving ? hero.faceY * g.lead : 0);
            if (isSolidAt(map, tx, ty)) {
              e.timer2[i] = 0.4;
            } else {
              e.x[i] = tx; e.y[i] = ty; e.px[i] = tx; e.py[i] = ty;
              e.state[i] = 1;
              e.timer[i] = g.telegraph;
              addTelegraph(run, TG_CIRCLE, tx, ty, 0, g.radius, g.radius, g.telegraph, 0, e.uid[i]!, e.kind[i]!);
              emit(run, EV.handRise, tx, ty, g.telegraph, 0);
            }
          }
        } else {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            if (strikeCircle(run, e.x[i]!, e.y[i]!, g.radius, g.damage * damageScale(run, def), e.kind[i]!)) mireHero(run, g.slow, 0);
            e.state[i] = 0;
            e.timer2[i] = g.cooldown;
          }
        }
        break;
      }
      case BH.ferryman: {
        // Le Passeur : il glisse sur l'eau, disparaît dans la brume et reparaît dans le dos de Moon ; entre deux, sa perche frappe en ligne.
        const f = def.ferry!;
        const slam = def.slam!;
        const ch = def.charge!;
        const state = e.state[i]!;
        if (state === 0) {
          approach(run, i, dx, dy, speed, true, def.radius, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0) {
            if ((e.counter[i]! & 1) === 0) {
              emit(run, EV.vanish, e.x[i]!, e.y[i]!);
              const inner = tuning.borderTiles * tuning.tileSize + 24;
              const outer = map.size * map.tile - inner;
              const tx = Math.min(outer, Math.max(inner, hero.x - hero.faceX * f.behind));
              const ty = Math.min(outer, Math.max(inner, hero.y - hero.faceY * f.behind));
              e.x[i] = tx; e.y[i] = ty; e.px[i] = tx; e.py[i] = ty;
              e.vx[i] = 0; e.vy[i] = 0;
              e.state[i] = 1;
              e.timer[i] = slam.telegraph;
              addTelegraph(run, TG_CIRCLE, tx, ty, 0, slam.radius, slam.radius, slam.telegraph, slam.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
              emit(run, EV.appear, tx, ty);
            } else {
              e.state[i] = 2;
              e.timer[i] = ch.telegraph;
              addTelegraph(run, TG_LINE, e.x[i]!, e.y[i]!, Math.atan2(dy, dx), ch.distance, ch.width, ch.telegraph, ch.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
            }
            e.counter[i] = (e.counter[i]! + 1) & 255;
            emit(run, EV.telegraph, e.x[i]!, e.y[i]!, 1);
          }
        } else {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.timer2[i] = state === 1 ? f.recover : f.cooldown;
            e.state[i] = 0;
          }
        }
        break;
      }
      case BH.beacon: {
        // La Lanterne-mère : tant qu'elle vit près de Moon, sa Lueur est étouffée. Elle lâche des Lueurs et des éclats en couronne.
        const b = def.blind!;
        const sp = def.spawner!;
        if (dist < BLIND_RANGE) run.blind = Math.min(run.blind, b.glowMult);
        approach(run, i, dx, dy, speed, false, def.radius, dt);
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
        if (e.timer2[i]! <= 0 && dist < 320) {
          e.timer2[i] = b.flashEvery;
          const offset = run.rngSpawn.float() * TAU;
          for (let k = 0; k < b.shots; k++) {
            const a = offset + (k * TAU) / b.shots;
            fireEnemyShot(run, e.kind[i]!, e.x[i]!, e.y[i]! - 10, Math.cos(a), Math.sin(a), b.shotSpeed, b.shotDamage, b.shotRadius, b.shotLife);
          }
        }
        break;
      }
      case BH.toller: {
        // Le Glas : il avance, s'arrête et sonne. Des anneaux partent de lui, et des Noyés sortent de l'eau autour de Moon.
        const st = def.stomp!;
        const sm = def.summon!;
        if (e.state[i] === 0) {
          approach(run, i, dx, dy, speed, false, def.radius, dt);
          e.timer2[i]! -= dt;
          if (e.timer2[i]! <= 0 && dist < 280) {
            const dmg = st.damage * damageScale(run, def);
            for (let k = 0; k < st.rings; k++) {
              const outer = (k + 1) * st.ringWidth;
              if (k === 0) addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, outer, outer, st.telegraph, dmg, e.uid[i]!, e.kind[i]!);
              else addTelegraph(run, TG_RING, e.x[i]!, e.y[i]!, 0, k * st.ringWidth, outer, st.telegraph, dmg, e.uid[i]!, e.kind[i]!, k * st.stagger);
            }
            const offset = run.rngSpawn.float() * TAU;
            for (let k = 0; k < sm.count; k++) {
              const a = offset + (k * TAU) / sm.count;
              const r = 120 + run.rngSpawn.float() * 40;
              const sx = hero.x + Math.cos(a) * r;
              const sy = hero.y + Math.sin(a) * r;
              if (!isSolidAt(map, sx, sy)) spawnEnemy(run, def.summonIndex, sx, sy, run.hpScaleNow);
            }
            e.state[i] = 1;
            e.timer[i] = (st.rings - 1) * st.stagger + st.telegraph + 0.3;
            emit(run, EV.toll, e.x[i]!, e.y[i]!);
          }
        } else {
          e.timer[i]! -= dt;
          if (e.timer[i]! <= 0) {
            e.state[i] = 0;
            e.timer2[i] = sm.cooldown;
          }
        }
        break;
      }
      case BH['boss-stag']:
        updateStag(run, i, dx, dy, speed, dt);
        break;
      case BH['boss-lady']:
        updateLady(run, i, dx, dy, dist, speed, dt);
        break;
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
              addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, slam.radius, slam.radius, slam.telegraph, slam.damage * damageScale(run, def), e.uid[i]!, e.kind[i]!);
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
  if (tg.shape[t] === TG_RING) {
    const d = Math.hypot(dx, dy);
    return d >= tg.length[t]! - margin && d <= tg.width[t]! + margin;
  }
  if (tg.shape[t] === TG_ARC) {
    const d = Math.hypot(dx, dy);
    if (d > tg.length[t]! + margin) return false;
    if (d < margin) return true;
    let diff = Math.atan2(dy, dx) - tg.angle[t]!;
    diff -= Math.round(diff / TAU) * TAU;
    return Math.abs(diff) <= tg.width[t]! + margin / d;
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
      // b : l'angle d'une ligne ou d'un secteur, le rayon intérieur d'un anneau. c : la longueur d'une ligne, le rayon d'un cercle, d'un anneau ou d'un secteur.
      // Un secteur ajoute sa demi-ouverture à `a`, divisée par 8 pour rester sous 1.
      const shape = tg.shape[t]!;
      const fx = tg.fx[t]!;
      emit(
        run, EV.telegraphHit, tg.x[t]!, tg.y[t]!, shape === TG_ARC ? shape + tg.width[t]! / 8 : shape,
        shape === TG_RING ? tg.length[t]! : tg.angle[t]!, shape === TG_LINE || shape === TG_ARC ? tg.length[t]! : tg.width[t]!,
      );
      if (insideTelegraph(run, t, hero.x, hero.y, run.data.tuning.hero.radius * 0.5)) {
        if (hero.dashT > 0) {
          grantDodge(run);
        } else if (hurtHero(run, tg.damage[t]!, tg.kind[t]!)) {
          if (fx === TFX_MIRE) {
            mireHero(run, tg.fxValue[t]!, 0);
          } else if (fx === TFX_PULL) {
            // Tiré vers l'origine de l'annonce : un élan qui s'amortit.
            const px = tg.x[t]! - hero.x;
            const py = tg.y[t]! - hero.y;
            const pd = Math.hypot(px, py) || 1;
            hero.pullX = (px / pd) * tg.fxValue[t]!;
            hero.pullY = (py / pd) * tg.fxValue[t]!;
            mireHero(run, tg.fxSize[t]!, 2);
          }
        }
      }
      if (fx === TFX_PUDDLE) addMire(run, tg.x[t]!, tg.y[t]!, tg.fxSize[t]!, tg.fxValue[t]!);
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
    if (dx * dx + dy * dy > r * r) continue;
    if (hero.dashT > 0) {
      grantDodge(run);
      continue;
    }
    const shooter = run.data.enemies[s.kind[i]!]!;
    if (hurtHero(run, s.damage[i]! * damageScale(run, shooter), s.kind[i]!)) {
      // La boule de vase du Pêcheur colle aux bottes.
      if (shooter.shot?.slow !== undefined) mireHero(run, shooter.shot.slow, 0);
      removeEnemyShot(s, i);
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
  let drain = 0;
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    if (e.status[i]! & 8 || isDust(run, i)) continue;
    const def = run.data.enemies[e.kind[i]!]!;
    // Un Crapaud en l'air ne touche personne : c'est sa chute qui frappe.
    if (def.leap !== undefined && e.state[i] === 1) continue;
    if (def.drain !== undefined && def.drain > drain) drain = def.drain;
    const charging = def.charge !== undefined && e.state[i] === 2;
    const dmg = (charging ? def.charge!.damage : def.damage) * damageScale(run, def);
    if (dmg > worst) {
      worst = dmg;
      worstKind = e.kind[i]!;
    }
  }
  if (worst > 0 && hurtHero(run, worst, worstKind) && drain > 0) drainHero(run, drain);
}
