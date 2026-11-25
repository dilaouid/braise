import { describe, expect, it } from 'vitest';
import { activeBot, fleeBot, hashRun, plannedPick, simulate } from '../../src/core/bots.ts';
import { addPickup, spawnEnemy } from '../../src/core/combat.ts';
import { computeResult } from '../../src/core/rewards.ts';
import { abandonRun, idleInput, stepRun } from '../../src/core/run.ts';
import { PK_GEM, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun, makeSave } from './helpers.ts';

function trace(seed: number, steps: number): number[] {
  const run = makeRun(seed);
  const hashes: number[] = [];
  simulate(run, {
    bot: activeBot,
    maxSteps: steps,
    onStep: (r) => {
      if (r.tick % 60 === 0) hashes.push(hashRun(r));
    },
  });
  return hashes;
}

describe('déterminisme (document 02 §15, document 08 §14)', () => {
  it('même graine, mêmes entrées : même état à chaque seconde pendant 3 minutes', () => {
    const a = trace(42, 3 * 60 * 60);
    const b = trace(42, 3 * 60 * 60);
    expect(a.length).toBeGreaterThan(100);
    expect(a).toEqual(b);
  });

  it('deux graines différentes donnent deux parties différentes', () => {
    expect(trace(1, 1200)).not.toEqual(trace(2, 1200));
  });

  it('même état après 54 000 pas, soit quinze minutes', () => {
    const play = (): { hash: number; tick: number } => {
      const run = makeRun(7, makeSave(30), true);
      // Un héros qui ne meurt pas : le test porte sur le déterminisme, pas sur la survie.
      makeImmortal(run);
      simulate(run, { bot: activeBot, maxSteps: 54000 });
      return { hash: hashRun(run), tick: run.tick };
    };
    const a = play();
    const b = play();
    expect(a.tick).toBe(54000);
    expect(a).toEqual(b);
  }, 120000);
});

