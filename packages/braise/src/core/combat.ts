import { DMG_FIRE, DMG_PHYSICAL, type Attribute } from '../content/index.ts';
import { damageTaken } from './stats.ts';
import { addTelegraph, clearEnemy, emit, removeEnemy, removePickup } from './stores.ts';
import {
  CAP_ENEMIES, CAP_PICKUPS, EV, HIT_BLEED, HIT_BURN, HIT_CRIT, HIT_NO_NUMBER, HIT_RESIST, HIT_WEAK,
  PK_ASH, PK_CALL, PK_CHEST, PK_DROP, PK_GEM, PK_GOLD, PK_RED_GEM, ST_BLEED, ST_BURN, ST_FROZEN, ST_SHOCK, ST_SLOW,
  TG_CIRCLE, type Run,
} from './types.ts';

/** Pose un ramassable au sol. Au-delà du plafond de gemmes, les plus anciennes fusionnent. */
export function addPickup(run: Run, kind: number, x: number, y: number, value: number): void {
  const p = run.pickups;
  const gems = run.data.tuning.gems;
  if (kind === PK_GEM && (p.count >= gems.mergeAbove || p.count >= CAP_PICKUPS - 8)) {
    // La gemme la plus ancienne rejoint une gemme rouge qui garde le total.
    let oldest = -1;
    let red = -1;
    for (let i = 0; i < p.count; i++) {
      if (p.kind[i] === PK_RED_GEM) red = i;
      else if (p.kind[i] === PK_GEM && oldest === -1) oldest = i;
    }
    if (oldest >= 0) {
      if (red >= 0) {
        p.value[red]! += p.value[oldest]!;
        removePickup(p, oldest);
      } else {
        p.kind[oldest] = PK_RED_GEM;
      }
    }
  }
  if (p.count >= CAP_PICKUPS) return;
  const i = p.count++;
  p.x[i] = x; p.y[i] = y; p.px[i] = x; p.py[i] = y;
  p.kind[i] = kind; p.value[i] = value; p.attracted[i] = 0; p.speed[i] = 0; p.age[i] = 0;
}

/** Fait apparaître un ennemi. Renvoie son indice, ou -1 si la réserve est pleine. */
export function spawnEnemy(run: Run, kind: number, x: number, y: number, hpMult = 1): number {
  const e = run.enemies;
  if (e.count >= CAP_ENEMIES) return -1;
  const def = run.data.enemies[kind]!;
  const i = e.count++;
  clearEnemy(e, i);
  e.x[i] = x; e.y[i] = y; e.px[i] = x; e.py[i] = y;
  e.kind[i] = kind;
  e.uid[i] = e.nextUid++;
  const hp = Math.max(1, Math.round(def.hp * hpMult * (def.rank === 'elite' ? run.mods.eliteHpMult : 1)));
  e.hp[i] = hp; e.maxHp[i] = hp;
  e.timer[i] = run.rngSpawn.float() * 2;
  e.dirX[i] = run.rngSpawn.float() * 6.283;
  return i;
}

function typedMultiplier(run: Run, i: number, type: number): number {
  const def = run.data.enemies[run.enemies.kind[i]!]!;
  if (def.weakIdx === type) return 1 + run.data.tuning.weakness;
  if (def.resistIdx === type) return 1 - run.data.tuning.resistance;
  return 1;
}

/** Le boss retombé en poussière : rien ne le touche jusqu'à ce qu'il se relève. */
export function isDust(run: Run, i: number): boolean {
  const d = run.director;
  return d.bossReformT > 0 && run.enemies.uid[i] === d.bossUid;
}

/** La part de la barre du boss : pendant la poussière, elle se remplit depuis zéro. */
export function bossBarFrac(run: Run, i: number): number {
  const e = run.enemies;
  const reform = run.data.enemies[e.kind[i]!]!.reform;
  if (reform && isDust(run, i)) return Math.max(0, 1 - run.director.bossReformT / reform.duration);
  return Math.max(0, e.hp[i]! / e.maxHp[i]!);
}

