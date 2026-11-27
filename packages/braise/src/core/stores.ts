import {
  CAP_ENEMIES, CAP_ENEMY_SHOTS, CAP_EVENTS, CAP_PICKUPS, CAP_SHOTS, CAP_TELEGRAPHS, CAP_ZONES, MAX_WEAPON_SLOTS,
  type EnemyShotStore, type EnemyStore, type PickupStore, type Run, type ShotStore, type TelegraphStore, type TutorialNotes, type ZoneStore,
} from './types.ts';

/** Nombre de cibles mémorisées par projectile, pour ne pas toucher deux fois le même ennemi. */
export const SHOT_HIT_MEMORY = 6;

const f32 = (n: number): Float32Array => new Float32Array(n);

export function createEnemyStore(): EnemyStore {
  const n = CAP_ENEMIES;
  return {
    count: 0, nextUid: 1,
    x: f32(n), y: f32(n), px: f32(n), py: f32(n), vx: f32(n), vy: f32(n),
    hp: f32(n), maxHp: f32(n), kind: new Uint16Array(n), uid: new Uint32Array(n), parent: new Uint32Array(n),
    state: new Uint8Array(n), timer: f32(n), timer2: f32(n), counter: new Uint8Array(n),
    dirX: f32(n), dirY: f32(n), flowT: f32(n),
    status: new Uint8Array(n),
    burnT: f32(n), burnDmg: f32(n), burnTick: f32(n), shockT: f32(n),
    slowT: f32(n), frozenT: f32(n), freezeStacks: new Uint8Array(n), freezeWindow: f32(n),
    bleedT: f32(n), bleedDmg: f32(n), bleedTick: f32(n), bleedStacks: new Uint8Array(n),
    hitCd: f32(n * MAX_WEAPON_SLOTS),
    dmgAcc: f32(n), dmgAccT: f32(n), dmgFlags: new Uint8Array(n),
    flash: f32(n), facing: new Int8Array(n),
  };
}

/** Remet un emplacement d'ennemi à zéro avant de l'utiliser. */
export function clearEnemy(e: EnemyStore, i: number): void {
  e.vx[i] = 0; e.vy[i] = 0; e.parent[i] = 0;
  e.state[i] = 0; e.timer[i] = 0; e.timer2[i] = 0; e.counter[i] = 0;
  e.dirX[i] = 0; e.dirY[i] = 0; e.flowT[i] = 0;
  e.status[i] = 0;
  e.burnT[i] = 0; e.burnDmg[i] = 0; e.burnTick[i] = 0; e.shockT[i] = 0;
  e.slowT[i] = 0; e.frozenT[i] = 0; e.freezeStacks[i] = 0; e.freezeWindow[i] = 0;
  e.bleedT[i] = 0; e.bleedDmg[i] = 0; e.bleedTick[i] = 0; e.bleedStacks[i] = 0;
  for (let s = 0; s < MAX_WEAPON_SLOTS; s++) e.hitCd[i * MAX_WEAPON_SLOTS + s] = 0;
  e.dmgAcc[i] = 0; e.dmgAccT[i] = 0; e.dmgFlags[i] = 0;
  e.flash[i] = -0.2; e.facing[i] = 1;
}

