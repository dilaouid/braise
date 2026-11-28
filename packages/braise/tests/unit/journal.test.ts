import { describe, expect, it } from 'vitest';
import { activeBot, simulate } from '../../src/core/bots.ts';
import { spawnEnemy } from '../../src/core/combat.ts';
import { callBoss } from '../../src/core/director.ts';
import { journalEntry, newTrack, trackStep, type JournalMeta } from '../../src/core/journal.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { data, makeImmortal, makeRun, makeSave } from './helpers.ts';

const META: JournalMeta = { source: 'robot:active', date: '2026-11-28T00:00:00.000Z', build: 'test', heroLevel: 1, altarRanks: 0, talentRanks: 0 };

describe('journal des parties', () => {
  it('une partie de trois minutes : une ligne par minute, et des totaux qui collent à la partie', () => {
    const run = makeRun(21, makeSave(10), true);
    const track = newTrack(run);
    simulate(run, { bot: activeBot, maxSteps: 3 * 60 * 60 + 30, onStep: (r) => trackStep(r, track) });
    const entry = journalEntry(run, track, META);
    expect(entry.minutes.map((m) => m.m)).toEqual([0, 1, 2, 3]);
    expect(entry.kills).toBe(run.hero.kills);
    expect(entry.minutes.reduce((s, m) => s + m.kills, 0)).toBe(run.hero.kills);
    expect(entry.minutes.reduce((s, m) => s + m.hits, 0)).toBe(entry.hits);
    expect(Math.abs(entry.minutes.reduce((s, m) => s + m.hurt, 0) - entry.hurt)).toBeLessThanOrEqual(entry.minutes.length);
    const byKind = Object.values(entry.hurtBy).reduce((s, v) => s + v, 0);
    expect(Math.abs(byKind - entry.hurt)).toBeLessThanOrEqual(Object.keys(entry.hurtBy).length + 1);
    expect(entry.hits).toBeGreaterThan(0);
    expect(entry.weapons.length).toBeGreaterThan(0);
    expect(entry.boss).toBeNull();
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  }, 60000);

  it('le suivi ne change rien à la partie', () => {
    const plain = makeRun(5, makeSave(10), true);
    simulate(plain, { bot: activeBot, maxSteps: 60 * 60 });
    const tracked = makeRun(5, makeSave(10), true);
    const track = newTrack(tracked);
    simulate(tracked, { bot: activeBot, maxSteps: 60 * 60, onStep: (r) => trackStep(r, track) });
    expect(tracked.hero.hp).toBe(plain.hero.hp);
    expect(tracked.hero.kills).toBe(plain.hero.kills);
    expect(tracked.tick).toBe(plain.tick);
  });

  it('un héros immobile tué par des rampants : le tueur est un rampant, aucune action', () => {
    const run = makeRun(9);
    const track = newTrack(run);
    for (let k = 0; k < 30; k++) spawnEnemy(run, 0, run.hero.x + 2, run.hero.y);
    // Un robot qui ne fait rien : les montées de niveau sont résolues, le héros ne bouge pas.
    simulate(run, { bot: () => {}, maxSteps: 60 * 60, onStep: (r) => trackStep(r, track) });
    expect(run.phase).toBe('dead');
    const entry = journalEntry(run, track, META);
    expect(entry.outcome).toBe('death');
    expect(entry.killer).toBe(data.enemies[0]!.id);
    expect(entry.actions.dashes).toBe(0);
    expect(entry.actions.flasks).toBe(0);
  });

  it('une ruée est comptée une fois', () => {
    const run = makeRun(9);
    const track = newTrack(run);
    const input = idleInput();
    input.moveX = 1;
    input.dash = true;
    stepRun(run, input);
    trackStep(run, track);
    input.dash = false;
    for (let i = 0; i < 30; i++) {
      stepRun(run, input);
      trackStep(run, track);
    }
    expect(track.dashes).toBe(1);
  });

  it('le combat de boss : son apparition, ses points de vie et sa chute', () => {
    const run = makeRun(8, makeSave(1));
    makeImmortal(run);
    run.time = 15 * 60 - 0.05;
    run.night = run.time / 60;
    const track = newTrack(run);
    const input = idleInput();
    for (let i = 0; i < 120; i++) {
      stepRun(run, input);
      trackStep(run, track);
    }
    expect(track.boss).not.toBeNull();
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) if (e.uid[i] === run.director.bossUid) e.hp[i] = 0;
    stepRun(run, input);
    trackStep(run, track);
    const entry = journalEntry(run, track, META);
    expect(entry.boss?.id).toBe(data.enemies[run.region.bossIdx]!.id);
    expect(entry.boss?.hpLeft).toBe(0);
    expect(entry.boss?.hpMax).toBeGreaterThan(1000);
    expect(entry.boss?.seconds).toBeGreaterThan(1);
  });
});

describe('journal : la cloche', () => {
  it('une partie où la cloche a sonné à 8:00 de Nuit', () => {
    const run = makeRun(8, makeSave(1));
    makeImmortal(run);
    run.time = 8 * 60;
    run.night = 8;
    const track = newTrack(run);
    callBoss(run);
    const input = idleInput();
    for (let i = 0; i < 4 * 60; i++) {
      stepRun(run, input);
      trackStep(run, track);
    }
    const entry = journalEntry(run, track, META);
    expect(entry.bossCall).toBe('bell');
    expect(entry.nightAtBoss).not.toBeNull();
    expect(Math.abs(entry.nightAtBoss! - 8.05)).toBeLessThanOrEqual(0.1);
    expect(entry.haste).toBe(21);
    expect(entry.minutes.every((m) => typeof m.night === 'number')).toBe(true);
  });

  it('sans cloche ni boss : rien d\'appelé', () => {
    const run = makeRun(8, makeSave(1));
    const track = newTrack(run);
    stepRun(run, idleInput());
    trackStep(run, track);
    const entry = journalEntry(run, track, META);
    expect(entry.bossCall).toBeNull();
    expect(entry.nightAtBoss).toBeNull();
    expect(entry.haste).toBe(0);
  });
});