function registerDamage(run: Run, i: number, dmg: number, slot: number, flags: number): void {
  const e = run.enemies;
  e.hp[i]! -= dmg;
  if (slot >= 0 && slot < run.weapons.length) run.weapons[slot]!.damageDone += dmg;
  if ((flags & HIT_NO_NUMBER) === 0) {
    e.dmgAcc[i]! += dmg;
    e.dmgFlags[i]! |= flags & (HIT_CRIT | HIT_WEAK | HIT_RESIST);
  }
  if (e.flash[i]! <= -0.12) e.flash[i] = 0.08;
}

/** Vrai quand Dernière lueur agit : les points de vie sont sous son seuil. */
export function lowHp(run: Run): boolean {
  return run.mods.lowHpPower > 0 && run.hero.hp < run.hero.stats.maxHp * run.mods.lowHpShare;
}

/**
 * Inflige les dégâts d'une arme à un ennemi, selon la formule du document 02 §11.
 * Renvoie les dégâts infligés (0 si l'ennemi est déjà mort).
 */
export function hurtEnemy(run: Run, i: number, base: number, type: number, scale: Attribute | null, slot: number, flags = 0): number {
  const e = run.enemies;
  if (e.hp[i]! <= 0 || isDust(run, i)) return 0;
  const hero = run.hero;
  const st = hero.stats;
  const def = run.data.enemies[e.kind[i]!]!;
  const tuning = run.data.tuning;
  let power = st.power;
  if (hero.buffT > 0) power += run.cls.skill.damageBonus;
  const passive = run.cls.passive;
  const dx = e.x[i]! - hero.x;
  const dy = e.y[i]! - hero.y;
  if (dx * dx + dy * dy < passive.range * passive.range) power += passive.bonus;
  if (def.rank !== 'normal') power += st.eliteDamage;
  if (lowHp(run)) power += run.mods.lowHpPower;
  power += run.mods.eliteKillPower * hero.elites;
  let dmg = base * (1 + power);
  if (scale) dmg *= 1 + run.data.heroTuning.damagePerScalePoint * st.attrs[scale];
  let outFlags = flags;
  if (run.rngCombat.float() < st.critChance) {
    dmg *= st.critMult;
    outFlags |= HIT_CRIT;
  }
  const typed = typedMultiplier(run, i, type);
  if (typed > 1) outFlags |= HIT_WEAK;
  else if (typed < 1) outFlags |= HIT_RESIST;
  dmg *= typed;
  if (e.status[i]! & ST_SHOCK) dmg *= 1 + tuning.statuses.shock.bonus;
  dmg = Math.max(1, Math.round(dmg));
  registerDamage(run, i, dmg, slot, outFlags);
  if (flags & HIT_BURN) applyBurn(run, i, dmg);
  if (flags & HIT_BLEED) applyBleed(run, i, dmg);
  return dmg;
}

/** Dégâts d'un état (Brûlure, Saignement) : ni Puissance ni critique. */
function statusDamage(run: Run, i: number, amount: number, type: number): void {
  if (run.enemies.hp[i]! <= 0 || isDust(run, i)) return;
  const dmg = Math.max(1, Math.round(amount * typedMultiplier(run, i, type)));
  registerDamage(run, i, dmg, -1, 0);
}

/** Brûlure : se rafraîchit, ne se cumule pas. */
export function applyBurn(run: Run, i: number, hitDamage: number): void {
  const e = run.enemies;
  const b = run.data.tuning.statuses.burn;
  const dmg = Math.max(1, hitDamage * b.damageShare);
  if ((e.status[i]! & ST_BURN) === 0) e.burnTick[i] = b.tick;
  e.status[i]! |= ST_BURN;
  e.burnT[i] = b.duration;
  if (dmg > e.burnDmg[i]!) e.burnDmg[i] = dmg;
}

