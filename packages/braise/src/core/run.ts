import { Rng, deriveSeed } from '@owl/kit/rng';
import type { GameData, RegionDef } from '../content/index.ts';
import { DAMAGE_TYPES } from '../content/index.ts';
import { healHero, hurtEnemy, knockEnemy, reapEnemies } from './combat.ts';
import { updateDirector } from './director.ts';
import {
  clearTelegraphsOf, contactDamage, separateEnemies, updateEnemies, updateEnemyShots, updateFlow, updateTelegraphs,
} from './enemies.ts';
import { closeChest, gainXp, resumeRun } from './levelup.ts';
import { generateMap, isSolidForHero } from './map.ts';
import { updatePois } from './poi.ts';
import { cloneSheet, enemyDamageScale, resolveStats, runXpForNext, type HeroStats } from './stats.ts';
import {
  CELL, buildGrid, createEnemyShotStore, createEnemyStore, createPickupStore, createShotStore, createTelegraphStore,
  createZoneStore, emit, facingFromVector, queryCircle, removePickup, tutorialNote,
} from './stores.ts';
import { tutorialBossDead, tutorialRespawn, updateTutorial } from './tutorial.ts';
import {
  BH, CAP_ENEMIES, CAP_EVENTS, EV, HIT_NO_NUMBER, PK_ASH, PK_CALL, PK_CHEST, PK_DROP, PK_GEM, PK_GOLD, PK_RED_GEM, SERVICES, STEP, TILE_THICKET,
  type GameMap, type Hero, type Run, type RunConfig, type StepInput,
} from './types.ts';
import { addWeapon, updateShots, updateWeapons, updateZones } from './weapons.ts';

/** Un instantané d'actions où rien n'est pressé. */
export function idleInput(): StepInput {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, dash: false, skill: false, ultimate: false, flask: false };
}

/** Ce qu'une partie hors du commun impose : sa carte, sa région, son point de départ (le tutoriel). */
export interface RunOverrides {
  map?: GameMap;
  region?: RegionDef;
  startX?: number;
  startY?: number;
}

