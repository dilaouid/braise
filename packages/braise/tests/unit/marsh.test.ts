import { Rng } from '@owl/kit/rng';
import { describe, expect, it } from 'vitest';
import { activeBot, hashRun, simulate } from '../../src/core/bots.ts';
import { hurtEnemy, reapEnemies, spawnEnemy } from '../../src/core/combat.ts';
import { contactDamage, insideTelegraph, updateEnemies, updateEnemyShots, updateTelegraphs } from '../../src/core/enemies.ts';
import { beaconAt, glowNow, isLit } from '../../src/core/light.ts';
import { generateMap, isDeepAt, isSolidAt } from '../../src/core/map.ts';
import { addMire, grantDodge, updateMarsh } from '../../src/core/marsh.ts';
import { createRun, idleInput, stepRun } from '../../src/core/run.ts';
import { addTelegraph, buildGrid } from '../../src/core/stores.ts';
import { TFX_MIRE, TG_ARC, TG_CIRCLE, TG_RING, type Run } from '../../src/core/types.ts';
import { bossBeaten, buildSheet, regionOpen, unlockedContent } from '../../src/meta/hero.ts';
import { CLASS, REGION, data, makeImmortal, makeRun, makeSave } from './helpers.ts';

const MARSH = 'region.drowned-marsh';
const DT = 1 / 60;
const region = data.regions[MARSH]!;
const kindOf = (id: string): number => data.enemies.findIndex((e) => e.id === id);

/** Une expédition au Marais, héros increvable, sans horde autour de lui. */
function makeMarsh(seed = 11): Run {
  const save = makeSave(12);
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  const run = createRun(data, {
    seed, regionId: MARSH, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false,
  });
  makeImmortal(run);
  return run;
}

/** Un point d'eau profonde (ou de terre ferme) libre de tout obstacle, loin de la clairière. */
function findSpot(run: Run, deep: boolean): { x: number; y: number } {
  const map = run.map;
  for (let ty = 12; ty < map.size - 12; ty++) {
    for (let tx = 12; tx < map.size - 12; tx++) {
      const x = tx * map.tile;
      const y = ty * map.tile;
      let ok = true;
      // Un carré de deux tuiles de côté entièrement du même terrain et sans obstacle : on peut y marcher droit.
      for (let oy = -40; oy <= 40 && ok; oy += 16) {
        for (let ox = -40; ox <= 40; ox += 16) {
          if (isDeepAt(map, x + ox, y + oy) !== deep || isSolidAt(map, x + ox, y + oy)) {
            ok = false;
            break;
          }
        }
      }
      if (ok && !run.map.beacons.some((b) => Math.hypot(b.x - x, b.y - y) < 140)) return { x, y };
    }
  }
  throw new Error('aucun point trouvé');
}

function place(run: Run, x: number, y: number): void {
  run.hero.x = x;
  run.hero.y = y;
  run.hero.px = x;
  run.hero.py = y;
}

/** Fait marcher le héros vers la droite pendant `steps` pas, sans horde ; renvoie la distance parcourue. */
function walk(run: Run, steps: number): number {
  const from = run.hero.x;
  const input = idleInput();
  input.moveX = 1;
  for (let k = 0; k < steps; k++) {
    run.enemies.count = 0;
    stepRun(run, input);
  }
  return run.hero.x - from;
}