/** Saignement : cumulable. */
export function applyBleed(run: Run, i: number, hitDamage: number): void {
  const e = run.enemies;
  const b = run.data.tuning.statuses.bleed;
  if ((e.status[i]! & ST_BLEED) === 0) {
    e.bleedTick[i] = b.tick;
    e.bleedStacks[i] = 0;
    e.bleedDmg[i] = 0;
  }
  e.status[i]! |= ST_BLEED;
  e.bleedT[i] = b.duration;
  if (e.bleedStacks[i]! < b.maxStacks) e.bleedStacks[i]!++;
  const dmg = Math.max(1, hitDamage * b.damageShare);
  if (dmg > e.bleedDmg[i]!) e.bleedDmg[i] = dmg;
}

/** Choc : l'ennemi subit plus de dégâts. */
export function applyShock(run: Run, i: number): void {
  run.enemies.status[i]! |= ST_SHOCK;
  run.enemies.shockT[i] = run.data.tuning.statuses.shock.duration;
}

/** Gel : ralentit ; trois applications rapprochées figent. Les boss ne sont jamais figés. */
export function applyFreeze(run: Run, i: number): void {
  const e = run.enemies;
  const f = run.data.tuning.statuses.freeze;
  const boss = run.data.enemies[e.kind[i]!]!.rank === 'boss';
  e.status[i]! |= ST_SLOW;
  e.slowT[i] = f.duration;
  if (boss) return;
  if (e.freezeWindow[i]! <= 0) e.freezeStacks[i] = 0;
  e.freezeWindow[i] = f.stackWindow;
  e.freezeStacks[i]!++;
  if (e.freezeStacks[i]! >= f.stacksToFreeze) {
    e.freezeStacks[i] = 0;
    stunEnemy(run, i, f.freezeDuration);
  }
}

/** Immobilise un ennemi (figé ou étourdi). Sans effet sur un boss. */
export function stunEnemy(run: Run, i: number, seconds: number): void {
  const e = run.enemies;
  if (run.data.enemies[e.kind[i]!]!.rank === 'boss') return;
  e.status[i]! |= ST_FROZEN;
  if (seconds > e.frozenT[i]!) e.frozenT[i] = seconds;
}

/** Repousse un ennemi depuis un point. */
export function knockEnemy(run: Run, i: number, fromX: number, fromY: number, force: number): void {
  const e = run.enemies;
  const def = run.data.enemies[e.kind[i]!]!;
  const f = force * (1 + run.hero.stats.knockback) * (1 - def.kbResist);
  if (f <= 0) return;
  let dx = e.x[i]! - fromX;
  let dy = e.y[i]! - fromY;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  e.vx[i]! += dx * f;
  e.vy[i]! += dy * f;
}