describe('règles de la partie', () => {
  it('les deux premières minutes ne tuent pas un héros immobile avant 20 s', () => {
    // La marge est mince (il reste quelques points de vie à 20 s) : sur 60 graines, 38 survivaient avant la
    // horde de fin de partie (2026-11-25) et 40 après. Huit graines jugeaient le tirage, pas la règle : on en
    // mesure vingt-quatre et on demande la majorité, pour voir une horde de début plus rude.
    let alive = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const run = makeRun(seed);
      const input = idleInput();
      for (let i = 0; i < 20 * 60; i++) stepRun(run, input);
      if (run.phase !== 'dead') alive++;
    }
    expect(alive).toBeGreaterThanOrEqual(13);
  });

  it('un robot qui ne fait que fuir survit 3:00 en Veillée I, niveau 1, sans boost', () => {
    // Mesuré sur 40 graines : médiane 4:31, première mort 2:21 (docs/decisions). Le test tolère les graines
    // où le robot se laisse acculer : aucune mort avant 2:00, et au moins 5 parties sur 6 passent 3:00.
    let survived = 0;
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110, 121, 132];
    for (const seed of seeds) {
      const run = makeRun(seed);
      simulate(run, { bot: fleeBot, maxSteps: 3 * 60 * 60 });
      expect(run.time, `graine ${seed}`).toBeGreaterThanOrEqual(120);
      if (run.time >= 179.9) survived++;
    }
    expect(survived / seeds.length).toBeGreaterThanOrEqual(5 / 6);
  }, 120000);

  // Le robot choisit ses cartes comme un joueur appliqué (plannedPick) : prendre la première carte au
  // hasard rendait le taux dépendant des tirages (≈ 53 à 60 % selon les graines). Avec ce choix, il est
  // d'environ 78 % sur 180 parties, ce qui laisse une marge à 20 parties.
  it('un robot qui vise ses évolutions atteint le boss dans au moins 60 % des parties, héros niveau 10', () => {
    let reached = 0;
    const runs = 20;
    for (let k = 0; k < runs; k++) {
      const run = makeRun(300 + k, makeSave(10), true);
      simulate(run, { bot: activeBot, pickCard: plannedPick, maxSteps: 15.2 * 60 * 60 });
      if (run.director.bossSpawned) reached++;
    }
    expect(reached / runs).toBeGreaterThanOrEqual(0.6);
  }, 300000);

  it('une gemme dans la lueur vole vers le héros et donne de l\'expérience', () => {
    const run = makeRun(5);
    addPickup(run, PK_GEM, run.hero.x + 30, run.hero.y, 5);
    const input = idleInput();
    for (let i = 0; i < 90 && run.phase === 'playing'; i++) stepRun(run, input);
    expect(run.hero.gems).toBe(1);
    expect(run.hero.xp).toBeGreaterThan(0);
  });

  it('une gemme hors de la lueur reste au sol', () => {
    const run = makeRun(5);
    addPickup(run, PK_GEM, run.hero.x + 200, run.hero.y, 5);
    const input = idleInput();
    for (let i = 0; i < 60; i++) stepRun(run, input);
    expect(run.hero.gems).toBe(0);
  });

  it('la ruée rend invulnérable, traverse les ennemis et se recharge en 2,5 s', () => {
    const run = makeRun(9);
    const x0 = run.hero.x;
    for (let k = 0; k < 6; k++) spawnEnemy(run, 0, x0 + 30 + k * 8, run.hero.y);
    const input = idleInput();
    input.moveX = 1;
    input.dash = true;
    const hp = run.hero.hp;
    for (let i = 0; i < 11; i++) stepRun(run, input);
    expect(run.hero.x - x0).toBeGreaterThan(100);
    expect(run.hero.hp).toBeGreaterThanOrEqual(hp);
    expect(run.hero.dashCd).toBeGreaterThan(2);
  });

  it('un contact inflige des dégâts puis 0,5 s d\'invulnérabilité', () => {
    const run = makeRun(9);
    for (let k = 0; k < 8; k++) spawnEnemy(run, 0, run.hero.x + 2, run.hero.y);
    const input = idleInput();
    stepRun(run, input);
    stepRun(run, input);
    const afterFirst = run.hero.hp;
    expect(afterFirst).toBeLessThan(run.hero.stats.maxHp);
    for (let i = 0; i < 10; i++) stepRun(run, input);
    // Pendant l'invulnérabilité, aucun autre coup (la régénération peut rendre un peu de vie).
    expect(run.hero.hp).toBeGreaterThanOrEqual(afterFirst);
  });

  it('le plafond de 350 ennemis vivants est respecté', () => {
    const run = makeRun(4, makeSave(1));
    makeImmortal(run);
    run.time = 14 * 60;
    run.director.waveIdx = 99;
    const input = idleInput();
    let max = 0;
    for (let i = 0; i < 40 * 60; i++) {
      run.director.budget += 50;
      stepRun(run, input);
      if (run.phase !== 'playing') break;
      // Les enfants des Souches-mortes et les vagues peuvent dépasser de peu le plafond d'achat.
      max = Math.max(max, run.enemies.count);
    }
    expect(max).toBeGreaterThan(300);
    expect(max).toBeLessThanOrEqual(data.tuning.enemyCap.expedition + 60);
  });

  it('à la mort, exactement 50 % de l\'or et des Cendres sont gardés', () => {
    const run = makeRun(6);
    run.hero.gold = 137;
    run.hero.ashDrops = 23;
    run.time = 240;
    run.hero.hp = 0;
    run.outcome = 'death';
    run.phase = 'dead';
    const res = computeResult(run);
    expect(res.goldCollected).toBe(137);
    expect(res.goldKept).toBe(Math.round(137 * 0.5));
    expect(res.ashesCollected).toBe(4 * 4 + 23);
    expect(res.ashesKept).toBe(Math.round(39 * 0.5));
  });

  it('une victoire garde tout, avec le bonus de 20 %', () => {
    const run = makeRun(6);
    run.hero.gold = 1000;
    run.hero.ashDrops = 100;
    run.time = 900;
    run.outcome = 'victory';
    run.phase = 'victory';
    const res = computeResult(run);
    expect(res.goldKept).toBe(1200);
    expect(res.ashesKept).toBe(Math.round((60 + 100) * 1.2));
  });

  it('abandonner compte comme une mort', () => {
    const run = makeRun(6);
    run.hero.gold = 100;
    abandonRun(run);
    expect(run.phase).toBe('dead');
    expect(computeResult(run).goldKept).toBe(50);
  });

  it('une expédition perdue à 4:00 rapporte au moins 8 Cendres, et le rang le moins cher en coûte 5 au plus', () => {
    const run = makeRun(6);
    run.time = 240;
    run.outcome = 'death';
    expect(computeResult(run).ashesKept).toBeGreaterThanOrEqual(8);
    expect(Math.min(...data.altar.map((b) => b.baseCost))).toBeLessThanOrEqual(5);
  });
});

describe('boss', () => {
  function bossRun(): Run {
    const run = makeRun(8, makeSave(1));
    makeImmortal(run);
    run.time = 15 * 60 - 0.05;
    return run;
  }

  it('arrive à 15:00, referme la carte en arène et arrête la horde ordinaire', () => {
    const run = bossRun();
    const input = idleInput();
    for (let i = 0; i < 30; i++) stepRun(run, input);
    expect(run.director.bossSpawned).toBe(true);
    const boss = data.enemies.findIndex((e) => e.rank === 'boss');
    const e = run.enemies;
    let found = false;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === boss) found = true;
    expect(found).toBe(true);
    expect(run.director.arenaR).toBe(16 * 32);
  });

  it('battu, il ouvre un portail ; le prendre termine la partie en victoire', () => {
    const run = bossRun();
    const input = idleInput();
    for (let i = 0; i < 30; i++) stepRun(run, input);
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) if (data.enemies[e.kind[i]!]!.rank === 'boss') e.hp[i] = 0;
    stepRun(run, input);
    expect(run.hero.bossKills).toBe(1);
    const portal = run.map.pois.find((p) => p.kind === 'portal');
    expect(portal).toBeDefined();
    simulate(run, { bot: fleeBot, maxSteps: 60 * 60 });
    expect(run.phase).toBe('victory');
    expect(computeResult(run).outcome).toBe('victory');
  });

  it('boss battu pendant que le héros meurt : la victoire l\'emporte, 1 point de vie', () => {
    const run = bossRun();
    const input = idleInput();
    for (let i = 0; i < 30; i++) stepRun(run, input);
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) if (data.enemies[e.kind[i]!]!.rank === 'boss') e.hp[i] = 0;
    run.hero.hp = -5;
    stepRun(run, input);
    expect(run.phase).not.toBe('dead');
    expect(run.hero.hp).toBe(1);
  });
});
