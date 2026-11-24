import type { Bot } from './bots.ts';
import { closeChest, closeFind, takeCard } from './levelup.ts';
import { findPath } from './map.ts';
import { buyItem, canBuy, closeShop, shopItems, takeBoon, takeEvolution } from './places.ts';
import { idleInput, stepRun } from './run.ts';
import { advanceDialogue, tutorialTarget } from './tutorial.ts';
import { PK_GEM, PK_RED_GEM, TILE_THICKET, type Run, type StepInput } from './types.ts';

/** Le chemin que le robot suit, gardé par partie pour ne pas le recalculer à chaque pas. */
interface Route {
  goalTile: number;
  fromTile: number;
  path: number[];
  tick: number;
}
const routes = new WeakMap<Run, Route>();

/** Le robot marche sur le sol et sait que la rangée d'Éteints se franchit en ruée. */
function walkable(tileValue: number): boolean {
  return tileValue === 0 || tileValue === TILE_THICKET;
}

function tileOf(run: Run, x: number, y: number): number {
  return Math.floor(y / run.map.tile) * run.map.size + Math.floor(x / run.map.tile);
}

/** Avance vers un point en suivant les couloirs ; rue quand la rangée d'Éteints est devant. */
function walkTo(run: Run, input: StepInput, x: number, y: number): void {
  const hero = run.hero;
  const map = run.map;
  const from = tileOf(run, hero.x, hero.y);
  const goal = tileOf(run, x, y);
  let route = routes.get(run);
  if (!route || route.goalTile !== goal || route.fromTile !== from || run.tick - route.tick > 30) {
    route = { goalTile: goal, fromTile: from, path: findPath(map, from, goal, walkable), tick: run.tick };
    routes.set(run, route);
  }
  let wx = x;
  let wy = y;
  if (route.path.length > 1) {
    const next = route.path[0]!;
    wx = ((next % map.size) + 0.5) * map.tile;
    wy = (Math.floor(next / map.size) + 0.5) * map.tile;
  }
  const dx = wx - hero.x;
  const dy = wy - hero.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.5) return;
  input.moveX = dx / d;
  input.moveY = dy / d;
  // La rangée est juste devant : on la traverse d'une ruée, bien dans l'axe.
  const ahead = tileOf(run, hero.x + (dx / d) * 14, hero.y + (dy / d) * 14);
  if (map.solid[ahead] === TILE_THICKET) input.dash = true;
}

function nearestEnemy(run: Run): number {
  const e = run.enemies;
  const hero = run.hero;
  let found = -1;
  let foundD = Infinity;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    const d2 = (e.x[i]! - hero.x) ** 2 + (e.y[i]! - hero.y) ** 2;
    if (d2 < foundD) {
      foundD = d2;
      found = i;
    }
  }
  return found;
}

/** Si Moon est dans une attaque annoncée, la direction pour en sortir. */
function escape(run: Run, out: { x: number; y: number }): boolean {
  const tg = run.telegraphs;
  const hero = run.hero;
  for (let t = 0; t < tg.count; t++) {
    const dx = hero.x - tg.x[t]!;
    const dy = hero.y - tg.y[t]!;
    if (tg.shape[t] === 1) {
      const r = tg.width[t]! + 16;
      if (dx * dx + dy * dy < r * r) {
        const d = Math.hypot(dx, dy) || 1;
        out.x = dx / d;
        out.y = dy / d;
        return true;
      }
    } else {
      const ux = Math.cos(tg.angle[t]!);
      const uy = Math.sin(tg.angle[t]!);
      const along = dx * ux + dy * uy;
      const side = dx * uy - dy * ux;
      if (along > -16 && along < tg.length[t]! + 16 && Math.abs(side) < tg.width[t]! / 2 + 16) {
        // Hors de la ligne, par le côté où il se trouve déjà.
        const s = side >= 0 ? 1 : -1;
        out.x = uy * s;
        out.y = -ux * s;
        return true;
      }
    }
  }
  return false;
}

const away = { x: 0, y: 0 };

/**
 * Un joueur appliqué qui suit le tutoriel : il va là où l'étape l'attend, se bat en visant l'ennemi le
 * plus proche, boit quand on le lui demande, et sort des attaques annoncées.
 */
