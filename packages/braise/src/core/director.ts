import { LADY_ABOVE, LADY_SIDE, LS_EMERGE } from './boss-lady.ts';
import { spawnEnemy } from './combat.ts';
import { isSolidAt } from './map.ts';
import { enemyHpScale, threatPerSecond } from './stats.ts';
import { emit, removeEnemy } from './stores.ts';
import { EV, type Run } from './types.ts';

const TAU = Math.PI * 2;
const point = { x: 0, y: 0, ok: false };

/** Limites de l'intérieur de la carte, en pixels. */
function interior(run: Run): { min: number; max: number } {
  const t = run.data.tuning;
  const min = t.borderTiles * t.tileSize + 12;
  return { min, max: t.mapTiles * t.tileSize - min };
}

/**
 * Cherche un point d'apparition à une distance donnée du héros, dans la carte et hors d'un obstacle.
 * Résultat dans `point`.
 */
function ringPoint(run: Run, angle: number, radius: number, flying: boolean): boolean {
  const hero = run.hero;
  const { min, max } = interior(run);
  let a = angle;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = hero.x + Math.cos(a) * radius;
    const y = hero.y + Math.sin(a) * radius;
    if (x > min && x < max && y > min && y < max && (flying || !isSolidAt(run.map, x, y))) {
      point.x = x;
      point.y = y;
      point.ok = true;
      return true;
    }
    a = run.rngSpawn.float() * TAU;
  }
  // En dernier recours, on ramène le point dans la carte.
  point.x = Math.min(max, Math.max(min, hero.x + Math.cos(a) * radius));
  point.y = Math.min(max, Math.max(min, hero.y + Math.sin(a) * radius));
  point.ok = flying || !isSolidAt(run.map, point.x, point.y);
  return point.ok;
}

function randomRing(run: Run): number {
  const ring = run.data.tuning.spawnRing;
  return ring[0] + run.rngSpawn.float() * (ring[1] - ring[0]);
}

/** Un angle d'apparition : une fois sur trois du côté vers lequel le héros avance. */
function spawnAngle(run: Run): number {
  const hero = run.hero;
  const rng = run.rngSpawn;
  if (hero.moving && rng.chance(run.data.tuning.director.forwardChance)) {
    return Math.atan2(hero.faceY, hero.faceX) + (rng.float() - 0.5) * 2.0;
  }
  return rng.float() * TAU;
}

function spawnPack(run: Run, kind: number, hpMult: number, x: number, y: number, count: number, spread: number): void {
  const rng = run.rngSpawn;
  for (let k = 0; k < count; k++) {
    const a = rng.float() * TAU;
    const r = rng.float() * spread;
    spawnEnemy(run, kind, x + Math.cos(a) * r, y + Math.sin(a) * r, hpMult);
  }
}

function spawnWave(run: Run, shape: 'circle' | 'line' | 'corners' | 'side', kind: number, count: number, angle: number): void {
  const def = run.data.enemies[kind]!;
  const hp = run.hpScaleNow;
  const ring = run.data.tuning.spawnRing;
  if (shape === 'circle') {
    for (let k = 0; k < count; k++) {
      if (ringPoint(run, angle + (k * TAU) / count, ring[0] + 10, def.flying)) spawnEnemy(run, kind, point.x, point.y, hp);
    }
  } else if (shape === 'line') {
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    const { min, max } = interior(run);
    for (let k = 0; k < count; k++) {
      const off = (k - (count - 1) / 2) * 18;
      const x = Math.min(max, Math.max(min, run.hero.x + cx * (ring[0] + 30) - cy * off));
      const y = Math.min(max, Math.max(min, run.hero.y + cy * (ring[0] + 30) + cx * off));
      if (def.flying || !isSolidAt(run.map, x, y)) spawnEnemy(run, kind, x, y, hp);
    }
  } else if (shape === 'corners') {
    for (let k = 0; k < count; k++) {
      if (ringPoint(run, Math.PI / 4 + (k * TAU) / count, ring[0] + 20, def.flying)) spawnEnemy(run, kind, point.x, point.y, hp);
    }
  } else {
    // « side » : deux paquets serrés, de deux côtés voisins.
    const half = Math.ceil(count / 2);
    for (let g = 0; g < 2; g++) {
      ringPoint(run, angle + g * 1.3, ring[0] + 20, def.flying);
      spawnPack(run, kind, hp, point.x, point.y, g === 0 ? half : count - half, def.pack ? 34 : 46);
    }
  }
}