/** Fait avancer les états d'un ennemi d'un pas. Renvoie le facteur de vitesse (0 : figé). */
export function tickStatuses(run: Run, i: number, dt: number): number {
  const e = run.enemies;
  const st = e.status[i]!;
  // Nombres de dégâts groupés : un par ennemi tous les quarts de seconde au plus.
  if (e.dmgAccT[i]! > 0) e.dmgAccT[i]! -= dt;
  if (e.dmgAcc[i]! > 0 && e.dmgAccT[i]! <= 0) {
    emit(run, EV.damageNumber, e.x[i]!, e.y[i]!, e.dmgAcc[i]!, e.dmgFlags[i]!);
    e.dmgAcc[i] = 0;
    e.dmgFlags[i] = 0;
    e.dmgAccT[i] = run.data.tuning.damageNumberInterval;
  }
  if (e.flash[i]! > -0.2) e.flash[i]! -= dt;
  if (st === 0) return 1;
  const tuning = run.data.tuning.statuses;
  let speed = 1;
  if (st & ST_BURN) {
    e.burnT[i]! -= dt;
    e.burnTick[i]! -= dt;
    if (e.burnTick[i]! <= 0) {
      e.burnTick[i]! += tuning.burn.tick;
      statusDamage(run, i, e.burnDmg[i]!, DMG_FIRE);
    }
    if (e.burnT[i]! <= 0) {
      e.status[i]! &= ~ST_BURN;
      e.burnDmg[i] = 0;
    }
  }
  if (st & ST_BLEED) {
    e.bleedT[i]! -= dt;
    e.bleedTick[i]! -= dt;
    if (e.bleedTick[i]! <= 0) {
      e.bleedTick[i]! += tuning.bleed.tick;
      statusDamage(run, i, e.bleedDmg[i]! * e.bleedStacks[i]!, DMG_PHYSICAL);
    }
    if (e.bleedT[i]! <= 0) e.status[i]! &= ~ST_BLEED;
  }
  if (st & ST_SHOCK) {
    e.shockT[i]! -= dt;
    if (e.shockT[i]! <= 0) e.status[i]! &= ~ST_SHOCK;
  }
  if (e.freezeWindow[i]! > 0) e.freezeWindow[i]! -= dt;
  if (st & ST_SLOW) {
    e.slowT[i]! -= dt;
    const boss = run.data.enemies[e.kind[i]!]!.rank === 'boss';
    speed = 1 - (boss ? tuning.freeze.bossSlowCap : tuning.freeze.slow);
    if (e.slowT[i]! <= 0) e.status[i]! &= ~ST_SLOW;
  }
  if (st & ST_FROZEN) {
    e.frozenT[i]! -= dt;
    speed = 0;
    if (e.frozenT[i]! <= 0) e.status[i]! &= ~ST_FROZEN;
  }
  return speed;
}

/** Rend des points de vie au héros. */
export function healHero(run: Run, amount: number): void {
  const hero = run.hero;
  if (hero.hp <= 0) return;
  const before = hero.hp;
  hero.hp = Math.min(hero.stats.maxHp, hero.hp + amount * run.mods.healMult);
  if (hero.hp > before) emit(run, EV.heroHeal, hero.x, hero.y, hero.hp - before);
}

/**
 * Inflige des dégâts bruts au héros. Renvoie vrai si le coup a porté.
 * Pendant la ruée ou l'invulnérabilité, rien ne passe.
 */
export function hurtHero(run: Run, raw: number, kind = -1): boolean {
  const hero = run.hero;
  if (hero.invuln > 0 || hero.dashT > 0 || hero.hp <= 0) return false;
  const tuning = run.data.tuning;
  const dmg = damageTaken(raw, hero.stats.armor, tuning.hero.armorCap);
  hero.hp -= dmg;
  hero.damageTaken += dmg;
  if (kind >= 0) run.damageByKind[kind]! += dmg;
  hero.invuln = tuning.hero.invulnAfterHit;
  emit(run, EV.heroHurt, hero.x, hero.y, dmg);
  return true;
}

/** Charge la jauge d'ultime. */
function chargeUltimate(run: Run, amount: number): void {
  const max = run.data.tuning.ultimate.gaugeMax;
  run.hero.ultGauge = Math.min(max, run.hero.ultGauge + amount * run.mods.ultChargeMult);
}

/**
 * Retire les ennemis morts et pose leur butin. Appelé une fois par pas, après les dégâts :
 * les indices restent stables pendant tout le reste du pas.
 */