/** Crée une expédition à partir des données du jeu et d'une configuration. */
export function createRun(data: GameData, cfg: RunConfig, opts: RunOverrides = {}): Run {
  const region = opts.region ?? data.regions[cfg.regionId];
  const cls = data.classes[cfg.classId];
  if (!region) throw new Error(`Région inconnue : ${cfg.regionId}`);
  if (!cls) throw new Error(`Classe inconnue : ${cfg.classId}`);
  const tuning = data.tuning;
  // Des flux séparés : la carte, les apparitions, les tirages, le combat.
  const rngMap = new Rng(deriveSeed(cfg.seed, 0));
  const rngSpawn = new Rng(deriveSeed(cfg.seed, 1));
  const rngDraw = new Rng(deriveSeed(cfg.seed, 2));
  const rngCombat = new Rng(deriveSeed(cfg.seed, 3));
  const map = opts.map ?? generateMap(rngMap, tuning, region);
  const sheet = cloneSheet(cfg.sheet);
  const stats = resolveStats(sheet, tuning, data.heroTuning, {} as HeroStats);
  const center = (map.size * map.tile) / 2;
  const startX = opts.startX ?? center;
  const startY = opts.startY ?? center;
  const hero: Hero = {
    x: startX, y: startY, px: startX, py: startY,
    faceX: 0, faceY: 1, aimX: 0, aimY: 1, facing: 0, moving: false,
    hp: stats.maxHp, invuln: 0,
    dashT: 0, dashCd: 0, dashX: 0, dashY: 1,
    flasks: stats.flasks, skillCd: 0, buffT: 0, ultGauge: 0, ultT: 0, ultTick: 0,
    revives: stats.revives,
    level: 1, xp: 0, xpNext: runXpForNext(1, tuning.xp),
    gold: 0, goldSpent: 0, ashDrops: 0, gems: 0, kills: 0, elites: 0, bossKills: 0,
    rerolls: stats.rerolls, banishes: stats.banishes, damageTaken: 0,
    stats,
  };
  const gridCols = Math.ceil((map.size * map.tile) / CELL);
  const kinds = data.enemies.length;
  const enemyRadius = new Float32Array(kinds);
  const enemyBehavior = new Uint8Array(kinds);
  data.enemies.forEach((e, i) => {
    enemyRadius[i] = e.radius;
    enemyBehavior[i] = BH[e.behavior];
  });
  const unlockedWeapons = new Set(cfg.unlockedWeapons);
  const unlockedRelics = new Set(cfg.unlockedRelics);
  const run: Run = {
    data, cfg, region, cls,
    rngMap, rngSpawn, rngDraw, rngCombat,
    tick: 0, time: 0, phase: 'playing',
    map, hero, sheet,
    weapons: [], relics: [], acquired: 0,
    enemies: createEnemyStore(), shots: createShotStore(), enemyShots: createEnemyShotStore(),
    zones: createZoneStore(), telegraphs: createTelegraphStore(), pickups: createPickupStore(),
    director: {
      budget: 0, bank: 0, breathT: 0, second: 0, waveIdx: 0, waveWarned: false, waveAngle: 0,
      eliteIdx: 0, eliteOrder: rngSpawn.shuffle(region.eliteIdx.slice()),
      bossSpawned: false, bossUid: 0, bossPhase: 0, bossSummonT: 0, bossLast: -1, bossNext: -1, bossDead: false,
      arenaX: 0, arenaY: 0, arenaR: 0,
      scratch: new Float32Array(kinds),
    },
    dmgScale: 1, hpScaleNow: 1,
    pendingLevels: 0, cards: [], banned: new Set(), pityCount: 0,
    weaponPool: data.weapons.filter((w) => !w.evolved && (unlockedWeapons.has(w.id) || w.index === cls.startWeaponIndex)).map((w) => w.index),
    relicPool: data.relics.filter((r) => unlockedRelics.has(r.id)).map((r) => r.index),
    pendingChests: 0, chest: null, evolutions: 0, forgeChoices: [], forgePoi: -1,
    boons: [], finds: [], findPool: rngDraw.shuffle(data.finds.map((_, i) => i)),
    pendingFinds: 0, find: -1, findGold: 0, totemChoices: [], shopPoi: -1,
    smithBuys: 0, serviceBuys: SERVICES.map(() => 0), extraFlasks: 0, bossWarned: false,
    gridStart: new Int32Array(gridCols * gridCols + 1),
    gridItems: new Int32Array(CAP_ENEMIES),
    gridCursor: new Int32Array(gridCols * gridCols),
    gridCols, gridBuiltCount: 0,
    query: new Int32Array(CAP_ENEMIES),
    enemyRadius, enemyBehavior,
    flow: new Uint16Array(map.size * map.size),
    flowQueue: new Int32Array(map.size * map.size),
    flowTileX: -1, flowTileY: -1, flowAge: 0,
    evCount: 0,
    evType: new Uint8Array(CAP_EVENTS),
    evX: new Float32Array(CAP_EVENTS), evY: new Float32Array(CAP_EVENTS),
    evA: new Float32Array(CAP_EVENTS), evB: new Float32Array(CAP_EVENTS), evC: new Float32Array(CAP_EVENTS),
    killsByKind: new Uint32Array(kinds),
    damageByKind: new Float32Array(kinds),
    braziersLit: 0,
    memoryTaken: false,
    tutorial: null,
    outcome: null,
  };
  addWeapon(run, cls.startWeaponIndex);
  return run;
}

/** Déplace le héros d'un vecteur, en glissant le long des obstacles. */
function moveHeroBy(run: Run, dx: number, dy: number, dashing = false): void {
  const hero = run.hero;
  const map = run.map;
  const isSolidAt = (m: GameMap, x: number, y: number): boolean => isSolidForHero(m, x, y, dashing);
  const r = run.data.tuning.hero.radius;
  const side = r * 0.7;
  if (dx !== 0) {
    const nx = hero.x + dx;
    const edge = nx + Math.sign(dx) * r;
    const up = isSolidAt(map, edge, hero.y - side);
    const down = isSolidAt(map, edge, hero.y + side);
    if (!up && !down) {
      hero.x = nx;
    } else if (up !== down && Math.abs(dy) < Math.abs(dx) * 0.3) {
      // Accroché par un seul coin : on glisse le long de l'obstacle au lieu de rester bloqué.
      const slide = (up ? 1 : -1) * Math.abs(dx);
      if (!isSolidAt(map, hero.x - side, hero.y + slide + Math.sign(slide) * r) && !isSolidAt(map, hero.x + side, hero.y + slide + Math.sign(slide) * r)) {
        hero.y += slide;
      }
    }
  }
  if (dy !== 0) {
    const ny = hero.y + dy;
    const edge = ny + Math.sign(dy) * r;
    const left = isSolidAt(map, hero.x - side, edge);
    const right = isSolidAt(map, hero.x + side, edge);
    if (!left && !right) {
      hero.y = ny;
    } else if (left !== right && Math.abs(dx) < Math.abs(dy) * 0.3) {
      const slide = (left ? 1 : -1) * Math.abs(dy);
      if (!isSolidAt(map, hero.x + slide + Math.sign(slide) * r, hero.y - side) && !isSolidAt(map, hero.x + slide + Math.sign(slide) * r, hero.y + side)) {
        hero.x += slide;
      }
    }
  }
  // Pendant le boss, la carte se referme en une arène.
  const d = run.director;
  if (d.bossSpawned && !d.bossDead) {
    const ax = hero.x - d.arenaX;
    const ay = hero.y - d.arenaY;
    const dist = Math.hypot(ax, ay);
    const max = d.arenaR - 10;
    if (dist > max) {
      hero.x = d.arenaX + (ax / dist) * max;
      hero.y = d.arenaY + (ay / dist) * max;
    }
  }
}