function spawnElite(run: Run, kind: number): boolean {
  const def = run.data.enemies[kind]!;
  const radius = def.speed === 0 ? 230 : 330;
  ringPoint(run, spawnAngle(run), radius, false);
  const i = spawnEnemy(run, kind, point.x, point.y, run.hpScaleNow);
  if (i >= 0) {
    run.enemies.timer2[i] = 1.5;
    emit(run, EV.eliteSpawn, point.x, point.y, kind);
  }
  return i >= 0;
}

/**
 * Fait surgir des élites de la région, annoncés comme ceux du directeur (l'Appât). Rien pendant le boss
 * ni dans le tutoriel. Renvoie le nombre d'élites apparus.
 */
export function summonElites(run: Run, count: number): number {
  if (run.tutorial || run.director.bossSpawned || run.region.eliteIdx.length === 0) return 0;
  let spawned = 0;
  for (let k = 0; k < count; k++) if (spawnElite(run, run.rngSpawn.pick(run.region.eliteIdx))) spawned++;
  return spawned;
}

/** Fait apparaître le boss et referme la carte en une arène. */
function spawnBoss(run: Run): void {
  const d = run.director;
  const tuning = run.data.tuning;
  const hero = run.hero;
  const { min, max } = interior(run);
  const r = tuning.boss.arenaRadiusTiles * tuning.tileSize;
  d.arenaR = r;
  d.arenaX = Math.min(max - r, Math.max(min + r, hero.x));
  d.arenaY = Math.min(max - r, Math.max(min + r, hero.y));
  d.bossSpawned = true;
  // Les ennemis hors de l'arène disparaissent sans rien laisser.
  const e = run.enemies;
  for (let i = e.count - 1; i >= 0; i--) {
    if (Math.hypot(e.x[i]! - d.arenaX, e.y[i]! - d.arenaY) > r - 20) removeEnemy(e, i);
  }
  const kind = run.region.bossIdx;
  const def = run.data.enemies[kind]!;
  // Le boss ne suit pas l'échelle par minute, seulement celle de la Veillée.
  const hpMult = enemyHpScale(tuning.scale, 0, run.cfg.vigil - 1, 0);
  // Un boss qui sort de l'eau le fait à l'écran, à côté de Moon : on doit le voir se lever en entier.
  let bx = d.arenaX + (def.emerge !== undefined ? LADY_SIDE : 0);
  let by = d.arenaY - (def.emerge !== undefined ? LADY_ABOVE : 180);
  const keep = def.emerge !== undefined ? 100 : 140;
  for (let attempt = 0; attempt < 12 && (isSolidAt(run.map, bx, by) || Math.hypot(bx - hero.x, by - hero.y) < keep); attempt++) {
    const a = run.rngSpawn.float() * TAU;
    bx = d.arenaX + Math.cos(a) * 200;
    by = d.arenaY + Math.sin(a) * 200;
  }
  const i = spawnEnemy(run, kind, bx, by, hpMult);
  if (i >= 0) {
    e.timer2[i] = 2.2;
    if (def.emerge !== undefined) {
      // La Dame de Vase n'est pas là quand l'arène se referme : elle sort de l'eau.
      e.state[i] = LS_EMERGE;
      e.timer[i] = def.emerge;
      d.bossHidden = true;
    }
    d.tide = null;
    d.tideCd = 0;
    d.bossUid = e.uid[i]!;
    d.bossPhase = 1;
    d.bossLast = -1;
    d.bossNext = -1;
    d.bossTell = -1;
    d.bossTellT = -1;
    d.bossSummonT = def.summon?.cooldown ?? 0;
    d.bossSprayT = def.spray?.every[0] ?? 0;
    d.bossSprayA = 0;
    emit(run, EV.bossSpawn, bx, by, kind);
  }
}

