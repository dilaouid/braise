import { insideTelegraph } from './enemies.ts';
import { closeChest, closeFind, evolvableWeapons, takeCard } from './levelup.ts';
import { isSolidAt } from './map.ts';
import { feedOffer, feedTarget, glowShareNow, offerCost, takeFlame } from './flames.ts';
import { buyItem, canBuy, closeShop, shopItems, takeEvolution } from './places.ts';
import { idleInput, stepRun } from './run.ts';
import { PK_GEM, PK_RED_GEM, SERVICES, type Poi, type Run, type StepInput } from './types.ts';

/** Un robot : il remplit l'instantané d'actions à partir de l'état de la partie. */
export type Bot = (run: Run, input: StepInput) => void;

const DIRS = 16;
/** Seuils de prudence du robot actif (réglés par simulation). */
export const BOT_TUNE = { calm: 0.0045, hurt: 0.0015, go: 0.006, fleeReach: 50, touch: 22, lead: 0.22, gather: 320 };
const best = { x: 0, y: 0, danger: 0 };
/** Le point autour duquel le robot reste : le centre de la carte, ou le lieu qu'il vise. */
const anchor = { on: false, x: 0, y: 0 };

/** Le danger en un point : ennemis proches, projectiles, attaques annoncées, obstacles, bords. */
function dangerAt(run: Run, x: number, y: number): number {
  const e = run.enemies;
  let danger = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    const dx = x - e.x[i]!;
    const dy = y - e.y[i]!;
    const d2 = dx * dx + dy * dy;
    if (d2 > 170 * 170) continue;
    const r = run.enemyRadius[e.kind[i]!]!;
    danger += (r > 12 ? 3 : 1) / (d2 + 90);
  }
  const s = run.enemyShots;
  for (let i = 0; i < s.count; i++) {
    // Le point où sera le projectile dans un tiers de seconde.
    const dx = x - (s.x[i]! + s.vx[i]! * 0.33);
    const dy = y - (s.y[i]! + s.vy[i]! * 0.33);
    const d2 = dx * dx + dy * dy;
    if (d2 < 40 * 40) danger += 2 / (d2 + 60);
  }
  const tg = run.telegraphs;
  for (let t = 0; t < tg.count; t++) if (insideTelegraph(run, t, x, y, 15)) danger += 0.05;
  // Le Marais : la vase colle, la marée blesse hors des îlots.
  for (const m of run.mires) {
    const dx = x - m.x;
    const dy = y - m.y;
    if (dx * dx + dy * dy < m.radius * m.radius) danger += 0.01;
  }
  const tide = run.director.tide;
  if (tide) {
    let nearest = Infinity;
    for (const islet of tide.islets) nearest = Math.min(nearest, Math.hypot(x - islet.x, y - islet.y) - islet.r);
    if (nearest > 0) danger += 0.03 + nearest * 0.0004;
  }
  if (isSolidAt(run.map, x, y)) danger += 1;
  const size = run.map.size * run.map.tile;
  const d = run.director;
  const arena = d.bossSpawned && !d.bossDead;
  const cx = arena ? d.arenaX : anchor.on ? anchor.x : size / 2;
  const cy = arena ? d.arenaY : anchor.on ? anchor.y : size / 2;
  const limit = arena ? d.arenaR * 0.62 : anchor.on ? 24 : size * 0.36;
  const od = Math.hypot(cx - x, cy - y);
  if (od > limit) danger += (od - limit) * 0.00006;
  return danger;
}

