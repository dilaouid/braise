import { describe, expect, it } from 'vitest';
import type { RunModsRaw } from '../../src/content/index.ts';
import { activeBot, hashRun, simulate } from '../../src/core/bots.ts';
import { addPickup, healHero, hurtEnemy, lowHp, reapEnemies, spawnEnemy } from '../../src/core/combat.ts';
import { updateDirector } from '../../src/core/director.ts';
import { NEUTRAL_MODS } from '../../src/core/mods.ts';
import { dashCooldown, idleInput, skillCooldown, stepRun } from '../../src/core/run.ts';
import { EV, PK_GEM, PK_RED_GEM, ST_BURN, STEP, type Run } from '../../src/core/types.ts';
import { data, makeModRun, makeRun, makeSave, makeTutorial } from './helpers.ts';

const idx = (id: string): number => data.enemies.findIndex((e) => e.id === id);
const CRAWLER = idx('enemy.crawler');
const ELITE = data.enemies.findIndex((e) => e.rank === 'elite');
const BOSS = idx('boss.lightless-stag');

/** Une run calme : pas d'ennemi, pas de régénération, pas de critique. */
function calm(mods: RunModsRaw): Run {
  const run = makeModRun(mods);
  run.enemies.count = 0;
  run.hero.stats.regen = 0;
  run.hero.stats.critChance = 0;
  return run;
}

function count(run: Run, type: number): number {
  let n = 0;
  for (let i = 0; i < run.evCount; i++) if (run.evType[i] === type) n++;
  return n;
}

/** Un coup de 100 sur un ennemi ordinaire posé loin du héros. */
function strike(run: Run): number {
  const i = spawnEnemy(run, CRAWLER, run.hero.x + 300, run.hero.y, 1e6);
  return hurtEnemy(run, i, 100, 0, null, -1, 0);
}

function killElite(run: Run): void {
  const i = spawnEnemy(run, ELITE, run.hero.x + 300, run.hero.y, 1);
  run.enemies.hp[i] = 0;
  reapEnemies(run);
}

describe('Faim', () => {
  it('rend 1 PV toutes les 5 gemmes, rouges comprises', () => {
    const run = calm({ gemsPerHeal: 5 });
    run.hero.hp = 50;
    const collect = (kind: number, n: number): void => {
      for (let k = 0; k < n; k++) addPickup(run, kind, run.hero.x, run.hero.y - 6, 0);
      stepRun(run, idleInput());
    };
    collect(PK_GEM, 4);
    expect(run.hero.hp).toBe(50);
    collect(PK_RED_GEM, 1);
    expect(run.hero.hp).toBe(51);
    collect(PK_GEM, 5);
    expect(run.hero.hp).toBe(52);
  });

  it('la fiole ne soigne pas et n\'est pas consommée', () => {
    const run = calm({ noFlask: true });
    run.hero.hp = 20;
    const flasks = run.hero.flasks;
    run.evCount = 0;
    stepRun(run, { ...idleInput(), flask: true });
    expect(run.hero.hp).toBe(20);
    expect(run.hero.flasks).toBe(flasks);
    expect(count(run, EV.flask)).toBe(0);
  });

  it('sans le malus, la fiole soigne', () => {
    const run = calm({});
    run.hero.hp = 20;
    stepRun(run, { ...idleInput(), flask: true });
    expect(run.hero.hp).toBeGreaterThan(20);
  });

  it('une source soigne toujours', () => {
    const run = calm({ noFlask: true });
    run.hero.hp = 20;
    const spring = run.map.pois.find((p) => p.kind === 'spring')!;
    run.hero.x = spring.x;
    run.hero.y = spring.y;
    stepRun(run, idleInput());
    expect(run.hero.hp).toBe(run.hero.stats.maxHp);
  });
});