describe('la carte du Marais', () => {
  it('a de l\'eau profonde, une clairière et des lieux au sec, et ses lanternes noyées dans l\'eau', () => {
    const map = generateMap(new Rng(5), data.tuning, region);
    const cs = map.size + 1;
    let deep = 0;
    for (let i = 0; i < map.corners.length; i++) deep += map.corners[i]!;
    const share = deep / map.corners.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.6);
    expect(map.waterSlow).toBe(region.water!.slow);
    const center = (map.size * map.tile) / 2;
    expect(isDeepAt(map, center, center)).toBe(false);
    for (const poi of map.pois) expect(isDeepAt(map, poi.x, poi.y), poi.kind).toBe(false);
    expect(map.beacons).toHaveLength(region.beacons!.count);
    for (const b of map.beacons) {
      expect(isDeepAt(map, b.x, b.y)).toBe(true);
      expect(isSolidAt(map, b.x, b.y)).toBe(false);
      expect(Math.hypot(b.x - center, b.y - center)).toBeGreaterThan(data.tuning.startClearingTiles * map.tile - 1);
    }
    // Le bord de la carte reste au sec : la bordure d'arbres ne pousse pas dans l'eau.
    expect(map.corners[2 * cs + 2]).toBe(0);
  });

  it('est la même pour une même graine, et le Bois n\'a ni eau ni lanternes', () => {
    const a = generateMap(new Rng(9), data.tuning, region);
    const b = generateMap(new Rng(9), data.tuning, region);
    expect(Array.from(a.corners)).toEqual(Array.from(b.corners));
    expect(a.beacons).toEqual(b.beacons);
    const bois = generateMap(new Rng(9), data.tuning, data.regions[REGION]!);
    expect(bois.waterSlow).toBe(0);
    expect(bois.beacons).toEqual([]);
    expect(isDeepAt(bois, (bois.size * bois.tile) / 2, (bois.size * bois.tile) / 2)).toBe(false);
  });
});

describe('l\'eau profonde et la vase', () => {
  it('l\'eau profonde ralentit la marche de la part de la région', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x - 30, dry.y);
    const onGround = walk(run, 30);
    expect(run.hero.wading).toBe(false);
    const wet = findSpot(run, true);
    place(run, wet.x - 30, wet.y);
    stepRun(run, idleInput());
    expect(run.hero.wading).toBe(true);
    const inWater = walk(run, 30);
    expect(inWater / onGround).toBeCloseTo(1 - region.water!.slow, 1);
  });

  it('la ruée passe par-dessus l\'eau sans être freinée', () => {
    const run = makeMarsh();
    const wet = findSpot(run, true);
    place(run, wet.x - 36, wet.y);
    const input = idleInput();
    input.moveX = 1;
    stepRun(run, input);
    const from = run.hero.x;
    input.dash = true;
    stepRun(run, input);
    input.dash = false;
    while (run.hero.dashT > 0) {
      run.enemies.count = 0;
      stepRun(run, input);
    }
    expect(run.hero.x - from).toBeGreaterThan(data.tuning.dash.distance * 0.9);
  });

  it('une flaque de vase colle aux bottes, puis sèche', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x - 30, dry.y);
    const free = walk(run, 20);
    place(run, dry.x - 30, dry.y);
    addMire(run, run.hero.x + 10, run.hero.y, 60, 2);
    stepRun(run, idleInput());
    expect(run.hero.mireT).toBeGreaterThan(0);
    const stuck = walk(run, 20);
    expect(stuck / free).toBeCloseTo(1 - data.tuning.heroStatuses.mireSlow, 1);
    for (let k = 0; k < 150; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.mires).toHaveLength(0);
    expect(run.hero.mireT).toBeLessThanOrEqual(0);
  });

  it('la morsure des sangsues coupe la régénération', () => {
    const run = makeMarsh();
    run.cfg.sheet.maxHp = 200;
    run.cfg.sheet.regen = 5;
    run.hero.stats.maxHp = 200;
    run.hero.stats.regen = 5;
    run.hero.hp = 100;
    run.enemies.count = 0;
    spawnEnemy(run, kindOf('enemy.leeches'), run.hero.x, run.hero.y, 1);
    buildGrid(run);
    contactDamage(run);
    expect(run.hero.drainT).toBeCloseTo(data.enemies[kindOf('enemy.leeches')]!.drain!, 5);
    run.enemies.count = 0;
    const hp = run.hero.hp;
    for (let k = 0; k < 60; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.hero.hp).toBe(hp);
    for (let k = 0; k < 180; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.hero.hp).toBeGreaterThan(hp);
  });

  it('la boule de vase du Pêcheur ralentit, pas celle du Cracheur', () => {
    const run = makeMarsh();
    run.hero.stats.maxHp = 500;
    run.hero.hp = 500;
    const fisher = kindOf('enemy.mud-fisher');
    const s = run.enemyShots;
    s.count = 1;
    s.x[0] = run.hero.x; s.y[0] = run.hero.y - 6; s.vx[0] = 0; s.vy[0] = 0; s.life[0] = 1; s.damage[0] = 5; s.radius[0] = 5; s.kind[0] = fisher;
    updateEnemyShots(run, DT);
    expect(run.hero.mireT).toBeCloseTo(data.enemies[fisher]!.shot!.slow!, 5);
    run.hero.mireT = 0;
    run.hero.invuln = 0;
    s.count = 1;
    s.x[0] = run.hero.x; s.y[0] = run.hero.y - 6; s.life[0] = 1; s.kind[0] = kindOf('enemy.soot-spitter');
    updateEnemyShots(run, DT);
    expect(run.hero.mireT).toBe(0);
  });
});