/** La direction la moins dangereuse parmi seize, avec une préférence pour celle déjà suivie. */
function safestDirection(run: Run, reach: number): void {
  const hero = run.hero;
  let bestD = Infinity;
  for (let k = 0; k < DIRS; k++) {
    const a = (k / DIRS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Deux points sur le chemin : on ne fonce pas dans un mur d'ennemis pour atteindre un vide.
    let d = dangerAt(run, hero.x + dx * reach, hero.y + dy * reach) + dangerAt(run, hero.x + dx * reach * 0.4, hero.y + dy * reach * 0.4) * 1.5;
    d -= (dx * hero.faceX + dy * hero.faceY) * 0.0004;
    // Un obstacle juste devant : cette direction ne mène nulle part.
    if (isSolidAt(run.map, hero.x + dx * 12, hero.y + dy * 12) || isSolidAt(run.map, hero.x + dx * 26, hero.y + dy * 26)) d += 1;
    // En diagonale, les deux côtés doivent être libres : on ne passe pas entre deux coins.
    if (isSolidAt(run.map, hero.x + Math.sign(dx) * 11, hero.y) || isSolidAt(run.map, hero.x, hero.y + Math.sign(dy) * 11)) d += 0.5;
    if (d < bestD) {
      bestD = d;
      best.x = dx;
      best.y = dy;
    }
  }
  best.danger = bestD;
}

/** Indice de l'ennemi vivant le plus proche du héros, ou -1. */
function nearestToHero(run: Run): number {
  const hero = run.hero;
  const e = run.enemies;
  let found = -1;
  let foundD = Infinity;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    const dx = hero.x - e.x[i]!;
    const dy = hero.y - e.y[i]!;
    const d2 = dx * dx + dy * dy;
    if (d2 < foundD) {
      foundD = d2;
      found = i;
    }
  }
  return found;
}

/** Ne fait que fuir : il va vers l'endroit le moins dangereux (critère du document 02 §15). */
export const fleeBot: Bot = (run, input) => {
  safestDirection(run, BOT_TUNE.fleeReach);
  input.moveX = best.x;
  input.moveY = best.y;
};

/**
 * Un joueur simple mais actif : il fait face à la horde quand son arme est prête, recule entre deux coups,
 * ramasse les gemmes, et utilise tout ce qui est prêt.
 */
export const activeBot: Bot = (run, input) => {
  const hero = run.hero;
  const e = run.enemies;
  const hurt = hero.hp < hero.stats.maxHp * 0.4;
  let touching = 0;
  let close = 0;
  for (let i = 0; i < e.count; i++) {
    const dx = hero.x - e.x[i]!;
    const dy = hero.y - e.y[i]!;
    const d2 = dx * dx + dy * dy;
    const reach = run.enemyRadius[e.kind[i]!]! + BOT_TUNE.touch;
    if (d2 < reach * reach) touching++;
    if (d2 < 40 * 40) close++;
  }
  safestDirection(run, 60);
  let mx = best.x;
  let my = best.y;
  // Tant que rien ne le touche, il se bat ; blessé, il garde ses distances.
  const calm = touching === 0 && !(hurt && close >= 2) && !inTelegraph(run);
  if (calm) {
    const i = nearestToHero(run);
    let tx = 0;
    let ty = 0;
    let has = false;
    // L'arme dirigée frappe là où le héros regarde : il faut se tourner vers la horde au bon moment.
    let ready = false;
    let reachOut = 44;
    let directed = false;
    for (const w of run.weapons) {
      const def = run.data.weapons[w.def]!;
      if (def.aim !== 'directed') continue;
      const p = def.levels[Math.min(def.levels.length, w.level) - 1]!;
      directed = true;
      if (w.cd < BOT_TUNE.lead) ready = true;
      reachOut = def.behavior === 'arc' ? p.range * (1 + hero.stats.zone) : 110;
    }
    if (!directed) reachOut = 60;
    if (i >= 0) {
      const dx = e.x[i]! - hero.x;
      const dy = e.y[i]! - hero.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < reachOut + 34) {
        if (ready || !directed) {
          // Prêt à frapper : faire face, sans se jeter dans la mêlée.
          if (d > reachOut * 0.6 || directed) {
            tx = dx / d;
            ty = dy / d;
            has = true;
          }
        } else if (d < reachOut + 8) {
          // Entre deux coups : reculer vers l'endroit le plus sûr.
          tx = best.x;
          ty = best.y;
          has = true;
        }
      }
    }
    if (!has) {
      // Rien à frapper tout de suite : aller chercher ce qui traîne au sol.
      const p = run.pickups;
      let bestD = BOT_TUNE.gather * BOT_TUNE.gather;
      for (let k = 0; k < p.count; k++) {
        const dx = p.x[k]! - hero.x;
        const dy = p.y[k]! - hero.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          tx = dx;
          ty = dy;
          has = true;
        }
      }
      if (!has && i >= 0) {
        tx = e.x[i]! - hero.x;
        ty = e.y[i]! - hero.y;
        has = true;
      }
    }
    const len = Math.hypot(tx, ty);
    if (has && len > 1e-6) {
      tx /= len;
      ty /= len;
      // On ne suit cette envie que si le chemin n'est pas barré.
      if (!isSolidAt(run.map, hero.x + tx * 14, hero.y + ty * 14)) {
        mx = tx;
        my = ty;
      }
    }
  }
  input.moveX = mx;
  input.moveY = my;
  input.flask = hero.hp < hero.stats.maxHp * 0.4;
  input.skill = close >= 3;
  input.ultimate = close >= 4;
  input.dash = touching >= 3 || (hurt && touching >= 1);
};