describe('Ruée ardente', () => {
  it('brûle ce que la ruée touche, pas ce qui est loin', () => {
    const run = calm({ dashBurn: 20, dashBurnRadius: 18 });
    const near = spawnEnemy(run, CRAWLER, run.hero.x + 10, run.hero.y + 12, 1e4);
    const far = spawnEnemy(run, CRAWLER, run.hero.x + 70, run.hero.y, 1e4);
    stepRun(run, { ...idleInput(), dash: true });
    expect(run.enemies.status[near]! & ST_BURN).toBe(ST_BURN);
    expect(run.enemies.burnDmg[near]).toBeCloseTo(20 * data.tuning.statuses.burn.damageShare);
    expect(run.enemies.status[far]! & ST_BURN).toBe(0);
  });

  it('sans la rune, la ruée ne brûle rien', () => {
    const run = calm({});
    const near = spawnEnemy(run, CRAWLER, run.hero.x + 10, run.hero.y + 12, 1e4);
    stepRun(run, { ...idleInput(), dash: true });
    expect(run.enemies.status[near]! & ST_BURN).toBe(0);
  });

  it('la ruée recharge en 3,75 s', () => {
    const run = calm({ dashCooldownMult: 1.5 });
    expect(dashCooldown(run)).toBeCloseTo(3.75);
    stepRun(run, { ...idleInput(), dash: true });
    expect(run.hero.dashCd).toBeCloseTo(3.75);
    expect(dashCooldown(calm({}))).toBe(data.tuning.dash.cooldown);
  });
});

describe('Dernière lueur', () => {
  it('+60 % de Puissance sous 30 % des PV, rien à 30 % pile', () => {
    const run = calm({ lowHpPower: 0.6, lowHpShare: 0.3 });
    const max = run.hero.stats.maxHp;
    run.hero.hp = max * 0.3;
    expect(lowHp(run)).toBe(false);
    const base = strike(run);
    run.hero.hp = max * 0.3 - 0.5;
    expect(lowHp(run)).toBe(true);
    expect(strike(run)).toBe(Math.round(base * 1.6));
  });

  it('sans la rune, les PV bas ne changent rien', () => {
    const run = calm({});
    run.hero.hp = 1;
    expect(lowHp(run)).toBe(false);
  });

  it('soins et régénération divisés par deux, pas la résurrection', () => {
    const run = calm({ healMult: 0.5 });
    run.hero.hp = 40;
    healHero(run, 10);
    expect(run.hero.hp).toBe(45);
    run.hero.stats.regen = 60;
    stepRun(run, idleInput());
    expect(run.hero.hp).toBeCloseTo(45 + 60 * STEP * 0.5);
    run.hero.stats.regen = 0;
    run.hero.revives = 1;
    run.hero.hp = -5;
    stepRun(run, idleInput());
    expect(run.hero.hp).toBe(Math.round(run.hero.stats.maxHp * data.tuning.hero.reviveHpShare));
  });
});

describe('Appel', () => {
  /** Le budget du directeur après un pas, sans achat possible. */
  function budget(mods: RunModsRaw, time: number): number {
    const run = calm(mods);
    run.region = { ...run.region, horde: run.region.horde.map((h) => ({ ...h, weights: h.weights.map(() => 0) })), waves: [] };
    run.director.budget = 0;
    run.time = time;
    updateDirector(run, STEP);
    return run.director.budget;
  }

  it('le budget reçoit × 1,4, revenu et sursaut d\'écran vide', () => {
    expect(budget({ threatMult: 1.4 }, 1)).toBeCloseTo(budget({}, 1) * 1.4);
    expect(budget({ threatMult: 1.4 }, 60)).toBeCloseTo(budget({}, 60) * 1.4);
  });

  it('les vagues ne changent pas', () => {
    const wave = (mods: RunModsRaw): number => {
      const run = calm(mods);
      run.region = { ...run.region, horde: run.region.horde.map((h) => ({ ...h, weights: h.weights.map(() => 0) })) };
      run.time = run.region.waves[0]!.at * 60;
      updateDirector(run, STEP);
      return run.enemies.count;
    };
    expect(wave({ threatMult: 1.4 })).toBe(wave({}));
    expect(wave({})).toBeGreaterThan(0);
  });
});

