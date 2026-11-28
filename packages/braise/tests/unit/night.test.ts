import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/core/combat.ts';
import { advanceNight, nightClock, updateDirector } from '../../src/core/director.ts';
import { hashRun } from '../../src/core/bots.ts';
import { closeChest, closeFind, takeCard } from '../../src/core/levelup.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { enemyHpScale } from '../../src/core/stats.ts';
import { EV, type Poi, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun, makeTutorial } from './helpers.ts';

const STEP = 1 / 60;

describe('l\'horloge de la Nuit', () => {
  it('la Nuit avance comme le chrono', () => {
    const run = makeRun(5);
    const input = idleInput();
    for (let i = 0; i < 600 && run.phase === 'playing'; i++) {
      stepRun(run, input);
      run.evCount = 0;
    }
    expect(run.night).toBeCloseTo(run.time / 60, 6);
    expect(run.night).toBeCloseTo(10 / 60, 6);
  });

  it('la difficulté suit la Nuit, pas le chrono', () => {
    const late = makeRun(5);
    late.time = 0;
    late.night = 10;
    updateDirector(late, STEP);
    const early = makeRun(5);
    early.time = 600;
    early.night = 0;
    updateDirector(early, STEP);
    expect(late.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, 10, 0, 0), 6);
    expect(early.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, 0, 0, 0), 6);
  });

  it('le boss vient à 15:00 de Nuit', () => {
    const run = makeRun(5);
    run.time = 60;
    run.night = 15;
    updateDirector(run, STEP);
    expect(run.director.bossSpawned).toBe(true);
    expect(run.bossCall).toBe('night');
  });

  it('pendant le boss, l\'échelle est celle de 15:00', () => {
    const run = makeRun(5);
    run.night = 15;
    updateDirector(run, STEP);
    run.night = 3;
    expect(nightClock(run)).toBe(data.tuning.durationMin);
    updateDirector(run, STEP);
    expect(run.hpScaleNow).toBeCloseTo(enemyHpScale(data.tuning.scale, data.tuning.durationMin, 0, 0), 6);
  });
});

/** Pose le héros sur le premier lieu de cette sorte. */
function onPoi(run: Run, kind: Poi['kind']): Poi {
  const poi = run.map.pois.find((p) => p.kind === kind)!;
  run.hero.x = poi.x;
  run.hero.y = poi.y + 4;
  run.hero.px = run.hero.x;
  run.hero.py = run.hero.y;
  return poi;
}

/** Avance de n pas, en prenant la première carte et en fermant coffres et trouvailles ; renvoie les événements émis. */
function play(run: Run, n: number): number[] {
  const input = idleInput();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let guard = 0; guard < 20 && run.phase !== 'playing'; guard++) {
      if (run.phase === 'levelup') takeCard(run, 0);
      else if (run.phase === 'chest') closeChest(run);
      else if (run.phase === 'find') closeFind(run);
      else break;
    }
    if (run.phase !== 'playing') break;
    stepRun(run, input);
    for (let k = 0; k < run.evCount; k++) out.push(run.evType[k]!);
    run.evCount = 0;
  }
  return out;
}

describe('le saut de braséro', () => {
  it('un braséro rallumé fait sauter la Nuit de 1,5 min', () => {
    const run = makeRun(31);
    makeImmortal(run);
    const poi = onPoi(run, 'brazier');
    const events: number[] = [];
    for (let i = 0; i < 12 * 60 && poi.state !== 3; i++) events.push(...play(run, 1));
    expect(poi.state).toBe(3);
    expect(run.night).toBeCloseTo(run.time / 60 + data.tuning.night.brazierJump, 3);
    expect(events).toContain(EV.nightJump);
  });

  it('un saut ne dépasse pas 14:30', () => {
    const run = makeRun(31);
    run.night = 14.2;
    expect(advanceNight(run, 1.5)).toBeCloseTo(0.3, 6);
    expect(run.night).toBeCloseTo(14.5, 6);
  });

  it('les vagues sautées ne partent pas, sauf la dernière', () => {
    const run = makeRun(31);
    makeImmortal(run);
    const crawler = data.enemies.findIndex((e) => e.id === 'enemy.crawler');
    const silent = run.region.horde.map((h) => ({ ...h, weights: h.weights.map(() => 0) }));
    const wave = { shape: 'circle' as const, enemy: crawler, count: 5 };
    run.region = { ...run.region, horde: silent, waves: [{ ...wave, at: 2 }, { ...wave, at: 3 }, { ...wave, at: 4 }] };
    run.director.eliteIdx = 99;
    run.night = 1.9;
    run.time = 1.9 * 60;
    // Un ennemi loin, pour que le sursaut d'écran vide ne joue pas.
    spawnEnemy(run, crawler, run.hero.x + 300, run.hero.y, 1);
    advanceNight(run, 2.5);
    play(run, 3);
    expect(run.director.waveIdx).toBe(3);
    expect(run.enemies.count).toBe(1 + 5);
  });

  it('deux élites rattrapés arrivent à 20 s d\'écart', () => {
    const run = makeRun(31);
    makeImmortal(run);
    run.data = { ...run.data, tuning: { ...run.data.tuning, eliteMinutes: [5, 10] } };
    run.night = 4;
    run.time = 4 * 60;
    advanceNight(run, 6.2);
    const count = (events: number[]): number => events.filter((t) => t === EV.eliteSpawn).length;
    let seen = count(play(run, 1));
    expect(seen).toBe(1);
    seen += count(play(run, 19 * 60 - 1));
    expect(seen).toBe(1);
    seen += count(play(run, 1.1 * 60));
    expect(seen).toBe(2);
  });
});

