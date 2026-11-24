import { describe, expect, it } from 'vitest';
import { applyBurn, bossBarFrac, hurtEnemy, reapEnemies, spawnEnemy, tickStatuses } from '../../src/core/combat.ts';
import { contactDamage, updateEnemies } from '../../src/core/enemies.ts';
import { createRun, idleInput, stepRun } from '../../src/core/run.ts';
import { buildGrid } from '../../src/core/stores.ts';
import { createTutorialRun } from '../../src/core/tutorial-run.ts';
import { PK_ASH, PK_GOLD, TG_CIRCLE, type Run, type RunConfig } from '../../src/core/types.ts';
import { bossBeaten, buildSheet, pendingMemory, unlockedContent } from '../../src/meta/hero.ts';
import { CLASS, REGION, data, makeImmortal, makeSave } from './helpers.ts';

const DT = 1 / 60;
const idx = (id: string): number => data.enemies.findIndex((e) => e.id === id);
const ASH = idx('boss.ash-stag');
const STAG = idx('boss.lightless-stag');
const SWARM = idx('enemy.ash-swarm');

function config(seed: number, reborn?: boolean): RunConfig {
  const save = makeSave();
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  return {
    seed, regionId: REGION, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false, reborn,
  };
}

/** Le Cerf de Cendre seul dans son arène, à 200 px du héros, sans attaque immédiate. */
function makeAsh(seed = 3): { run: Run; i: number } {
  const run = createRun(data, config(seed, true));
  makeImmortal(run);
  run.enemies.count = 0;
  run.telegraphs.count = 0;
  const d = run.director;
  const i = spawnEnemy(run, run.region.bossIdx, run.hero.x + 200, run.hero.y, 1);
  d.bossSpawned = true;
  d.arenaX = run.hero.x;
  d.arenaY = run.hero.y;
  d.arenaR = 600;
  d.bossUid = run.enemies.uid[i]!;
  d.bossPhase = 1;
  d.bossLast = -1;
  d.bossNext = -1;
  run.enemies.timer2[i] = 99;
  return { run, i };
}

function countKind(run: Run, kind: number): number {
  let n = 0;
  for (let k = 0; k < run.enemies.count; k++) if (run.enemies.kind[k] === kind && run.enemies.hp[k]! > 0) n++;
  return n;
}

/** Retrouve le boss après des apparitions ou des morts (les index bougent). */
function bossIndex(run: Run): number {
  for (let k = 0; k < run.enemies.count; k++) if (run.enemies.uid[k] === run.director.bossUid) return k;
  return -1;
}

function reformNow(run: Run): number {
  const i = bossIndex(run);
  run.enemies.hp[i] = 0;
  expect(reapEnemies(run)).toBe(false);
  return bossIndex(run);
}