describe('Braise vive', () => {
  it('une mort charge 1,5 de jauge, un élite 15', () => {
    const run = calm({ ultChargeMult: 1.5 });
    const i = spawnEnemy(run, CRAWLER, run.hero.x + 300, run.hero.y, 1);
    run.enemies.hp[i] = 0;
    reapEnemies(run);
    expect(run.hero.ultGauge).toBeCloseTo(1.5);
    killElite(run);
    expect(run.hero.ultGauge).toBeCloseTo(16.5);
  });

  it('la compétence recharge 50 % moins vite', () => {
    const run = calm({ skillCooldownMult: 1.5 });
    expect(skillCooldown(run)).toBeCloseTo(run.cls.skill.cooldown * 1.5);
    stepRun(run, { ...idleInput(), skill: true });
    expect(run.hero.skillCd).toBeCloseTo(run.cls.skill.cooldown * 1.5);
  });
});

describe('Nuit noire', () => {
  it('moitié moins de Lueur, critiques plus forts', () => {
    const save = makeSave();
    Object.assign(save.account.lantern, { owned: ['rune.black-night'], faces: ['rune.black-night', null, null, null] });
    const run = makeRun(1, save);
    expect(run.hero.stats.glow).toBe(20);
    expect(run.hero.stats.critMult).toBeCloseTo(2.1);
  });
});

describe('Chasse', () => {
  it('les élites ont 1,5 fois leurs PV, les autres non', () => {
    const run = calm({ eliteHpMult: 1.5 });
    const hp = (kind: number): number => run.enemies.maxHp[spawnEnemy(run, kind, 100, 100, 1)]!;
    expect(hp(ELITE)).toBe(Math.round(data.enemies[ELITE]!.hp * 1.5));
    expect(hp(CRAWLER)).toBe(data.enemies[CRAWLER]!.hp);
    expect(hp(BOSS)).toBe(data.enemies[BOSS]!.hp);
  });

  it('deux élites battus : +10 % de Puissance, et une annonce chacun', () => {
    const run = calm({ eliteKillPower: 0.05 });
    const base = strike(run);
    run.evCount = 0;
    killElite(run);
    killElite(run);
    expect(count(run, EV.hunt)).toBe(2);
    expect(strike(run)).toBe(Math.round(base * 1.1));
    let last = 0;
    for (let i = 0; i < run.evCount; i++) if (run.evType[i] === EV.hunt) last = run.evA[i]!;
    expect(last).toBeCloseTo(0.1);
  });

  it('sans la rune, un élite battu ne donne rien', () => {
    const run = calm({});
    const base = strike(run);
    run.evCount = 0;
    killElite(run);
    expect(strike(run)).toBe(base);
    expect(count(run, EV.hunt)).toBe(0);
  });
});

describe('Sursis', () => {
  it('la première résurrection rend sa part, la seconde la part habituelle', () => {
    const run = calm({ firstReviveShare: 0.75 });
    run.hero.revives = 2;
    run.hero.hp = -5;
    stepRun(run, idleInput());
    expect(run.hero.hp).toBe(Math.round(run.hero.stats.maxHp * 0.75));
    run.hero.hp = -5;
    stepRun(run, idleInput());
    expect(run.hero.hp).toBe(Math.round(run.hero.stats.maxHp * data.tuning.hero.reviveHpShare));
    expect(run.hero.revives).toBe(0);
  });
});

describe('sans Lanterne', () => {
  const played = (run: Run): number => hashRun(simulate(run, { bot: activeBot, maxSteps: 5 * 60 * 60 }));

  it('la partie est celle d\'avant le chantier', () => {
    expect([1, 2, 3].map((seed) => played(makeRun(seed)))).toEqual([2407973403, 1708471973, 3692207033]);
  }, 60_000);

  it('des modificateurs neutres ne changent rien', () => {
    expect(played(makeModRun({}, 1))).toBe(2407973403);
  }, 60_000);

  it('le tutoriel est toujours neutre', () => {
    expect(makeTutorial().mods).toEqual(NEUTRAL_MODS);
  });
});
