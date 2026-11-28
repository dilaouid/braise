import { describe, expect, it } from 'vitest';
import {
  LADY_ABOVE, LADY_RISE, LS_DIVE, LS_EMERGE, LS_IDLE, LS_SURGE, L_DIVE, L_EMBRACE, L_HANDS, L_LANTERNS, L_SCREAM, L_SWEEP, L_TIDE,
} from '../../src/core/boss-lady.ts';
import { bossBarFrac, hurtEnemy, spawnEnemy } from '../../src/core/combat.ts';
import { contactDamage, insideTelegraph, updateEnemies, updateTelegraphs } from '../../src/core/enemies.ts';
import { floodRadius, isFlooded, updateMarsh } from '../../src/core/marsh.ts';
import { createRun, idleInput, stepRun } from '../../src/core/run.ts';
import { buildGrid } from '../../src/core/stores.ts';
import { TFX_MIRE, TFX_PUDDLE, TFX_PULL, TG_ARC, TG_CIRCLE, TG_LINE, TG_RING, type Run } from '../../src/core/types.ts';
import { buildSheet, pendingMemory, unlockedContent } from '../../src/meta/hero.ts';
import { CLASS, data, makeImmortal, makeSave } from './helpers.ts';

const MARSH = 'region.drowned-marsh';
const DT = 1 / 60;
const LADY = data.enemies.findIndex((e) => e.id === 'boss.mud-lady');
const def = data.enemies[LADY]!;

function makeMarsh(seed = 21): Run {
  const save = makeSave(12);
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  return createRun(data, {
    seed, regionId: MARSH, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false,
  });
}

/** La Dame seule dans son arène, à 200 px du héros, déjà sortie de l'eau, prête à frapper. */
function makeLady(seed = 21): { run: Run; i: number } {
  const run = makeMarsh(seed);
  makeImmortal(run);
  run.weapons.length = 0;
  run.enemies.count = 0;
  run.telegraphs.count = 0;
  const d = run.director;
  const i = spawnEnemy(run, LADY, run.hero.x + 200, run.hero.y, 1);
  d.bossSpawned = true;
  d.arenaX = run.hero.x;
  d.arenaY = run.hero.y;
  d.arenaR = data.tuning.boss.arenaRadiusTiles * data.tuning.tileSize;
  d.bossUid = run.enemies.uid[i]!;
  d.bossPhase = 1;
  d.bossLast = -1;
  d.bossNext = -1;
  d.bossSummonT = 999;
  run.enemies.state[i] = LS_IDLE;
  run.enemies.timer2[i] = 0;
  return { run, i };
}

/** Fait partir l'attaque suivante tout de suite. */
function attackNow(run: Run, i: number, attack = -1): void {
  run.enemies.state[i] = LS_IDLE;
  run.enemies.timer2[i] = 0;
  run.telegraphs.count = 0;
  run.mires.length = 0;
  run.director.bossHidden = false;
  if (attack >= 0) run.director.bossNext = attack;
  updateEnemies(run, DT);
}

function setPhase(run: Run, i: number, phase: number): void {
  run.director.bossPhase = phase;
  run.enemies.hp[i] = run.enemies.maxHp[i]! * (phase === 1 ? 1 : phase === 2 ? 0.5 : 0.2);
}