/** Le directeur de horde : il dépense un budget de menace qui croît avec le temps (document 02 §8). */
export function updateDirector(run: Run, dt: number): void {
  const d = run.director;
  const tuning = run.data.tuning;
  const region = run.region;
  const enemies = run.data.enemies;
  const e = run.enemies;
  const rng = run.rngSpawn;
  const m = run.time / 60;
  const v = run.cfg.vigil - 1;
  // Le tutoriel n'a pas de horde : ses ennemis viennent du script.
  if (run.tutorial) {
    run.hpScaleNow = 1;
    return;
  }
  run.hpScaleNow = enemyHpScale(tuning.scale, Math.min(m, tuning.durationMin), v, 0);

  if (d.bossSpawned) return;
  // Une minute avant le boss, la partie prévient : la carte va se refermer.
  if (!run.bossWarned && m >= tuning.events.bossWarningMinute) {
    run.bossWarned = true;
    if (m < tuning.durationMin) emit(run, EV.bossWarning, run.hero.x, run.hero.y);
  }
  if (m >= tuning.durationMin) {
    spawnBoss(run);
    return;
  }

  // Budget, avec la respiration après un élite battu ou une montée de niveau.
  const threat = threatPerSecond(tuning.threat, m, v, 0) * run.mods.threatMult;
  let income = threat * dt;
  if (d.breathT > 0) {
    d.breathT -= dt;
    income *= tuning.director.breathFactor;
  }
  d.budget += income;
  // Aucun ennemi vivant : un budget immédiat, pour que l'écran ne reste pas vide.
  if (e.count === 0 && run.time > 1.5) {
    d.budget += threat * tuning.director.emptyBurstSeconds;
  }

  // Vagues scriptées de la région, annoncées une seconde avant.
  const wave = region.waves[d.waveIdx];
  if (wave) {
    const at = wave.at * 60;
    if (!d.waveWarned && run.time >= at - tuning.director.waveWarning) {
      d.waveWarned = true;
      d.waveAngle = rng.float() * TAU;
      emit(run, EV.waveWarning, run.hero.x, run.hero.y, d.waveAngle, wave.shape === 'circle' ? 1 : 0);
    }
    if (run.time >= at) {
      spawnWave(run, wave.shape, wave.enemy, wave.count, d.waveAngle);
      d.waveIdx++;
      d.waveWarned = false;
    }
  }

  // Élites.
  const eliteAt = tuning.eliteMinutes[d.eliteIdx];
  if (eliteAt !== undefined && m >= eliteAt) {
    spawnElite(run, d.eliteOrder[d.eliteIdx % d.eliteOrder.length]!);
    d.eliteIdx++;
  }

  // Achats : parmi les sortes entrées, selon les poids de la tranche.
  let slice = region.horde[0]!;
  for (let s = 0; s < region.horde.length; s++) {
    const h = region.horde[s]!;
    if (m >= h.from) slice = h;
  }
  const weights = d.scratch;
  let any = false;
  for (let k = 0; k < enemies.length; k++) {
    const w = enemies[k]!.entryMinute <= m ? slice.weights[k]! : 0;
    weights[k] = w;
    if (w > 0) any = true;
  }
  if (!any) return;
  const cap = tuning.enemyCap.expedition;
  for (let buys = 0; buys < 8; buys++) {
    if (e.count >= cap) {
      // Au plafond, le budget est mis de côté : il deviendra des ennemis plus forts.
      d.bank += d.budget;
      d.budget = 0;
      break;
    }
    // La sorte tirée attend que le budget la paie : sinon les moins chères passeraient toujours devant.
    if (d.nextKind < 0 || weights[d.nextKind]! <= 0) d.nextKind = rng.weighted(weights);
    const kind = d.nextKind;
    if (kind < 0) break;
    const def = enemies[kind]!;
    const pack = def.pack ?? 1;
    const cost = def.cost * pack;
    if (d.budget < cost) break;
    d.budget -= cost;
    d.nextKind = -1;
    let hpMult = run.hpScaleNow;
    if (d.bank >= cost) {
      d.bank -= cost;
      hpMult *= tuning.director.overflowHpMult;
    }
    if (!ringPoint(run, spawnAngle(run), randomRing(run), def.flying)) continue;
    if (pack > 1) spawnPack(run, kind, hpMult, point.x, point.y, pack, 30);
    else spawnEnemy(run, kind, point.x, point.y, hpMult);
  }
}