describe('la brume et les lanternes noyées', () => {
  it('la brume étouffe la Lueur ; une lanterne ravivée la rend, et éclaire', () => {
    const run = makeMarsh();
    const wet = findSpot(run, true);
    place(run, wet.x, wet.y);
    for (let k = 0; k < 90; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.dim).toBeCloseTo(region.fog!.glowMult, 2);
    expect(glowNow(run)).toBeCloseTo(run.hero.stats.glow * region.fog!.glowMult, 1);
    const b = run.map.beacons[0]!;
    expect(b.life).toBe(0);
    place(run, b.x + 8, b.y);
    for (let k = 0; k < 90; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(b.life).toBeGreaterThan(region.beacons!.seconds - 2);
    expect(beaconAt(run, run.hero.x, run.hero.y)).toBe(b);
    expect(run.dim).toBeCloseTo(1, 2);
    // Un point loin de Moon, mais dans la lumière de la lanterne, est éclairé.
    expect(isLit(run, b.x - region.beacons!.radius + 4, b.y)).toBe(true);
  });

  it('une lanterne ravivée s\'éteint après son temps', () => {
    const run = makeMarsh();
    const b = run.map.beacons[0]!;
    b.life = 0.5;
    const far = findSpot(run, false);
    place(run, far.x, far.y);
    for (let k = 0; k < 40; k++) updateMarsh(run, DT);
    expect(b.life).toBe(0);
  });

  it('une Lanterne-mère vivante et proche divise encore la Lueur ; morte, elle la rend', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    const kind = kindOf('elite.mother-lantern');
    const mult = data.enemies[kind]!.blind!.glowMult;
    run.enemies.count = 0;
    const i = spawnEnemy(run, kind, run.hero.x + 300, run.hero.y, 1);
    run.enemies.timer2[i] = 99;
    for (let k = 0; k < 120; k++) {
      run.enemies.x[i] = run.hero.x + 300;
      run.enemies.timer2[i] = 99;
      stepRun(run, idleInput());
    }
    expect(run.dim).toBeCloseTo(region.fog!.glowMult * mult, 2);
    run.enemies.count = 0;
    for (let k = 0; k < 120; k++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.dim).toBeCloseTo(region.fog!.glowMult, 2);
  });
});