export const tutorialBot: Bot = (run, input) => {
  const tu = run.tutorial;
  if (!tu) return;
  const hero = run.hero;
  const e = run.enemies;
  const step = tu.def.steps[tu.step];
  const foe = nearestEnemy(run);
  let foeD = Infinity;
  if (foe >= 0) {
    const fx = e.x[foe]! - hero.x;
    const fy = e.y[foe]! - hero.y;
    foeD = Math.hypot(fx, fy) || 1;
    // La Fauchée frappe là où il vise.
    input.aimX = fx / foeD;
    input.aimY = fy / foeD;
    if (foeD < 60) input.skill = true;
  }
  if (step?.do === 'wait' && step.until === 'healed') input.flask = true;
  if (hero.hp < hero.stats.maxHp * 0.35) input.flask = true;

  if (escape(run, away)) {
    input.moveX = away.x;
    input.moveY = away.y;
    input.dash = true;
    return;
  }

  const goal = tutorialTarget(run);
  // Un endroit précis à rejoindre : on y va, même en se battant (le cercle du totem, le trésor, la sortie).
  if (goal) {
    walkTo(run, input, goal.x, goal.y);
    return;
  }
  if (foe >= 0) {
    // Garder l'ennemi à portée de lame, sans le laisser toucher.
    const fx = (e.x[foe]! - hero.x) / foeD;
    const fy = (e.y[foe]! - hero.y) / foeD;
    // Un ennemi lancé dans sa charge : son annonce a disparu, mais il arrive. On sort de son axe.
    if (e.state[foe] === 2 && run.data.enemies[e.kind[foe]!]!.charge) {
      const ux = e.dirX[foe]!;
      const uy = e.dirY[foe]!;
      const side = (hero.x - e.x[foe]!) * uy - (hero.y - e.y[foe]!) * ux;
      if (Math.abs(side) < 60) {
        const s = side >= 0 ? 1 : -1;
        input.moveX = uy * s;
        input.moveY = -ux * s;
        return;
      }
    }
    const reach = run.enemyRadius[e.kind[foe]!]! + 22;
    if (foeD > reach + 8) walkTo(run, input, e.x[foe]!, e.y[foe]!);
    else if (foeD < reach - 8) {
      input.moveX = -fx;
      input.moveY = -fy;
    } else {
      input.moveX = -fy;
      input.moveY = fx;
    }
    return;
  }
  // Plus personne : ramasser les éclats.
  const p = run.pickups;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < p.count; i++) {
    if (p.kind[i] !== PK_GEM && p.kind[i] !== PK_RED_GEM) continue;
    const d2 = (p.x[i]! - hero.x) ** 2 + (p.y[i]! - hero.y) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  if (best >= 0) walkTo(run, input, p.x[best]!, p.y[best]!);
};

export interface TutorialSimResult {
  /** Temps de jeu, sans les dialogues ni les écrans de choix. */
  seconds: number;
  deaths: number;
  done: boolean;
  /** Temps de jeu passé face au boss. */
  bossSeconds: number;
}

/** Joue le tutoriel sans affichage : dialogues passés ligne à ligne, choix résolus tout de suite. */
export function simulateTutorial(run: Run, maxSeconds: number): TutorialSimResult {
  const input = idleInput();
  let bossSeconds = 0;
  let guard = 0;
  while (run.time < maxSeconds && run.phase !== 'dead' && run.phase !== 'victory' && guard++ < 4_000_000) {
    switch (run.phase) {
      case 'dialogue': advanceDialogue(run); continue;
      case 'levelup': takeCard(run, 0); continue;
      case 'chest': closeChest(run); continue;
      case 'forge': takeEvolution(run, 0); continue;
      case 'totem': takeBoon(run, 0); continue;
      case 'find': closeFind(run); continue;
      case 'shop': {
        const items = shopItems(run);
        const pick = items.findIndex((item) => item.card !== null && canBuy(run, item));
        if (pick < 0 || !buyItem(run, pick)) closeShop(run);
        else closeShop(run);
        continue;
      }
      default: break;
    }
    input.moveX = 0; input.moveY = 0; input.aimX = 0; input.aimY = 0;
    input.dash = false; input.skill = false; input.ultimate = false; input.flask = false;
    tutorialBot(run, input);
    const before = run.time;
    stepRun(run, input);
    if (run.director.bossUid !== 0) bossSeconds += run.time - before;
    run.evCount = 0;
  }
  return { seconds: run.time, deaths: run.tutorial?.deaths ?? 0, done: run.tutorial?.done ?? false, bossSeconds };
}