export { facingFromVector };

/** Vrai si le corps du héros mord sur une tuile de la rangée d'Éteints. */
function inThicket(run: Run): boolean {
  const map = run.map;
  const hero = run.hero;
  const r = run.data.tuning.hero.radius;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const tx = Math.floor((hero.x + ox) / map.tile);
    const ty = Math.floor((hero.y + oy) / map.tile);
    if (tx >= 0 && ty >= 0 && tx < map.size && ty < map.size && map.solid[ty * map.size + tx] === TILE_THICKET) return true;
  }
  return false;
}

function moveHero(run: Run, input: StepInput, dt: number): void {
  const hero = run.hero;
  const tuning = run.data.tuning;
  hero.px = hero.x;
  hero.py = hero.y;
  if (hero.invuln > 0) hero.invuln -= dt;
  if (hero.dashCd > 0) hero.dashCd -= dt;
  if (hero.skillCd > 0) hero.skillCd -= dt;
  if (hero.buffT > 0) hero.buffT -= dt;
  if (hero.hp < hero.stats.maxHp) hero.hp = Math.min(hero.stats.maxHp, hero.hp + hero.stats.regen * dt);

  let mx = input.moveX;
  let my = input.moveY;
  let len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
    len = 1;
  }
  hero.moving = len > 0.001;
  if (hero.moving) {
    hero.faceX = mx / len;
    hero.faceY = my / len;
    hero.facing = facingFromVector(hero.faceX, hero.faceY);
  }
  // Visée manuelle tant que le stick droit est poussé, sinon la direction de déplacement.
  const aimLen = Math.hypot(input.aimX, input.aimY);
  if (aimLen > 0.001) {
    hero.aimX = input.aimX / aimLen;
    hero.aimY = input.aimY / aimLen;
  } else {
    hero.aimX = hero.faceX;
    hero.aimY = hero.faceY;
  }

  if (input.dash && hero.dashT <= 0 && hero.dashCd <= 0) {
    hero.dashT = tuning.dash.duration;
    hero.dashCd = tuning.dash.cooldown;
    hero.dashX = hero.faceX;
    hero.dashY = hero.faceY;
    emit(run, EV.heroDash, hero.x, hero.y, Math.atan2(hero.dashY, hero.dashX));
    tutorialNote(run, 'dash');
  }
  if (hero.dashT > 0) {
    // La ruée traverse les ennemis, pas les obstacles. Découpée pour ne pas sauter une tuile.
    const dist = (tuning.dash.distance / tuning.dash.duration) * Math.min(dt, hero.dashT);
    const parts = Math.max(1, Math.ceil(dist / 5));
    for (let k = 0; k < parts; k++) moveHeroBy(run, (hero.dashX * dist) / parts, (hero.dashY * dist) / parts, true);
    hero.dashT -= dt;
  } else if (run.tutorial && inThicket(run)) {
    // Une ruée finie dans la rangée d'Éteints : l'élan l'emporte jusqu'à en sortir, et s'il bute, il revient.
    const dist = (tuning.dash.distance / tuning.dash.duration) * dt;
    const bx = hero.x;
    const by = hero.y;
    const parts = Math.max(1, Math.ceil(dist / 5));
    for (let k = 0; k < parts && inThicket(run); k++) moveHeroBy(run, (hero.dashX * dist) / parts, (hero.dashY * dist) / parts, true);
    if (hero.x === bx && hero.y === by) {
      hero.dashX = -hero.dashX;
      hero.dashY = -hero.dashY;
    }
  } else if (hero.moving) {
    const speed = hero.stats.speed * dt;
    moveHeroBy(run, mx * speed, my * speed);
  }
}