describe('l\'esquive juste', () => {
  it('une ruée qui traverse un coup au moment où il frappe donne de l\'élan, une fois par ruée', () => {
    const run = makeRun(4);
    run.hero.stats.maxHp = 300;
    run.hero.hp = 300;
    const dodge = data.tuning.dodge;
    run.hero.dashT = 0.1;
    run.hero.dashCd = 2;
    run.hero.dodged = false;
    addTelegraph(run, TG_CIRCLE, run.hero.x, run.hero.y, 0, 40, 40, DT / 2, 50, 0);
    addTelegraph(run, TG_CIRCLE, run.hero.x, run.hero.y, 0, 40, 40, DT / 2, 50, 0);
    updateTelegraphs(run, DT);
    expect(run.hero.hp).toBe(300);
    expect(run.hero.dodgeT).toBe(dodge.duration);
    expect(run.hero.ultGauge).toBe(dodge.ult);
    expect(run.hero.dashCd).toBeCloseTo(2 * (1 - dodge.dashRefund), 5);
  });

  it('sans ruée, le coup porte et ne donne rien', () => {
    const run = makeRun(4);
    run.hero.stats.maxHp = 300;
    run.hero.hp = 300;
    addTelegraph(run, TG_CIRCLE, run.hero.x, run.hero.y, 0, 40, 40, DT / 2, 50, 0);
    updateTelegraphs(run, DT);
    expect(run.hero.hp).toBeLessThan(300);
    expect(run.hero.dodgeT).toBe(0);
    grantDodge(run);
    expect(run.hero.dodgeT).toBe(0);
  });

  it('l\'élan ajoute de la Puissance tant qu\'il dure', () => {
    const run = makeRun(4);
    run.cls = { ...run.cls, trait: { kind: 'lit', inside: 0, outside: 0 } };
    run.hero.stats.critChance = 0;
    run.enemies.count = 0;
    const a = spawnEnemy(run, kindOf('enemy.dead-stump'), run.hero.x + 30, run.hero.y, 100);
    const plain = hurtEnemy(run, a, 100, 0, null, -1);
    run.hero.dodgeT = 1;
    const boosted = hurtEnemy(run, a, 100, 0, null, -1);
    expect(boosted / plain).toBeCloseTo((1 + run.hero.stats.power + data.tuning.dodge.power) / (1 + run.hero.stats.power), 1);
  });

  it('un projectile traversé en ruée compte aussi', () => {
    const run = makeRun(4);
    run.hero.dashT = 0.1;
    const s = run.enemyShots;
    s.count = 1;
    s.x[0] = run.hero.x; s.y[0] = run.hero.y - 6; s.vx[0] = 0; s.vy[0] = 0; s.life[0] = 1; s.damage[0] = 5; s.radius[0] = 5; s.kind[0] = kindOf('enemy.soot-spitter');
    updateEnemyShots(run, DT);
    expect(run.hero.dodgeT).toBe(data.tuning.dodge.duration);
    expect(s.count).toBe(1);
  });
});

describe('les annonces du Marais', () => {
  it('un secteur couvre son ouverture et son rayon, pas plus', () => {
    const run = makeRun(2);
    addTelegraph(run, TG_ARC, 100, 100, 0, 80, Math.PI / 4, 1, 10, 0);
    const t = run.telegraphs.count - 1;
    expect(insideTelegraph(run, t, 150, 100, 0)).toBe(true);
    expect(insideTelegraph(run, t, 140, 130, 0)).toBe(true);
    expect(insideTelegraph(run, t, 100, 160, 0)).toBe(false);
    expect(insideTelegraph(run, t, 50, 100, 0)).toBe(false);
    expect(insideTelegraph(run, t, 190, 100, 0)).toBe(false);
    // L'axe à l'opposé : le secteur se referme derrière, sans erreur d'angle au passage de ±π.
    addTelegraph(run, TG_ARC, 100, 100, Math.PI, 80, Math.PI / 4, 1, 10, 0);
    expect(insideTelegraph(run, t + 1, 50, 96, 0)).toBe(true);
    expect(insideTelegraph(run, t + 1, 50, 104, 0)).toBe(true);
    expect(insideTelegraph(run, t + 1, 150, 100, 0)).toBe(false);
  });

  it('une annonce de vase retient le héros qu\'elle touche', () => {
    const run = makeRun(2);
    run.hero.stats.maxHp = 300;
    run.hero.hp = 300;
    addTelegraph(run, TG_CIRCLE, run.hero.x, run.hero.y, 0, 30, 30, DT / 2, 10, 0, 0, 0, TFX_MIRE, 1.5);
    updateTelegraphs(run, DT);
    expect(run.hero.mireT).toBe(1.5);
  });
});