/** Première mort d'un boss qui se reforme : il retombe en poussière, puis se relèvera avec une part de sa vie. */
function reformBoss(run: Run, i: number, reform: { share: number; duration: number }, shed: boolean): void {
  const e = run.enemies;
  const d = run.director;
  if (e.dmgAcc[i]! > 0) emit(run, EV.damageNumber, e.x[i]!, e.y[i]!, e.dmgAcc[i]!, e.dmgFlags[i]!);
  e.dmgAcc[i] = 0;
  const hp = Math.max(1, Math.round(e.maxHp[i]! * reform.share));
  e.maxHp[i] = hp;
  e.hp[i] = hp;
  e.status[i] = 0;
  d.bossReformed = true;
  d.bossReformT = reform.duration;
  if (shed) d.bossShed = 0;
  run.enemyShots.count = 0;
  // Une annonce sans dégâts, le temps de la poussière : c'est là qu'il va se relever.
  const def = run.data.enemies[e.kind[i]!]!;
  const r = def.slam?.radius ?? def.radius;
  addTelegraph(run, TG_CIRCLE, e.x[i]!, e.y[i]!, 0, r, r, reform.duration, 0, e.uid[i]!, e.kind[i]!);
  emit(run, EV.bossReform, e.x[i]!, e.y[i]!);
}

export function reapEnemies(run: Run): boolean {
  const e = run.enemies;
  const tuning = run.data.tuning;
  const rng = run.rngCombat;
  let bossKilled = false;
  for (let i = e.count - 1; i >= 0; i--) {
    if (e.hp[i]! > 0) continue;
    const kind = e.kind[i]!;
    const def = run.data.enemies[kind]!;
    const x = e.x[i]!;
    const y = e.y[i]!;
    if (def.reform && !run.director.bossReformed && !run.tutorial) {
      reformBoss(run, i, def.reform, def.shed !== undefined);
      continue;
    }
    if (e.dmgAcc[i]! > 0) emit(run, EV.damageNumber, x, y, e.dmgAcc[i]!, e.dmgFlags[i]!);
    run.hero.kills++;
    run.killsByKind[kind]!++;
    if (def.xpChance === undefined || rng.chance(def.xpChance)) addPickup(run, PK_GEM, x, y, def.xp);
    if (def.rank === 'normal') {
      chargeUltimate(run, tuning.ultimate.perKill);
      if (rng.chance(tuning.gold.dropChance)) addPickup(run, PK_GOLD, x + 4, y + 2, rng.intRange(tuning.gold.min, tuning.gold.max));
      if (rng.chance(tuning.ashes.dropChance)) addPickup(run, PK_ASH, x - 4, y + 2, 1);
      if (rng.chance(tuning.drops.flameCallChance)) addPickup(run, PK_CALL, x, y - 4, 1);
      emit(run, EV.kill, x, y, kind);
    } else if (def.rank === 'elite') {
      chargeUltimate(run, tuning.ultimate.perElite);
      run.hero.elites++;
      addPickup(run, PK_CHEST, x, y + 6, 1);
      addPickup(run, PK_ASH, x - 8, y, tuning.ashes.elite);
      if (rng.chance(tuning.drops.emberDropFromElite)) addPickup(run, PK_DROP, x + 8, y, 1);
      run.director.breathT = tuning.director.breathSeconds;
      emit(run, EV.eliteDeath, x, y, kind);
      if (run.mods.eliteKillPower > 0) emit(run, EV.hunt, x, y, run.mods.eliteKillPower * run.hero.elites);
    } else {
      run.hero.bossKills++;
      bossKilled = true;
      // Le boss du tutoriel ne laisse rien : on n'en rapporte ni or ni Cendres.
      if (!run.tutorial) {
        addPickup(run, PK_CHEST, x, y + 10, 1);
        const loot = def.loot ?? 1;
        addPickup(run, PK_GOLD, x + 12, y, tuning.gold.boss * loot);
        addPickup(run, PK_ASH, x - 12, y, tuning.ashes.boss * loot);
      }
      emit(run, EV.bossDeath, x, y, kind);
    }
    const spawnKind = def.onDeathIndex;
    const spawnCount = def.onDeath?.count ?? 0;
    removeEnemy(e, i);
    if (spawnKind >= 0 && !bossKilled) {
      for (let k = 0; k < spawnCount; k++) {
        spawnEnemy(run, spawnKind, x + (k === 0 ? -8 : 8), y + 4, e.count > 0 ? run.hpScaleNow : 1);
      }
    }
  }
  return bossKilled;
}