/** Fiole, compétence et ultime. Appelé après la reconstruction de la grille. */
function heroAbilities(run: Run, input: StepInput, dt: number): void {
  const hero = run.hero;
  const tuning = run.data.tuning;
  const cls = run.cls;
  const auto = run.cfg.autoSkills;

  if (input.flask && hero.flasks > 0 && hero.hp < hero.stats.maxHp) {
    hero.flasks--;
    healHero(run, hero.stats.maxHp * tuning.flask.healShare);
    emit(run, EV.flask, hero.x, hero.y);
    tutorialNote(run, 'flask');
  }

  const skill = cls.skill;
  let wantSkill = input.skill;
  let wantUlt = input.ultimate;
  if (auto && (hero.skillCd <= 0 || hero.ultGauge >= tuning.ultimate.gaugeMax)) {
    // Compétences automatiques : dès qu'elles sont prêtes et qu'un ennemi est à portée.
    if (hero.skillCd <= 0 && queryCircle(run, hero.x, hero.y, skill.autoRange) >= 4) wantSkill = true;
    if (hero.ultGauge >= tuning.ultimate.gaugeMax && queryCircle(run, hero.x, hero.y, cls.ultimate.autoRange) >= 8) wantUlt = true;
  }
  if (wantSkill && hero.skillCd <= 0) {
    hero.skillCd = skill.cooldown;
    hero.buffT = skill.duration;
    const n = queryCircle(run, hero.x, hero.y, skill.radius);
    for (let k = 0; k < n; k++) knockEnemy(run, run.query[k]!, hero.x, hero.y, skill.knockback);
    emit(run, EV.skill, hero.x, hero.y, skill.radius);
  }

  const ult = cls.ultimate;
  if (wantUlt && hero.ultT <= 0 && hero.ultGauge >= tuning.ultimate.gaugeMax) {
    hero.ultGauge = 0;
    hero.ultT = ult.duration;
    hero.ultTick = 0;
    emit(run, EV.ultimate, hero.x, hero.y, ult.radius);
  }
  if (hero.ultT > 0) {
    hero.ultT -= dt;
    hero.ultTick -= dt;
    if (hero.ultTick <= 0) {
      hero.ultTick += 1 / ult.ticksPerSecond;
      const type = DAMAGE_TYPES.indexOf(ult.damageType);
      const n = queryCircle(run, hero.x, hero.y, ult.radius);
      for (let k = 0; k < n; k++) hurtEnemy(run, run.query[k]!, ult.damage, type, ult.scale, -1, 0);
      emit(run, EV.ultTick, hero.x, hero.y, ult.radius);
    }
  }
}

/** Aimantation et collecte des ramassables. */
function updatePickups(run: Run, dt: number): void {
  const p = run.pickups;
  const hero = run.hero;
  const gems = run.data.tuning.gems;
  const glow = hero.stats.glow;
  const collect2 = gems.collectRadius * gems.collectRadius;
  for (let i = p.count - 1; i >= 0; i--) {
    p.px[i] = p.x[i]!;
    p.py[i] = p.y[i]!;
    p.age[i]! += dt;
    const dx = hero.x - p.x[i]!;
    const dy = hero.y - 6 - p.y[i]!;
    const d2 = dx * dx + dy * dy;
    const kind = p.kind[i]!;
    // La lueur est le rayon de collecte : tout ce qui y entre vole vers le héros.
    if (!p.attracted[i] && d2 < glow * glow && p.age[i]! > 0.15) p.attracted[i] = 1;
    if (p.attracted[i]) {
      const d = Math.sqrt(d2) || 1;
      p.speed[i] = Math.min(gems.magnetSpeed * 2.2, p.speed[i]! + gems.magnetSpeed * 3 * dt);
      const step = Math.min(d, (gems.magnetSpeed * 0.4 + p.speed[i]!) * dt);
      p.x[i]! += (dx / d) * step;
      p.y[i]! += (dy / d) * step;
    }
    if (d2 > collect2) continue;
    const value = p.value[i]!;
    switch (kind) {
      case PK_GEM:
      case PK_RED_GEM:
        hero.gems++;
        gainXp(run, value);
        break;
      case PK_GOLD: hero.gold += value; break;
      case PK_ASH: hero.ashDrops += value; break;
      case PK_DROP: hero.flasks = Math.min(hero.stats.flasks, hero.flasks + 1); break;
      case PK_CHEST: run.pendingChests++; break;
      case PK_CALL:
        // L'Appel de la flamme attire toutes les gemmes de la carte.
        for (let k = 0; k < p.count; k++) if (p.kind[k] === PK_GEM || p.kind[k] === PK_RED_GEM) p.attracted[k] = 1;
        emit(run, EV.flameCall, hero.x, hero.y);
        break;
    }
    emit(run, EV.pickup, hero.x, hero.y, kind, value);
    removePickup(p, i);
  }
}