describe('les Éteints du Marais', () => {
  it('la région ouvre ses huit Éteints, ses trois élites et sa Dame, et ses vagues sont des Noyés', () => {
    expect(region.enemyIdx).toHaveLength(8);
    expect(region.eliteIdx).toHaveLength(3);
    expect(data.enemies[region.bossIdx]!.id).toBe('boss.mud-lady');
    expect(region.waveEnemyIdx).toBe(kindOf('enemy.drowned'));
    expect(region.requires).toBe(REGION);
    for (const slice of region.horde) {
      for (let k = 0; k < slice.weights.length; k++) if (slice.weights[k]! > 0) expect(region.enemyIdx).toContain(k);
    }
  });

  it('la Lueur trompeuse s\'arrête contre Moon, éclate, frappe et laisse sa vase', () => {
    const run = makeMarsh();
    makeImmortal(run);
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.enemies.count = 0;
    const kind = kindOf('enemy.false-glow');
    const def = data.enemies[kind]!;
    spawnEnemy(run, kind, run.hero.x + 12, run.hero.y, 1);
    run.weapons.length = 0;
    const before = run.hero.hp;
    let steps = 0;
    while (run.enemies.count > 0 && steps++ < 200) stepRun(run, idleInput());
    expect(steps).toBeLessThan(200);
    expect(run.hero.hp).toBeLessThan(before);
    expect(run.mires).toHaveLength(1);
    expect(run.mires[0]!.radius).toBe(def.wisp!.mire.radius);
  });

  it('abattue avant d\'éclater, elle ne laisse rien et son annonce disparaît', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.enemies.count = 0;
    const i = spawnEnemy(run, kindOf('enemy.false-glow'), run.hero.x + 12, run.hero.y, 1);
    run.weapons.length = 0;
    stepRun(run, idleInput());
    expect(run.enemies.state[i]).toBe(1);
    expect(run.telegraphs.count).toBe(1);
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    expect(run.telegraphs.count).toBe(0);
    expect(run.mires).toHaveLength(0);
  });

  it('le Crapaud-outre bondit là où se tenait Moon, et retombe en frappant', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.weapons.length = 0;
    run.enemies.count = 0;
    const kind = kindOf('enemy.bloat-toad');
    const def = data.enemies[kind]!;
    const i = spawnEnemy(run, kind, run.hero.x + 34, run.hero.y, 1);
    // Trop près : il ne bondit pas, il rampe.
    stepRun(run, idleInput());
    expect(run.enemies.state[i]).toBe(0);
    run.enemies.x[i] = run.hero.x + 120;
    run.enemies.timer2[i] = 0;
    const tx = run.hero.x;
    const ty = run.hero.y;
    stepRun(run, idleInput());
    expect(run.enemies.state[i]).toBe(1);
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.damage[0]).toBe(0);
    // En l'air, il ne touche personne.
    buildGrid(run);
    const hp = run.hero.hp;
    for (let k = 0; k < Math.ceil(def.leap!.telegraph / DT) + 2; k++) stepRun(run, idleInput());
    expect(run.enemies.state[i]).toBe(0);
    expect(Math.hypot(run.enemies.x[i]! - tx, run.enemies.y[i]! - ty)).toBeLessThan(12);
    expect(run.hero.hp).toBeLessThan(hp);
  });

  it('à sa mort il éclate : un cercle annoncé qui laisse de la vase, et des Têtards', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.weapons.length = 0;
    run.enemies.count = 0;
    const kind = kindOf('enemy.bloat-toad');
    const def = data.enemies[kind]!;
    const i = spawnEnemy(run, kind, run.hero.x + 150, run.hero.y, 1);
    const x = run.enemies.x[i]!;
    const y = run.enemies.y[i]!;
    run.enemies.hp[i] = 0;
    reapEnemies(run);
    expect(run.enemies.count).toBe(def.onDeath!.count);
    for (let k = 0; k < run.enemies.count; k++) expect(run.enemies.kind[k]).toBe(kindOf('enemy.tadpole'));
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.width[0]).toBe(def.deathBurst!.radius);
    expect(run.telegraphs.owner[0]).toBe(0);
    for (let k = 0; k < Math.ceil(def.deathBurst!.telegraph / DT) + 1; k++) updateTelegraphs(run, DT);
    expect(run.mires).toHaveLength(1);
    expect(Math.hypot(run.mires[0]!.x - x, run.mires[0]!.y - y)).toBeLessThan(1);
  });

  it('la Main noyée ressort devant Moon qui marche, et le retient si elle le touche', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.weapons.length = 0;
    run.enemies.count = 0;
    const kind = kindOf('enemy.drowned-hand');
    const def = data.enemies[kind]!;
    const i = spawnEnemy(run, kind, run.hero.x + 300, run.hero.y, 1);
    const input = idleInput();
    input.moveX = 1;
    stepRun(run, input);
    expect(run.enemies.state[i]).toBe(1);
    // Elle est sortie devant lui : il n'a qu'à s'arrêter pour être pris.
    expect(run.enemies.x[i]! - run.hero.x).toBeGreaterThan(def.grab!.lead - 6);
    place(run, run.enemies.x[i]!, run.enemies.y[i]!);
    run.hero.invuln = 0;
    for (let k = 0; k < Math.ceil(def.grab!.telegraph / DT) + 1; k++) {
      run.hero.invuln = 0;
      updateEnemies(run, DT);
    }
    expect(run.enemies.state[i]).toBe(0);
    expect(run.hero.mireT).toBeCloseTo(def.grab!.slow, 1);
  });

  it('le Passeur reparaît dans le dos de Moon, puis frappe de sa perche', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.weapons.length = 0;
    run.enemies.count = 0;
    const kind = kindOf('elite.ferryman');
    const def = data.enemies[kind]!;
    const i = spawnEnemy(run, kind, run.hero.x + 260, run.hero.y, 1);
    run.hero.faceX = 1;
    run.hero.faceY = 0;
    run.enemies.timer2[i] = 0;
    updateEnemies(run, DT);
    expect(run.enemies.state[i]).toBe(1);
    expect(run.enemies.x[i]).toBeCloseTo(run.hero.x - def.ferry!.behind, 3);
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.shape[0]).toBe(TG_CIRCLE);
    for (let k = 0; k < Math.ceil(def.slam!.telegraph / DT) + 1; k++) updateEnemies(run, DT);
    expect(run.enemies.state[i]).toBe(0);
    run.telegraphs.count = 0;
    run.enemies.timer2[i] = 0;
    updateEnemies(run, DT);
    expect(run.enemies.state[i]).toBe(2);
    expect(run.telegraphs.length[0]).toBe(def.charge!.distance);
    expect(run.telegraphs.damage[0]).toBeGreaterThan(0);
  });

  it('le Glas sonne : des anneaux partent de lui et des Noyés sortent autour de Moon', () => {
    const run = makeMarsh();
    const dry = findSpot(run, false);
    place(run, dry.x, dry.y);
    run.weapons.length = 0;
    run.enemies.count = 0;
    const kind = kindOf('elite.knell');
    const def = data.enemies[kind]!;
    const i = spawnEnemy(run, kind, run.hero.x + 200, run.hero.y, 1);
    run.enemies.timer2[i] = 0;
    updateEnemies(run, DT);
    expect(run.enemies.state[i]).toBe(1);
    expect(run.telegraphs.count).toBe(def.stomp!.rings);
    expect(run.telegraphs.shape[1]).toBe(TG_RING);
    let drowned = 0;
    for (let k = 0; k < run.enemies.count; k++) if (run.enemies.kind[k] === kindOf('enemy.drowned')) drowned++;
    expect(drowned).toBeGreaterThan(0);
    expect(drowned).toBeLessThanOrEqual(def.summon!.count);
  });
});

describe('la porte du Marais', () => {
  it('reste fermée tant que le gardien du Bois n\'est pas battu', () => {
    const save = makeSave();
    expect(regionOpen(data, save, REGION)).toBe(true);
    expect(regionOpen(data, save, MARSH)).toBe(false);
    save.account.regions[REGION] = { lit: true, bestVigil: 1, bossKills: 1 };
    expect(bossBeaten(save, REGION)).toBe(true);
    expect(regionOpen(data, save, MARSH)).toBe(true);
    expect(regionOpen(data, save, 'region.inconnue')).toBe(false);
  });
});

describe('une expédition entière au Marais', () => {
  it('se joue cinq minutes au robot sans erreur, et deux fois de la même façon', () => {
    const play = (): Run => {
      const run = makeMarsh(77);
      return simulate(run, { bot: activeBot, maxSteps: 300 * 60 });
    };
    const a = play();
    const b = play();
    expect(a.time).toBeGreaterThan(60);
    expect(hashRun(a)).toBe(hashRun(b));
    expect(a.hero.kills).toBeGreaterThan(50);
  });
});
