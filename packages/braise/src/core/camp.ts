import type { CampDef, CampObject } from '../content/index.ts';
import { CAMP_MOON } from '../content/scene.ts';
import { facingFromVector } from './stores.ts';

/** Moon au refuge : où il est, où il va. */
export interface CampState {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  /** Le point où il marche de lui-même, et depuis combien de temps. */
  goal: { id: string; x: number; y: number; t: number } | null;
}

/** Au-delà, une marche qui n'aboutit pas s'arrête. */
const GOAL_SECONDS = 3;
const GOAL_NEAR = 3;

/** Moon vient d'arriver au refuge : là où finissent les scènes de route. */
export function newCamp(): CampState {
  return { x: CAMP_MOON.x, y: CAMP_MOON.y, facing: 0, moving: false, goal: null };
}

/** Ramène un point hors d'un obstacle : sur son bord, du côté où il est. */
function pushOut(s: CampState, o: CampObject): boolean {
  if (o.solid.rx <= 0 || o.solid.ry <= 0) return false;
  const nx = (s.x - o.x) / o.solid.rx;
  const ny = (s.y - o.y) / o.solid.ry;
  const d = Math.hypot(nx, ny);
  if (d >= 1) return false;
  if (d < 1e-6) {
    s.y = o.y + o.solid.ry;
    return true;
  }
  s.x = o.x + (nx / d) * o.solid.rx;
  s.y = o.y + (ny / d) * o.solid.ry;
  return true;
}

/** Un pas de Moon au refuge. Le stick l'emporte sur une marche automatique. */
export function stepCamp(s: CampState, def: CampDef, visible: ReadonlySet<string>, moveX: number, moveY: number, dt: number): void {
  let mx = moveX;
  let my = moveY;
  if (Math.hypot(mx, my) > 0.001) {
    s.goal = null;
  } else if (s.goal) {
    s.goal.t += dt;
    const dx = s.goal.x - s.x;
    const dy = s.goal.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < GOAL_NEAR || s.goal.t > GOAL_SECONDS) {
      s.goal = null;
    } else {
      mx = dx / d;
      my = dy / d;
    }
  }
  s.moving = Math.hypot(mx, my) > 0.001;
  if (!s.moving) return;
  s.facing = facingFromVector(mx, my);
  const auto = s.goal !== null;
  const step = def.speed * dt;
  s.x += mx * step;
  s.y += my * step;
  for (const o of def.objects) {
    if (!visible.has(o.id)) continue;
    const bx = s.x;
    const by = s.y;
    if (!pushOut(s, o) || !auto) continue;
    // Une marche automatique longe l'obstacle : un pas de côté, vers où elle allait.
    const ox = (s.x - o.x) / (o.solid.rx * o.solid.rx);
    const oy = (s.y - o.y) / (o.solid.ry * o.solid.ry);
    const n = Math.hypot(ox, oy) || 1;
    let tx = -oy / n;
    let ty = ox / n;
    const along = tx * mx + ty * my;
    if (along < 0) {
      tx = -tx;
      ty = -ty;
    }
    const slide = Math.max(0, step - Math.hypot(s.x - bx, s.y - by));
    s.x += tx * Math.max(slide, step * 0.6);
    s.y += ty * Math.max(slide, step * 0.6);
    pushOut(s, o);
  }
  // La clairière : on glisse le long de son bord.
  const b = def.bounds;
  const ex = (s.x - b.x) / b.rx;
  const ey = (s.y - b.y) / b.ry;
  const e = Math.hypot(ex, ey);
  if (e > 1) {
    s.x = b.x + (ex / e) * b.rx;
    s.y = b.y + (ey / e) * b.ry;
  }
}

/** L'objet que Moon peut ouvrir d'où il est : le plus proche, dans son rayon. */
export function nearestObject(s: CampState, def: CampDef, visible: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of def.objects) {
    if (o.reach <= 0 || !visible.has(o.id)) continue;
    const d = Math.hypot(s.x - o.x, s.y - o.y);
    if (d <= o.reach && d < bestD) {
      best = o.id;
      bestD = d;
    }
  }
  return best;
}

/** Moon part vers un objet, jusqu'à son point d'arrêt. */
export function walkTo(s: CampState, def: CampDef, id: string): void {
  const o = def.objects.find((x) => x.id === id);
  if (o) s.goal = { id: o.id, x: o.stand[0], y: o.stand[1], t: 0 };
}

/**
 * Un écran ou une réplique s'ouvre : Moon s'arrête. S'il allait à l'objet qui s'ouvre (`opened`), il est déjà à côté
 * quand on revient ; sinon il reste où il est.
 */
export function stopCamp(s: CampState, opened: string | null): void {
  if (s.goal && s.goal.id === opened) {
    s.x = s.goal.x;
    s.y = s.goal.y;
  }
  s.goal = null;
  s.moving = false;
}