/** Le boss est tombé : la horde s'effondre et le portail s'ouvre. */
function onBossDeath(run: Run): void {
  const e = run.enemies;
  const d = run.director;
  d.bossDead = true;
  for (let i = 0; i < e.count; i++) {
    emit(run, EV.kill, e.x[i]!, e.y[i]!, e.kind[i]!);
  }
  e.count = 0;
  run.enemyShots.count = 0;
  run.telegraphs.count = 0;
  // Un boss qui garde encore un souvenir le laisse à la place du portail : c'est lui qui ramène au refuge.
  const memory = Boolean(run.cfg.memory);
  run.map.pois.push({
    kind: memory ? 'memory' : 'portal', x: d.arenaX, y: d.arenaY, state: 0, progress: 0, discovered: true, guardUid: 0, offers: null,
    armed: !memory,
  });
}

/**
 * Avance la simulation d'un pas fixe. L'ordre est celui du document 08 §4.5.
 * Sans effet si la partie attend un choix (montée de niveau, coffre) ou est finie.
 */
export function stepRun(run: Run, input: StepInput): void {
  if (run.phase !== 'playing') return;
  const dt = STEP;
  const tuning = run.data.tuning;
  run.tick++;
  run.time += dt;
  // Le tutoriel ne durcit pas avec le temps.
  run.dmgScale = run.tutorial ? 1 : enemyDamageScale(tuning.scale, Math.min(run.time / 60, tuning.durationMin), run.cfg.vigil - 1, 0);

  updateDirector(run, dt);
  moveHero(run, input, dt);
  updateFlow(run);
  updateEnemies(run, dt);
  buildGrid(run);
  separateEnemies(run);
  heroAbilities(run, input, dt);
  updateWeapons(run, dt);
  updateShots(run, dt);
  updateZones(run, dt);
  updateEnemyShots(run, dt);
  updateTelegraphs(run, dt);
  contactDamage(run);

  // Les élites et le boss morts emportent leurs annonces.
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0 && run.data.enemies[e.kind[i]!]!.rank !== 'normal') clearTelegraphsOf(run, e.uid[i]!);
  }
  const bossKilled = reapEnemies(run);
  if (bossKilled) {
    if (run.tutorial) tutorialBossDead(run);
    else onBossDeath(run);
  }

  // La mort est résolue avant toute montée de niveau : un héros mort ne choisit pas.
  const hero = run.hero;
  if (hero.hp <= 0) {
    if (bossKilled) {
      // Boss battu dans la même image : la victoire l'emporte.
      hero.hp = 1;
    } else if (hero.revives > 0) {
      hero.revives--;
      hero.hp = Math.round(hero.stats.maxHp * tuning.hero.reviveHpShare);
      hero.invuln = 2;
      const n = queryCircle(run, hero.x, hero.y, tuning.hero.reviveRadius);
      for (let k = 0; k < n; k++) {
        knockEnemy(run, run.query[k]!, hero.x, hero.y, tuning.hero.reviveKnockback);
        hurtEnemy(run, run.query[k]!, 1, 0, null, -1, HIT_NO_NUMBER);
      }
      emit(run, EV.heroRevive, hero.x, hero.y);
    } else if (run.tutorial) {
      // On ne perd pas le tutoriel : Moon reprend à l'entrée de la salle.
      tutorialRespawn(run);
    } else {
      hero.hp = 0;
      run.outcome = 'death';
      run.phase = 'dead';
      emit(run, EV.heroDeath, hero.x, hero.y);
      return;
    }
  }

  updatePickups(run, dt);
  updatePois(run, dt);
  if (run.phase !== 'playing') return;
  updateTutorial(run, dt);
  if (run.phase !== 'playing') return;
  resumeRun(run);
}

/** Abandonner depuis le menu de pause compte comme une mort. */
export function abandonRun(run: Run): void {
  if (run.phase === 'dead' || run.phase === 'victory') return;
  run.outcome = 'abandon';
  run.phase = 'dead';
}

/** Vide la file d'événements, une fois lue par le rendu et le son. */
export function clearEvents(run: Run): void {
  run.evCount = 0;
}

export { closeChest };