/** La cloche de la carte. */
function bellOf(run: Run): Poi {
  return run.map.pois.find((p) => p.kind === 'bell')!;
}

/** Avance de n pas en tenant le héros à cette place (rien ne le pousse hors du cercle). */
function hold(run: Run, x: number, y: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    run.hero.x = x;
    run.hero.y = y;
    run.hero.px = x;
    run.hero.py = y;
    out.push(...play(run, 1));
  }
  return out;
}

/** Une partie à cette heure de Nuit, sans avance, avec la cloche déjà allumée. */
function ready(seed: number, night: number): Run {
  const run = makeRun(seed);
  makeImmortal(run);
  run.time = night * 60;
  run.night = night;
  run.braziersLit = data.tuning.night.bellBraziers;
  return run;
}

describe('la cloche', () => {
  it('la carte a une cloche au centre, découverte, éteinte', () => {
    const run = makeRun(9);
    const bells = run.map.pois.filter((p) => p.kind === 'bell');
    expect(bells.length).toBe(1);
    const center = (data.tuning.mapTiles / 2) * data.tuning.tileSize;
    expect(bells[0]!.x).toBe(center);
    expect(bells[0]!.y).toBe(center);
    expect(bells[0]!.discovered).toBe(true);
    expect(bells[0]!.state).toBe(0);
  });

  it('le tutoriel n\'a pas de cloche', () => {
    expect(makeTutorial().map.pois.some((p) => p.kind === 'bell')).toBe(false);
  });

  it('la cloche s\'allume au 3e braséro', () => {
    const run = makeRun(9);
    makeImmortal(run);
    const bell = bellOf(run);
    run.braziersLit = 2;
    play(run, 1);
    expect(bell.state).toBe(0);
    run.braziersLit = 3;
    expect(play(run, 1)).toContain(EV.bellReady);
    expect(bell.state).toBe(1);
  });

  it('rester 2 s la sonne ; sortir à 1,9 s remet à zéro', () => {
    const run = ready(9, 2);
    const bell = bellOf(run);
    hold(run, bell.x, bell.y, 114);
    hold(run, bell.x + 200, bell.y, 1);
    hold(run, bell.x, bell.y, 114);
    expect(bell.state).toBe(1);
    expect(hold(run, bell.x, bell.y, 12)).toContain(EV.bellRung);
    expect(bell.state).toBe(2);
    expect(run.bossCall).toBe('bell');
  });

  it('le boss arrive 3 s après la cloche', () => {
    const run = ready(9, 8);
    const bell = bellOf(run);
    hold(run, bell.x, bell.y, 2 * 60 + 2);
    expect(bell.state).toBe(2);
    hold(run, bell.x, bell.y, 2.9 * 60);
    expect(run.director.bossSpawned).toBe(false);
    hold(run, bell.x, bell.y, 0.2 * 60);
    expect(run.director.bossSpawned).toBe(true);
    expect(run.nightCredit).toBeCloseTo(7, 1);
    expect(run.haste).toBe(21);
  });

  it('la Nuit à 15:00 pendant l\'attente : un seul boss', () => {
    const run = ready(9, 14.9);
    const bell = bellOf(run);
    const events = hold(run, bell.x, bell.y, 8 * 60);
    expect(events.filter((t) => t === EV.bossSpawn).length).toBe(1);
  });

  it('même graine, même partie', () => {
    const one = (): number => {
      const run = ready(42, 6);
      const bell = bellOf(run);
      hold(run, bell.x, bell.y, 20 * 60);
      return hashRun(run);
    };
    expect(one()).toBe(one());
  });
});