/** Retire un ennemi : le dernier du tableau prend sa place. Aucun trou, aucune allocation. */
export function removeEnemy(e: EnemyStore, i: number): void {
  const l = --e.count;
  if (i === l) return;
  e.x[i] = e.x[l]!; e.y[i] = e.y[l]!; e.px[i] = e.px[l]!; e.py[i] = e.py[l]!; e.vx[i] = e.vx[l]!; e.vy[i] = e.vy[l]!;
  e.hp[i] = e.hp[l]!; e.maxHp[i] = e.maxHp[l]!; e.kind[i] = e.kind[l]!; e.uid[i] = e.uid[l]!; e.parent[i] = e.parent[l]!;
  e.state[i] = e.state[l]!; e.timer[i] = e.timer[l]!; e.timer2[i] = e.timer2[l]!; e.counter[i] = e.counter[l]!;
  e.dirX[i] = e.dirX[l]!; e.dirY[i] = e.dirY[l]!; e.flowT[i] = e.flowT[l]!;
  e.status[i] = e.status[l]!;
  e.burnT[i] = e.burnT[l]!; e.burnDmg[i] = e.burnDmg[l]!; e.burnTick[i] = e.burnTick[l]!; e.shockT[i] = e.shockT[l]!;
  e.slowT[i] = e.slowT[l]!; e.frozenT[i] = e.frozenT[l]!; e.freezeStacks[i] = e.freezeStacks[l]!; e.freezeWindow[i] = e.freezeWindow[l]!;
  e.bleedT[i] = e.bleedT[l]!; e.bleedDmg[i] = e.bleedDmg[l]!; e.bleedTick[i] = e.bleedTick[l]!; e.bleedStacks[i] = e.bleedStacks[l]!;
  for (let s = 0; s < MAX_WEAPON_SLOTS; s++) e.hitCd[i * MAX_WEAPON_SLOTS + s] = e.hitCd[l * MAX_WEAPON_SLOTS + s]!;
  e.dmgAcc[i] = e.dmgAcc[l]!; e.dmgAccT[i] = e.dmgAccT[l]!; e.dmgFlags[i] = e.dmgFlags[l]!;
  e.flash[i] = e.flash[l]!; e.facing[i] = e.facing[l]!;
}

export function createShotStore(): ShotStore {
  const n = CAP_SHOTS;
  return {
    count: 0,
    x: f32(n), y: f32(n), px: f32(n), py: f32(n), vx: f32(n), vy: f32(n),
    life: f32(n), radius: f32(n), pierce: new Int16Array(n), kind: new Uint8Array(n), slot: new Uint8Array(n),
    sprite: new Uint8Array(n), tx: f32(n), ty: f32(n), t: f32(n),
    hits: new Uint32Array(n * SHOT_HIT_MEMORY), hitN: new Uint8Array(n),
    dmg: f32(n), flags: new Uint8Array(n),
  };
}

export function removeShot(s: ShotStore, i: number): void {
  const l = --s.count;
  if (i === l) return;
  s.x[i] = s.x[l]!; s.y[i] = s.y[l]!; s.px[i] = s.px[l]!; s.py[i] = s.py[l]!; s.vx[i] = s.vx[l]!; s.vy[i] = s.vy[l]!;
  s.life[i] = s.life[l]!; s.radius[i] = s.radius[l]!; s.pierce[i] = s.pierce[l]!; s.kind[i] = s.kind[l]!; s.slot[i] = s.slot[l]!;
  s.sprite[i] = s.sprite[l]!; s.tx[i] = s.tx[l]!; s.ty[i] = s.ty[l]!; s.t[i] = s.t[l]!;
  for (let k = 0; k < SHOT_HIT_MEMORY; k++) s.hits[i * SHOT_HIT_MEMORY + k] = s.hits[l * SHOT_HIT_MEMORY + k]!;
  s.hitN[i] = s.hitN[l]!;
  s.dmg[i] = s.dmg[l]!; s.flags[i] = s.flags[l]!;
}

export function createEnemyShotStore(): EnemyShotStore {
  const n = CAP_ENEMY_SHOTS;
  return {
    count: 0, x: f32(n), y: f32(n), px: f32(n), py: f32(n), vx: f32(n), vy: f32(n), life: f32(n), damage: f32(n), radius: f32(n),
    kind: new Uint16Array(n),
  };
}

export function removeEnemyShot(s: EnemyShotStore, i: number): void {
  const l = --s.count;
  if (i === l) return;
  s.x[i] = s.x[l]!; s.y[i] = s.y[l]!; s.px[i] = s.px[l]!; s.py[i] = s.py[l]!; s.vx[i] = s.vx[l]!; s.vy[i] = s.vy[l]!;
  s.life[i] = s.life[l]!; s.damage[i] = s.damage[l]!; s.radius[i] = s.radius[l]!; s.kind[i] = s.kind[l]!;
}