describe('le Cerf de Cendre', () => {
  it('le Bois a un boss reformé et ses deux cinématiques', () => {
    const region = data.regions[REGION]!;
    expect(region.rebornBossIdx).toBe(ASH);
    expect(region.cinematics).toEqual({ first: 'stag-call', reborn: 'stag-ash' });
  });

  it('reborn remplace le boss, sinon le Cerf vivant reste', () => {
    expect(createRun(data, config(1, true)).region.bossIdx).toBe(ASH);
    expect(createRun(data, config(1)).region.bossIdx).toBe(STAG);
  });

  it('le tutoriel garde le Guetteur', () => {
    const run = createTutorialRun(data, config(7, true));
    expect(run.region.bossIdx).toBe(idx('boss.watcher'));
  });

  it('il se relève une fois avec 40 % de sa vie, en phase 3', () => {
    const { run } = makeAsh();
    const i = reformNow(run);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(run.enemies.maxHp[i]).toBe(14400);
    expect(run.enemies.hp[i]).toBe(14400);
    expect(run.director.bossReformed).toBe(true);
    expect(run.director.bossReformT).toBe(3);
    for (let t = 0; t < 3.1; t += DT) updateEnemies(run, DT);
    expect(run.director.bossReformT).toBe(0);
    expect(run.director.bossPhase).toBe(3);
  });

  it('la seconde mort est la vraie', () => {
    const { run } = makeAsh();
    reformNow(run);
    run.director.bossReformT = 0;
    run.enemies.hp[bossIndex(run)] = 0;
    expect(reapEnemies(run)).toBe(true);
  });

  it('un coup mortel pendant la poussière ne le relève pas deux fois', () => {
    const { run } = makeAsh();
    const i = reformNow(run);
    expect(hurtEnemy(run, i, 100000, 0, null, -1)).toBe(0);
    applyBurn(run, i, 5000);
    for (let t = 0; t < 1; t += DT) tickStatuses(run, i, DT);
    expect(run.enemies.hp[i]).toBe(14400);
  });

  it('pas de contact pendant la poussière', () => {
    const { run } = makeAsh();
    const i = reformNow(run);
    run.hero.x = run.enemies.x[i]!;
    run.hero.y = run.enemies.y[i]!;
    run.hero.invuln = 0;
    const before = run.hero.hp;
    buildGrid(run);
    contactDamage(run);
    expect(run.hero.hp).toBe(before);
  });

  it('les éclats sortent tous les 5 %', () => {
    const { run, i } = makeAsh();
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.89;
    updateEnemies(run, DT);
    expect(countKind(run, SWARM)).toBe(8);
  });

  it('un coup énorme : au plus 3 paquets par pas', () => {
    const { run, i } = makeAsh();
    run.enemies.hp[i] = run.enemies.maxHp[i]! * 0.7;
    updateEnemies(run, DT);
    expect(countKind(run, SWARM)).toBe(12);
    updateEnemies(run, DT);
    expect(countKind(run, SWARM)).toBe(24);
  });

  it('une annonce au sol dure toute la poussière, là où il va se relever', () => {
    const { run, i } = makeAsh();
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    const b = bossIndex(run);
    const tg = run.telegraphs;
    const rings = [];
    for (let t = 0; t < tg.count; t++) if (tg.owner[t] === run.director.bossUid) rings.push(t);
    expect(rings.length).toBe(1);
    const t = rings[0]!;
    expect(tg.shape[t]).toBe(TG_CIRCLE);
    expect([tg.x[t], tg.y[t]]).toEqual([run.enemies.x[b], run.enemies.y[b]]);
    expect(tg.damage[t]).toBe(0);
    expect(tg.duration[t]! - tg.t[t]!).toBeCloseTo(run.director.bossReformT, 2);
  });

  it('sa barre se vide à la chute, puis se remplit pendant la poussière', () => {
    const { run, i } = makeAsh();
    run.enemies.hp[i] = run.enemies.maxHp[i]! / 2;
    expect(bossBarFrac(run, i)).toBeCloseTo(0.5, 3);
    const b = reformNow(run);
    expect(bossBarFrac(run, b)).toBeCloseTo(0, 3);
    run.director.bossReformT = 1.5;
    expect(bossBarFrac(run, b)).toBeCloseTo(0.5, 3);
    run.director.bossReformT = 0;
    expect(bossBarFrac(run, b)).toBe(1);
  });

  it('par le pas de jeu : il tombe, se relève, retombe, puis le portail apparaît', () => {
    const { run, i } = makeAsh();
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    expect(run.director.bossDead).toBe(false);
    for (let k = 0; k < 60 * 3.2; k++) {
      run.hero.invuln = 1;
      stepRun(run, idleInput());
    }
    expect(run.director.bossReformT).toBe(0);
    run.enemies.hp[bossIndex(run)] = 0;
    stepRun(run, idleInput());
    expect(run.director.bossDead).toBe(true);
    expect(run.map.pois.some((p) => p.kind === 'portal')).toBe(true);
  });

  it('butin doublé', () => {
    const { run } = makeAsh();
    reformNow(run);
    run.director.bossReformT = 0;
    run.pickups.count = 0;
    run.enemies.hp[bossIndex(run)] = 0;
    reapEnemies(run);
    let gold = 0;
    let ash = 0;
    for (let k = 0; k < run.pickups.count; k++) {
      if (run.pickups.kind[k] === PK_GOLD) gold += run.pickups.value[k]!;
      if (run.pickups.kind[k] === PK_ASH) ash += run.pickups.value[k]!;
    }
    expect(gold).toBe(2 * data.tuning.gold.boss);
    expect(ash).toBe(2 * data.tuning.ashes.boss);
  });

  it('le Cerf vivant garde son butin', () => {
    const run = createRun(data, config(3));
    run.enemies.count = 0;
    run.pickups.count = 0;
    const i = spawnEnemy(run, STAG, run.hero.x + 200, run.hero.y, 1);
    run.enemies.hp[i] = 0;
    expect(reapEnemies(run)).toBe(true);
    let gold = 0;
    for (let k = 0; k < run.pickups.count; k++) if (run.pickups.kind[k] === PK_GOLD) gold += run.pickups.value[k]!;
    expect(gold).toBe(data.tuning.gold.boss);
  });

  it('bossBeaten', () => {
    const save = makeSave();
    expect(bossBeaten(save, REGION)).toBe(false);
    save.account.regions[REGION] = { lit: false, bestVigil: 0, bossKills: 0 };
    expect(bossBeaten(save, REGION)).toBe(false);
    save.account.regions[REGION] = { lit: true, bestVigil: 1, bossKills: 1 };
    expect(bossBeaten(save, REGION)).toBe(true);
  });

  it('une vieille sauvegarde reçoit encore son Souvenir', () => {
    const save = makeSave();
    save.account.regions[REGION] = { lit: true, bestVigil: 1, bossKills: 2 };
    expect(bossBeaten(save, REGION)).toBe(true);
    expect(pendingMemory(data, save, REGION)).toBe('memory.meeting');
  });
});