/**
 * Quand l'explorateur sonne la cloche allumée : `ready`, quand aucune évolution n'attend et qu'il a plus de 60 %
 * de sa vie ; `asap`, dès qu'elle s'allume ; `never`, jamais (le boss vient avec la Nuit).
 */
export type RingPolicy = 'ready' | 'asap' | 'never';

/** Vrai si l'explorateur doit aller sonner maintenant. */
function wantsBell(run: Run, ring: RingPolicy): boolean {
  if (ring === 'never') return false;
  if (ring === 'asap') return true;
  return evolvableWeapons(run).length === 0 && run.hero.hp > run.hero.stats.maxHp * 0.6;
}

/** Le lieu que l'explorateur vise : la cloche s'il veut sonner, sinon le plus proche qui a encore quelque chose à donner. */
function nextPlace(run: Run, ring: RingPolicy): Poi | null {
  const hero = run.hero;
  const ev = run.data.tuning.events;
  const bell = run.map.pois.find((p) => p.kind === 'bell');
  if (bell && bell.state === 1 && wantsBell(run, ring)) return bell;
  let found: Poi | null = null;
  const ready = evolvableWeapons(run).length > 0;
  let foundD = Infinity;
  for (const poi of run.map.pois) {
    if (poi.state === 2 || poi.kind === 'portal' || poi.kind === 'memory' || poi.kind === 'bell') continue;
    // Un braséro déjà allumé n'a rien à donner tant qu'aucune arme n'est prête à évoluer.
    if (poi.state === 3 && !ready) continue;
    if (poi.kind === 'spring' && hero.hp > hero.stats.maxHp * 0.6) continue;
    if (poi.kind === 'smith') {
      if (hero.gold < ev.smith.basePrice + ev.smith.priceStep * run.smithBuys) continue;
      if (poi.offers && poi.offers.length === 0) continue;
    }
    if (poi.kind === 'herbalist') {
      // Il n'y va que pour une fiole : c'est le seul service qui le rend plus fort à coup sûr.
      const flask = ev.herbalist.services.flask;
      if (hero.gold < flask.base + flask.step * run.serviceBuys[0]!) continue;
    }
    const d = Math.hypot(poi.x - hero.x, poi.y - hero.y);
    if (d < foundD) {
      foundD = d;
      found = poi;
    }
  }
  return found;
}

/**
 * Un joueur qui explore : il se bat comme le robot actif, mais va de lieu en lieu tant qu'il est en
 * forme, reste dans les cercles à charger, et s'arrête chez les marchands quand il a de quoi payer.
 */
export function explorerWith(ring: RingPolicy): Bot {
  return (run, input) => explore(run, input, ring);
}

/** L'explorateur par défaut : il sonne la cloche quand il est prêt. */
export const explorerBot: Bot = explorerWith('ready');

function explore(run: Run, input: StepInput, ring: RingPolicy): void {
  const hero = run.hero;
  const d = run.director;
  // Après la cloche, plus rien à visiter : il attend le boss où il est.
  const target = d.bossSpawned || d.bellT >= 0 ? null : nextPlace(run, ring);
  anchor.on = target !== null;
  if (target) {
    anchor.x = target.x;
    anchor.y = target.y;
  }
  activeBot(run, input);
  anchor.on = false;
  if (!target || hero.hp < hero.stats.maxHp * 0.5) return;
  // Rien ne le serre de près : il marche vers le lieu, en contournant les obstacles.
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) {
    const reach = run.enemyRadius[e.kind[i]!]! + 26;
    if ((hero.x - e.x[i]!) ** 2 + (hero.y - e.y[i]!) ** 2 < reach * reach) return;
  }
  if (inTelegraph(run)) return;
  const dx = target.x - hero.x;
  const dy = target.y + 4 - hero.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) {
    input.moveX = 0;
    input.moveY = 0;
    return;
  }
  const base = Math.atan2(dy, dx);
  for (let k = 0; k < 9; k++) {
    // Tout droit, puis de plus en plus de côté, en alternant gauche et droite.
    const a = base + (k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8));
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    if (isSolidAt(run.map, hero.x + ux * 12, hero.y + uy * 12) || isSolidAt(run.map, hero.x + ux * 28, hero.y + uy * 28)) continue;
    input.moveX = ux;
    input.moveY = uy;
    return;
  }
}