export function createZoneStore(): ZoneStore {
  const n = CAP_ZONES;
  return {
    count: 0, x: f32(n), y: f32(n), radius: f32(n), life: f32(n), maxLife: f32(n),
    tick: f32(n), interval: f32(n), damage: f32(n), grow: f32(n),
    slot: new Uint8Array(n), kind: new Uint8Array(n), flags: new Uint8Array(n),
  };
}

export function removeZone(z: ZoneStore, i: number): void {
  const l = --z.count;
  if (i === l) return;
  z.x[i] = z.x[l]!; z.y[i] = z.y[l]!; z.radius[i] = z.radius[l]!; z.life[i] = z.life[l]!; z.maxLife[i] = z.maxLife[l]!;
  z.tick[i] = z.tick[l]!; z.interval[i] = z.interval[l]!; z.damage[i] = z.damage[l]!; z.grow[i] = z.grow[l]!;
  z.slot[i] = z.slot[l]!; z.kind[i] = z.kind[l]!; z.flags[i] = z.flags[l]!;
}

export function createTelegraphStore(): TelegraphStore {
  const n = CAP_TELEGRAPHS;
  return {
    count: 0, shape: new Uint8Array(n), x: f32(n), y: f32(n), angle: f32(n), length: f32(n), width: f32(n),
    t: f32(n), duration: f32(n), damage: f32(n), owner: new Uint32Array(n), kind: new Uint16Array(n),
    fx: new Uint8Array(n), fxValue: f32(n), fxSize: f32(n),
  };
}

export function removeTelegraph(t: TelegraphStore, i: number): void {
  const l = --t.count;
  if (i === l) return;
  t.shape[i] = t.shape[l]!; t.x[i] = t.x[l]!; t.y[i] = t.y[l]!; t.angle[i] = t.angle[l]!; t.length[i] = t.length[l]!;
  t.width[i] = t.width[l]!; t.t[i] = t.t[l]!; t.duration[i] = t.duration[l]!; t.damage[i] = t.damage[l]!; t.owner[i] = t.owner[l]!;
  t.kind[i] = t.kind[l]!; t.fx[i] = t.fx[l]!; t.fxValue[i] = t.fxValue[l]!; t.fxSize[i] = t.fxSize[l]!;
}

/** Ajoute une annonce d'attaque au sol. `damage` nul : l'annonce est seulement visuelle. `delay` : elle n'apparaît qu'après ce temps. */
export function addTelegraph(
  run: Run, shape: number, x: number, y: number, angle: number, length: number, width: number, duration: number, damage: number, owner: number,
  kind = 0, delay = 0, fx = 0, fxValue = 0, fxSize = 0,
): void {
  const t = run.telegraphs;
  if (t.count >= CAP_TELEGRAPHS) return;
  const i = t.count++;
  t.shape[i] = shape; t.x[i] = x; t.y[i] = y; t.angle[i] = angle; t.length[i] = length; t.width[i] = width;
  t.t[i] = -delay; t.duration[i] = duration; t.damage[i] = damage; t.owner[i] = owner; t.kind[i] = kind;
  t.fx[i] = fx; t.fxValue[i] = fxValue; t.fxSize[i] = fxSize;
}

export function createPickupStore(): PickupStore {
  const n = CAP_PICKUPS;
  return {
    count: 0, x: f32(n), y: f32(n), px: f32(n), py: f32(n), kind: new Uint8Array(n), value: f32(n),
    attracted: new Uint8Array(n), speed: f32(n), age: f32(n),
  };
}

export function removePickup(p: PickupStore, i: number): void {
  const l = --p.count;
  if (i === l) return;
  p.x[i] = p.x[l]!; p.y[i] = p.y[l]!; p.px[i] = p.px[l]!; p.py[i] = p.py[l]!; p.kind[i] = p.kind[l]!; p.value[i] = p.value[l]!;
  p.attracted[i] = p.attracted[l]!; p.speed[i] = p.speed[l]!; p.age[i] = p.age[l]!;
}