describe('la Dame de Vase', () => {
  it('en phase 1, elle n\'a que les mains, le balayage et les lanternes, et ne répète jamais son coup', () => {
    const { run, i } = makeLady();
    const seen = new Set<number>();
    let last = -1;
    for (let k = 0; k < 120; k++) {
      attackNow(run, i);
      const attack = run.director.bossLast;
      expect(attack).not.toBe(last);
      seen.add(attack);
      last = attack;
    }
    expect([...seen].sort()).toEqual([L_HANDS, L_SWEEP, L_LANTERNS]);
  });

  it('en phase 2, elle apprend à plonger et à étreindre', () => {
    const { run, i } = makeLady();
    setPhase(run, i, 2);
    const seen = new Set<number>();
    for (let k = 0; k < 160; k++) {
      attackNow(run, i);
      seen.add(run.director.bossLast);
    }
    expect([...seen].sort()).toEqual([L_HANDS, L_SWEEP, L_LANTERNS, L_DIVE, L_EMBRACE]);
  });

  it('changer de phase impose le cri : un grand cercle autour d\'elle, puis le cortège des Noyés', () => {
    const { run, i } = makeLady();
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.6;
    run.enemies.timer2[i] = 1;
    updateEnemies(run, DT);
    expect(run.director.bossPhase).toBe(2);
    expect(run.director.bossNext).toBe(L_SCREAM);
    for (let k = 0; k < 30 && run.director.bossLast !== L_SCREAM; k++) updateEnemies(run, DT);
    expect(run.director.bossLast).toBe(L_SCREAM);
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.width[0]).toBeCloseTo(def.slam!.radius * 1.5, 3);
    const before = run.enemies.count;
    for (let k = 0; k < 80; k++) updateEnemies(run, DT);
    expect(run.enemies.count).toBeGreaterThan(before);
    const drowned = data.enemies.findIndex((e) => e.id === 'enemy.drowned');
    expect(run.enemies.kind[run.enemies.count - 1]).toBe(drowned);
  });

  it('les mains de vase : un cercle sous Moon toutes les demi-secondes, qui le retient s\'il le touche', () => {
    const { run, i } = makeLady();
    attackNow(run, i, L_HANDS);
    const hands = def.hands!;
    let placed = 0;
    for (let k = 0; k < Math.ceil((hands.count * hands.interval + 0.3) / DT); k++) {
      const before = run.telegraphs.count;
      updateEnemies(run, DT);
      if (run.telegraphs.count > before) {
        placed++;
        const t = run.telegraphs.count - 1;
        expect(run.telegraphs.shape[t]).toBe(TG_CIRCLE);
        expect(run.telegraphs.fx[t]).toBe(TFX_MIRE);
        expect(Math.hypot(run.telegraphs.x[t]! - run.hero.x, run.telegraphs.y[t]! - run.hero.y)).toBeLessThan(1);
        expect(run.telegraphs.duration[t]).toBeGreaterThanOrEqual(data.tuning.boss.minTelegraph);
      }
    }
    expect(placed).toBe(hands.count);
    run.hero.stats.maxHp = 400;
    run.hero.hp = 400;
    for (let k = 0; k < Math.ceil(hands.telegraph / DT) + 2; k++) updateTelegraphs(run, DT);
    expect(run.hero.hp).toBeLessThan(400);
    expect(run.hero.mireT).toBeCloseTo(hands.slow, 1);
  });

  it('le balayage : un secteur vers Moon ; dès la phase 2, un second derrière elle, plus tard', () => {
    const { run, i } = makeLady();
    attackNow(run, i, L_SWEEP);
    expect(run.telegraphs.count).toBe(1);
    expect(run.telegraphs.shape[0]).toBe(TG_ARC);
    expect(insideTelegraph(run, 0, run.hero.x + 100, run.hero.y, 0)).toBe(true);
    expect(insideTelegraph(run, 0, run.enemies.x[i]! + 100, run.hero.y, 0)).toBe(false);
    setPhase(run, i, 2);
    attackNow(run, i, L_SWEEP);
    expect(run.telegraphs.count).toBe(2);
    expect(run.telegraphs.t[1]).toBeCloseTo(-def.sweep!.gap, 5);
    expect(insideTelegraph(run, 1, run.enemies.x[i]! + 100, run.hero.y, 0)).toBe(true);
    setPhase(run, i, 3);
    run.director.tideCd = 999;
    attackNow(run, i, L_SWEEP);
    expect(run.telegraphs.count).toBe(3);
  });

  it('les lanternes noyées : une sur Moon, les autres autour, dans l\'arène, et chacune laisse sa vase', () => {
    const { run, i } = makeLady();
    attackNow(run, i, L_LANTERNS);
    const ln = def.lanterns!;
    const d = run.director;
    expect(run.telegraphs.count).toBe(ln.count);
    expect(Math.hypot(run.telegraphs.x[0]! - run.hero.x, run.telegraphs.y[0]! - run.hero.y)).toBeLessThan(1);
    for (let t = 0; t < run.telegraphs.count; t++) {
      expect(run.telegraphs.fx[t]).toBe(TFX_PUDDLE);
      expect(Math.hypot(run.telegraphs.x[t]! - d.arenaX, run.telegraphs.y[t]! - d.arenaY)).toBeLessThanOrEqual(d.arenaR - ln.radius + 0.01);
    }
    for (let k = 0; k < Math.ceil((ln.telegraph + ln.count * ln.stagger) / DT) + 2; k++) updateTelegraphs(run, DT);
    expect(run.mires).toHaveLength(ln.count);
    expect(run.mires[0]!.radius).toBe(ln.mire.radius);
  });

  it('dès la phase 1, une main sur deux et la deuxième lanterne attendent Moon là où il va', () => {
    const { run, i } = makeLady();
    const hero = run.hero;
    hero.moving = true;
    hero.faceX = 1;
    hero.faceY = 0;
    attackNow(run, i, L_HANDS);
    const hands = def.hands!;
    const ahead: number[] = [];
    for (let k = 0; k < Math.ceil((hands.count * hands.interval + 0.3) / DT); k++) {
      const before = run.telegraphs.count;
      updateEnemies(run, DT);
      if (run.telegraphs.count > before) ahead.push(Math.round(run.telegraphs.x[run.telegraphs.count - 1]! - hero.x));
    }
    expect(ahead.filter((x) => x > 40)).toHaveLength(Math.floor(hands.count / 2));
    attackNow(run, i, L_LANTERNS);
    expect(run.telegraphs.x[1]! - hero.x).toBeCloseTo(def.lanterns!.lead, 0);
    expect(run.telegraphs.y[1]! - hero.y).toBeCloseTo(0, 3);
  });

  it('distancée, elle glisse sur l\'eau plus vite que Moon ne court ; près de lui, elle dérive', () => {
    const glide = def.glide!;
    expect(glide.speed).toBeGreaterThan(data.tuning.hero.speed);
    const pace = (gap: number): number => {
      const { run, i } = makeLady();
      run.enemies.x[i] = run.hero.x;
      run.enemies.y[i] = run.hero.y - LADY_ABOVE - gap;
      run.enemies.timer2[i] = 99;
      const y0 = run.enemies.y[i]!;
      updateEnemies(run, DT);
      return (run.enemies.y[i]! - y0) / DT;
    };
    expect(pace(glide.range + 60)).toBeCloseTo(glide.speed, 0);
    expect(pace(glide.range - 40)).toBeCloseTo(def.speed, 0);
  });

  it('la plongée : sous l\'eau rien ne la touche et elle ne touche rien ; elle suit Moon, puis resurgit en frappant', () => {
    const { run, i } = makeLady();
    setPhase(run, i, 2);
    attackNow(run, i, L_DIVE);
    const e = run.enemies;
    expect(e.state[i]).toBe(LS_DIVE);
    expect(run.director.bossHidden).toBe(true);
    const hp = e.hp[i]!;
    expect(hurtEnemy(run, i, 500, 0, null, -1)).toBe(0);
    expect(e.hp[i]).toBe(hp);
    // Elle passe sous lui sans le blesser.
    e.x[i] = run.hero.x;
    e.y[i] = run.hero.y;
    run.hero.stats.maxHp = 400;
    run.hero.hp = 400;
    buildGrid(run);
    contactDamage(run);
    expect(run.hero.hp).toBe(400);
    // Elle le rattrape s'il s'éloigne.
    e.x[i] = run.hero.x + 220;
    const dv = def.dive!;
    for (let k = 0; k < Math.ceil(dv.seconds / DT) + 1 && e.state[i] === LS_DIVE; k++) updateEnemies(run, DT);
    expect(e.state[i]).toBe(LS_SURGE);
    expect(Math.hypot(e.x[i]! - run.hero.x, e.y[i]! - run.hero.y)).toBeLessThan(10);
    expect(run.telegraphs.count).toBe(1 + dv.rings);
    expect(run.telegraphs.shape[0]).toBe(TG_CIRCLE);
    expect(run.telegraphs.shape[1]).toBe(TG_RING);
    expect(run.director.bossHidden).toBe(true);
    for (let k = 0; k < Math.ceil(dv.telegraph / DT) + 2; k++) updateEnemies(run, DT);
    expect(run.director.bossHidden).toBe(false);
    expect(hurtEnemy(run, i, 500, 0, null, -1)).toBeGreaterThan(0);
  });

  it('l\'étreinte : une ligne vers Moon, qui le tire contre elle et l\'englue, suivie d\'un cercle autour d\'elle', () => {
    const { run, i } = makeLady();
    setPhase(run, i, 2);
    attackNow(run, i, L_EMBRACE);
    const em = def.embrace!;
    expect(run.telegraphs.count).toBe(2);
    expect(run.telegraphs.shape[0]).toBe(TG_LINE);
    expect(run.telegraphs.fx[0]).toBe(TFX_PULL);
    expect(run.telegraphs.shape[1]).toBe(TG_CIRCLE);
    expect(run.telegraphs.t[1]).toBeLessThan(0);
    run.hero.stats.maxHp = 400;
    run.hero.hp = 400;
    const gap = Math.hypot(run.enemies.x[i]! - run.hero.x, run.enemies.y[i]! - run.hero.y);
    for (let k = 0; k < Math.ceil(em.telegraph / DT) + 1; k++) updateTelegraphs(run, DT);
    expect(run.hero.hp).toBeLessThan(400);
    expect(run.hero.pullX).toBeGreaterThan(0);
    expect(run.hero.mireT).toBeCloseTo(em.slow, 1);
    run.enemies.state[i] = 1;
    run.enemies.timer[i] = 99;
    for (let k = 0; k < 40; k++) stepRun(run, idleInput());
    expect(Math.hypot(run.enemies.x[i]! - run.hero.x, run.enemies.y[i]! - run.hero.y)).toBeLessThan(gap - 60);
  });

  it('la ruée arrache à l\'étreinte', () => {
    const { run } = makeLady();
    run.hero.pullX = 400;
    const input = idleInput();
    input.dash = true;
    stepRun(run, input);
    expect(run.hero.pullX).toBe(0);
  });

  it('en phase 3 la marée suit le cri : des îlots dans l\'arène, dont un près de Moon', () => {
    const { run, i } = makeLady();
    const d = run.director;
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.3;
    d.bossPhase = 2;
    for (let k = 0; k < 600 && !d.tide; k++) updateEnemies(run, DT);
    expect(d.bossPhase).toBe(3);
    expect(d.tide).not.toBeNull();
    const cfg = def.tide!;
    const tide = d.tide!;
    expect(tide.islets).toHaveLength(cfg.islets);
    expect(Math.hypot(tide.islets[0]!.x - run.hero.x, tide.islets[0]!.y - run.hero.y)).toBeLessThanOrEqual(101);
    for (const islet of tide.islets) {
      expect(Math.hypot(islet.x - d.arenaX, islet.y - d.arenaY) + islet.r).toBeLessThanOrEqual(d.arenaR);
    }
    expect(run.director.bossLast).toBe(L_TIDE);
  });

  it('l\'eau gagne depuis le bord, épargne les îlots, blesse hors d\'eux, puis se retire', () => {
    const { run } = makeLady();
    const d = run.director;
    const cfg = def.tide!;
    d.tide = { t: 0, islets: [{ x: d.arenaX + 150, y: d.arenaY, r: cfg.isletRadius }], tick: cfg.tick };
    expect(floodRadius(run, def)).toBe(d.arenaR);
    expect(isFlooded(run, d.arenaX, d.arenaY)).toBe(false);
    d.tide.t = cfg.rise / 2;
    expect(floodRadius(run, def)).toBeCloseTo(d.arenaR / 2, 3);
    expect(isFlooded(run, d.arenaX + d.arenaR - 20, d.arenaY)).toBe(true);
    expect(isFlooded(run, d.arenaX + 40, d.arenaY)).toBe(false);
    d.tide.t = cfg.rise + 0.1;
    expect(isFlooded(run, d.arenaX, d.arenaY)).toBe(true);
    expect(isFlooded(run, d.arenaX + 150, d.arenaY + 10)).toBe(false);
    // Dans l'eau : des dégâts par tics, et la marche freinée. Sur l'îlot : rien.
    run.hero.stats.maxHp = 400;
    run.hero.hp = 400;
    for (let k = 0; k < 120; k++) {
      run.hero.invuln = 0;
      updateMarsh(run, DT);
    }
    expect(run.hero.hp).toBeLessThan(400);
    run.hero.x = d.arenaX + 150;
    run.hero.y = d.arenaY;
    const hp = run.hero.hp;
    for (let k = 0; k < 60; k++) updateMarsh(run, DT);
    expect(run.hero.hp).toBe(hp);
    for (let k = 0; k < Math.ceil((cfg.hold + cfg.ebb) / DT) + 2; k++) updateMarsh(run, DT);
    expect(d.tide).toBeNull();
  });

  it('la marée ralentit la marche hors des îlots, même sans eau sur la carte', () => {
    const { run } = makeLady();
    const d = run.director;
    const cfg = def.tide!;
    d.tide = { t: cfg.rise + 0.5, islets: [], tick: 99 };
    stepRun(run, idleInput());
    expect(run.hero.wading).toBe(true);
  });

  it('à son heure, elle n\'est pas là : l\'arène se referme, l\'eau frémit, puis elle sort', () => {
    const run = makeMarsh(5);
    makeImmortal(run);
    run.weapons.length = 0;
    run.time = data.tuning.durationMin * 60;
    stepRun(run, idleInput());
    const d = run.director;
    expect(d.bossSpawned).toBe(true);
    const e = run.enemies;
    let i = -1;
    for (let k = 0; k < e.count; k++) if (e.uid[k] === d.bossUid) i = k;
    expect(i).toBeGreaterThanOrEqual(0);
    expect(e.state[i]).toBe(LS_EMERGE);
    expect(d.bossHidden).toBe(true);
    expect(bossBarFrac(run, i)).toBe(1);
    const steps = Math.ceil((def.emerge! - LADY_RISE) / DT) + 2;
    for (let k = 0; k < steps; k++) stepRun(run, idleInput());
    for (let k = 0; k < e.count; k++) if (e.uid[k] === d.bossUid) i = k;
    expect(d.bossHidden).toBe(false);
    expect(e.state[i]).toBe(LS_EMERGE);
    for (let k = 0; k < Math.ceil(LADY_RISE / DT) + 2; k++) stepRun(run, idleInput());
    for (let k = 0; k < e.count; k++) if (e.uid[k] === d.bossUid) i = k;
    expect(e.state[i]).not.toBe(LS_EMERGE);
  });

  it('vaincue, elle laisse le souvenir du mariage, et plus de vase ni de marée', () => {
    const save = makeSave(12);
    expect(pendingMemory(data, save, MARSH)).toBe('memory.wedding');
    const { run, i } = makeLady();
    run.cfg.memory = 'memory.wedding';
    run.mires.push({ x: 0, y: 0, radius: 10, life: 5, maxLife: 5 });
    run.director.tide = { t: 1, islets: [], tick: 1 };
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    expect(run.director.bossDead).toBe(true);
    expect(run.mires).toHaveLength(0);
    expect(run.director.tide).toBeNull();
    expect(run.map.pois.some((p) => p.kind === 'memory')).toBe(true);
  });

  it('elle sombre : son butin et le Souvenir ne paraissent qu\'une fois l\'eau refermée', () => {
    const { run, i } = makeLady();
    run.cfg.memory = 'memory.wedding';
    run.enemies.x[i] = run.hero.x;
    run.enemies.y[i] = run.hero.y;
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    const poi = run.map.pois.find((p) => p.kind === 'memory')!;
    expect(poi.progress).toBeCloseTo(-def.sink!, 1);
    expect(poi.armed).toBe(false);
    expect(run.pickups.count).toBeGreaterThanOrEqual(4);
    for (let k = 0; k < run.pickups.count; k++) expect(run.pickups.age[k]).toBeLessThan(0);
    // Moon est dessus : rien ne se ramasse tant qu'elle n'a pas disparu.
    run.hero.x = poi.x;
    run.hero.y = poi.y;
    for (let k = 0; k < Math.floor((def.sink! - 0.3) / DT); k++) stepRun(run, idleInput());
    expect(run.phase).toBe('playing');
    expect(run.pendingChests).toBe(0);
    expect(run.memoryTaken).toBe(false);
    for (let k = 0; k < Math.ceil((0.6 + data.tuning.events.memoryArmSeconds) / DT) + 5 && run.phase === 'playing'; k++) stepRun(run, idleInput());
    expect(run.phase).not.toBe('playing');
  });
});