/** Vrai si le héros est dans le tracé d'une attaque annoncée. */
function inTelegraph(run: Run): boolean {
  const tg = run.telegraphs;
  for (let t = 0; t < tg.count; t++) if (insideTelegraph(run, t, run.hero.x, run.hero.y, 12)) return true;
  return false;
}

/**
 * Un choix de carte de joueur appliqué : d'abord ce qui mène à une évolution (relique liée à une arme
 * portée, puis niveau d'une arme portée), puis le niveau d'une relique portée, puis une arme nouvelle,
 * puis une relique nouvelle. Quand tout est au maximum : un soin sous la moitié des points de vie,
 * sinon de l'or.
 */
export function plannedPick(run: Run): number {
  let best = 0;
  let bestScore = -1;
  const hero = run.hero;
  for (let i = 0; i < run.cards.length; i++) {
    const c = run.cards[i]!;
    let score = 0;
    if (c.kind === 'relic' && c.evolves) score = 6;
    else if (c.kind === 'weapon' && c.evolves) score = 5;
    else if (c.kind === 'relic' && c.level > 1) score = 4;
    else if (c.kind === 'weapon') score = 3;
    else if (c.kind === 'relic') score = 2;
    else if (c.kind === 'heal') score = hero.hp < hero.stats.maxHp * 0.5 ? 1.5 : 0.5;
    else score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Comment un robot mise sa Lueur aux totems. */
export type FeedPolicy = 'never' | 'smart' | 'max';

/** La Lueur que la politique « smart » veut garder après une mise, en part de la Lueur de base. */
const SMART_GLOW = 0.7;

/**
 * Nourrit les offres du totem selon la politique, puis renvoie l'indice de celle à prendre.
 * `never` : la première carte gratuite (sinon la moins chère), sans rien nourrir.
 * `max` : chaque carte est nourrie jusqu'au blocage, la plus rare est prise.
 * `smart` : pareil, mais un cran n'est monté que si la Lueur reste à 70 % ou plus.
 */
export function feedAndPick(run: Run, policy: FeedPolicy): number {
  const offers = run.totemOffers;
  if (policy === 'never') {
    let best = 0;
    for (let i = 1; i < offers.length; i++) if (offerCost(run, offers[i]!) < offerCost(run, offers[best]!)) best = i;
    return best;
  }
  for (let i = 0; i < offers.length; i++) {
    for (let target = feedTarget(run, i); target >= 0; target = feedTarget(run, i)) {
      const next = offerCost(run, { ...offers[i]!, rarity: target });
      if (policy === 'smart' && glowShareNow(run, next) < SMART_GLOW - 1e-9) break;
      if (!feedOffer(run, i)) break;
    }
  }
  let best = 0;
  for (let i = 1; i < offers.length; i++) if (offers[i]!.rarity > offers[best]!.rarity) best = i;
  return best;
}

/**
 * Marche vers un point en contournant les obstacles : tout droit si la voie est libre, sinon la première
 * direction libre en tournant toujours du même côté (le robot longe l'obstacle au lieu d'osciller).
 */
function walkAround(run: Run, input: StepInput, tx: number, ty: number): void {
  const hero = run.hero;
  const base = Math.atan2(ty - hero.y, tx - hero.x);
  for (let k = 0; k <= 7; k++) {
    const a = base + k * 0.45;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    if (k < 7 && (isSolidAt(run.map, hero.x + dx * 12, hero.y + dy * 12) || isSolidAt(run.map, hero.x + dx * 26, hero.y + dy * 26))) continue;
    input.moveX = dx;
    input.moveY = dy;
    return;
  }
}

export interface SimOptions {
  bot: Bot;
  /** Carte choisie à chaque montée de niveau (0 : toujours la première). */
  pickCard?: (run: Run) => number;
  /** Comment le robot mise sa Lueur aux totems (par défaut : jamais). */
  feed?: FeedPolicy;
  /** Nombre maximum de pas (par défaut : 20 minutes). */
  maxSteps?: number;
  /** Appelé à chaque pas, après la simulation. */
  onStep?: (run: Run) => void;
}

/**
 * Joue une partie entière sans affichage : le robot fournit les actions,
 * les choix de cartes et les coffres sont résolus tout de suite.
 */
export function simulate(run: Run, options: SimOptions): Run {
  const input = idleInput();
  const max = options.maxSteps ?? 20 * 60 * 60;
  let steps = 0;
  while (steps < max && run.phase !== 'dead' && run.phase !== 'victory') {
    if (run.phase === 'levelup') {
      const pick = options.pickCard ? options.pickCard(run) : 0;
      takeCard(run, Math.min(pick, run.cards.length - 1));
      continue;
    }
    if (run.phase === 'chest') {
      closeChest(run);
      continue;
    }
    if (run.phase === 'forge') {
      takeEvolution(run, 0);
      continue;
    }
    if (run.phase === 'totem') {
      if (!takeFlame(run, feedAndPick(run, options.feed ?? 'never'))) takeFlame(run, 0);
      continue;
    }
    if (run.phase === 'find') {
      closeFind(run);
      continue;
    }
    if (run.phase === 'shop') {
      // Le robot n'achète que ce qui le rend plus fort : une arme ou une relique, une fiole, et un baume
      // s'il est blessé. Il ne sait pas se servir d'une relance ni d'un bannissement.
      const items = shopItems(run);
      let best = -1;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const service = item.card ? '' : SERVICES[item.service]!;
        const useful = item.card !== null || service === 'flask' || (service === 'balm' && run.hero.hp < run.hero.stats.maxHp * 0.5);
        if (useful && canBuy(run, item) && (best < 0 || item.price < items[best]!.price)) best = i;
      }
      if (best < 0 || !buyItem(run, best)) closeShop(run);
      continue;
    }
    input.moveX = 0; input.moveY = 0; input.aimX = 0; input.aimY = 0;
    input.dash = false; input.skill = false; input.ultimate = false; input.flask = false;
    options.bot(run, input);
    // Après le boss, le robot rentre par le portail, ou par le Souvenir que le boss a laissé.
    const portal = run.map.pois.find((p) => (p.kind === 'portal' || p.kind === 'memory') && p.state === 0);
    if (portal) walkAround(run, input, portal.x, portal.y);
    stepRun(run, input);
    run.evCount = 0;
    options.onStep?.(run);
    steps++;
  }
  return run;
}

/** Une empreinte de l'état de la partie, pour comparer deux exécutions. */
export function hashRun(run: Run): number {
  let h = 2166136261;
  const mix = (v: number): void => {
    h ^= Math.round(v * 16) | 0;
    h = Math.imul(h, 16777619);
  };
  const hero = run.hero;
  mix(hero.x); mix(hero.y); mix(hero.hp); mix(hero.xp); mix(hero.level); mix(hero.gold); mix(hero.kills);
  mix(run.tick); mix(run.enemies.count); mix(run.shots.count); mix(run.pickups.count); mix(run.zones.count);
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) {
    mix(e.x[i]!); mix(e.y[i]!); mix(e.hp[i]!); mix(e.kind[i]!);
  }
  const p = run.pickups;
  for (let i = 0; i < p.count; i++) {
    mix(p.x[i]!); mix(p.y[i]!); mix(p.value[i]!);
  }
  for (const w of run.weapons) {
    mix(w.def); mix(w.level); mix(w.damageDone);
  }
  for (const f of run.flames) {
    mix(f.line); mix(f.rarity);
  }
  // Sans mise, l'empreinte reste celle d'une partie d'avant les Flammes.
  if (run.glowBurned > 0) mix(run.glowBurned);
  for (const l of run.lamps) {
    mix(l.x); mix(l.y); mix(l.radius); mix(l.life);
  }
  for (const t of run.threads) {
    mix(t.x1); mix(t.y1); mix(t.x2); mix(t.y2); mix(t.life);
  }
  for (const f of run.finds) mix(f);
  mix(hero.goldSpent); mix(run.smithBuys); mix(run.extraFlasks); mix(run.pendingFinds);
  for (const n of run.serviceBuys) mix(n);
  for (const poi of run.map.pois) {
    mix(poi.state); mix(poi.progress);
  }
  mix(run.rngSpawn.state); mix(run.rngDraw.state); mix(run.rngCombat.state);
  return h >>> 0;
}