/** Émet un événement pour le rendu et le son. La file est fixe : au-delà, l'événement est perdu. */
export function emit(run: Run, type: number, x: number, y: number, a = 0, b = 0, c = 0): void {
  if (run.evCount >= CAP_EVENTS) return;
  const i = run.evCount++;
  run.evType[i] = type;
  run.evX[i] = x;
  run.evY[i] = y;
  run.evA[i] = a;
  run.evB[i] = b;
  run.evC[i] = c;
}

/** Taille d'une cellule de la grille spatiale, en pixels. */
/** Direction de sprite, 0 à 7 : sud, sud-ouest, ouest, nord-ouest, nord, nord-est, est, sud-est. */
export function facingFromVector(x: number, y: number): number {
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return ((Math.round((deg - 90) / 45) % 8) + 8) % 8;
}

/** Compte un geste du joueur pour le script du tutoriel. Sans effet dans une expédition normale. */
export function tutorialNote(run: Run, what: keyof TutorialNotes): void {
  if (run.tutorial) run.tutorial.notes[what]++;
}

export const CELL = 64;

/** Reconstruit la grille spatiale des ennemis (tri par cellule dans des tableaux fixes). */
export function buildGrid(run: Run): void {
  const e = run.enemies;
  const cols = run.gridCols;
  const start = run.gridStart;
  start.fill(0);
  const cells = cols * cols;
  for (let i = 0; i < e.count; i++) {
    const cx = Math.min(cols - 1, Math.max(0, (e.x[i]! / CELL) | 0));
    const cy = Math.min(cols - 1, Math.max(0, (e.y[i]! / CELL) | 0));
    start[cy * cols + cx + 1]!++;
  }
  for (let c = 0; c < cells; c++) start[c + 1]! += start[c]!;
  // Deuxième passe : place chaque ennemi, en avançant un curseur par cellule.
  const cursor = run.gridCursor;
  for (let c = 0; c < cells; c++) cursor[c] = start[c]!;
  const items = run.gridItems;
  for (let i = 0; i < e.count; i++) {
    const cx = Math.min(cols - 1, Math.max(0, (e.x[i]! / CELL) | 0));
    const cy = Math.min(cols - 1, Math.max(0, (e.y[i]! / CELL) | 0));
    items[cursor[cy * cols + cx]!++] = i;
  }
  run.gridBuiltCount = e.count;
}

/**
 * Remplit `run.query` avec les indices des ennemis vivants dont le cercle touche
 * le cercle (x, y, r). Renvoie leur nombre. Le rayon des ennemis est majoré par 36 px.
 */
export function queryCircle(run: Run, x: number, y: number, r: number): number {
  const e = run.enemies;
  const cols = run.gridCols;
  const reach = r + 36;
  const x0 = Math.max(0, ((x - reach) / CELL) | 0);
  const y0 = Math.max(0, ((y - reach) / CELL) | 0);
  const x1 = Math.min(cols - 1, ((x + reach) / CELL) | 0);
  const y1 = Math.min(cols - 1, ((y + reach) / CELL) | 0);
  const out = run.query;
  const radii = run.enemyRadius;
  let n = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * cols + cx;
      const end = run.gridStart[c + 1]!;
      for (let k = run.gridStart[c]!; k < end; k++) {
        const i = run.gridItems[k]!;
        if (i >= e.count || e.hp[i]! <= 0) continue;
        const dx = e.x[i]! - x;
        const dy = e.y[i]! - y;
        const rr = r + radii[e.kind[i]!]!;
        if (dx * dx + dy * dy <= rr * rr) out[n++] = i;
      }
    }
  }
  return n;
}

/** L'ennemi vivant le plus proche de (x, y) dans un rayon donné, ou -1. */
export function nearestEnemy(run: Run, x: number, y: number, maxDist: number): number {
  const n = queryCircle(run, x, y, maxDist);
  const e = run.enemies;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    const i = run.query[k]!;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
