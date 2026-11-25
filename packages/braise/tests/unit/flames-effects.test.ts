import { describe, expect, it } from 'vitest';
import type { RunModsRaw } from '../../src/content/index.ts';
import { addPickup, spawnEnemy } from '../../src/core/combat.ts';
import { litRadius, takeFlame } from '../../src/core/flames.ts';
import { recomputeStats } from '../../src/core/levelup.ts';
import { dashChargesMax, dashCooldown, idleInput, stepRun } from '../../src/core/run.ts';
import { EV, PK_GEM, ST_BURN, STEP, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeModRun, makeRun, makeTutorial } from './helpers.ts';

const CRAWLER = data.enemies.findIndex((e) => e.id === 'enemy.crawler');
const DASH = data.tuning.dash;

/** Une partie calme : pas d'ennemi au départ, un héros increvable et sans arme. */
function calm(mods: RunModsRaw): Run {
  const run = makeModRun(mods);
  makeImmortal(run);
  run.enemies.count = 0;
  run.weapons.length = 0;
  return run;
}

function line(id: string): number {
  return data.flames.lines.findIndex((l) => l.id === id);
}

/** Avance de `seconds`, la ruée pressée ou non ; renvoie le nombre de ruées parties. Sans horde si `empty`. */
function play(run: Run, seconds: number, dash = false, empty = false): number {
  const input = idleInput();
  input.dash = dash;
  let dashes = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    stepRun(run, input);
    for (let k = 0; k < run.evCount; k++) if (run.evType[k] === EV.heroDash) dashes++;
    run.evCount = 0;
    if (empty) run.enemies.count = 0;
  }
  return dashes;
}

/** L'indice d'un ennemi d'après son numéro, ou -1 s'il est mort. */
function byUid(run: Run, uid: number): number {
  for (let i = 0; i < run.enemies.count; i++) if (run.enemies.uid[i] === uid) return i;
  return -1;
}

function sturdy(run: Run, dx: number, dy: number): number {
  const i = spawnEnemy(run, CRAWLER, run.hero.x + dx, run.hero.y + dy, 1e6);
  return run.enemies.uid[i]!;
}

describe('charges de ruée', () => {
  it('sans Flamme : une charge, et la recharge habituelle', () => {
    const run = calm({});
    expect(dashChargesMax(run)).toBe(1);
    expect(play(run, 1, true, true)).toBe(1);
    expect(run.hero.dashCharges).toBe(0);
    expect(play(run, DASH.cooldown, true, true)).toBe(1);
  });

  it('un code qui remet la recharge à zéro rend la ruée, comme avant', () => {
    const run = calm({});
    expect(play(run, 0.5, true, true)).toBe(1);
    run.hero.dashCd = 0;
    expect(play(run, 0.1, true, true)).toBe(1);
  });

  it('+1 charge : deux ruées de suite, pas trois', () => {
    const run = calm({ dashCharges: 1 });
    expect(dashChargesMax(run)).toBe(2);
    expect(run.hero.dashCharges).toBe(2);
    expect(play(run, 1, true, true)).toBe(2);
    expect(run.hero.dashCharges).toBe(0);
  });

  it('les charges reviennent une à une, jamais au-delà du maximum', () => {
    const run = calm({ dashCharges: 1 });
    play(run, 0.5, true, true);
    expect(run.hero.dashCharges).toBe(0);
    play(run, DASH.cooldown - 0.5 + 0.1, false, true);
    expect(run.hero.dashCharges).toBe(1);
    play(run, DASH.cooldown, false, true);
    expect(run.hero.dashCharges).toBe(2);
    play(run, DASH.cooldown * 3, false, true);
    expect(run.hero.dashCharges).toBe(2);
    expect(run.hero.dashCd).toBe(0);
  });

  it('avec Ruée ardente, une charge met une fois et demie plus longtemps à revenir', () => {
    const run = calm({ dashCharges: 1, dashCooldownMult: 1.5 });
    expect(dashCooldown(run)).toBeCloseTo(DASH.cooldown * 1.5, 6);
    play(run, 0.5, true, true);
    play(run, DASH.cooldown, false, true);
    expect(run.hero.dashCharges).toBe(0);
    play(run, DASH.cooldown * 0.5 - 0.5 + 0.1, false, true);
    expect(run.hero.dashCharges).toBe(1);
  });

  it('une charge gagnée en cours de partie arrive prête', () => {
    const run = makeRun();
    run.cfg.flameRarity = 4;
    run.phase = 'totem';
    run.totemOffers = [{ line: line('flame.surge'), base: 1, rarity: 2, gift: false }];
    expect(takeFlame(run, 0)).toBe(true);
    expect(dashChargesMax(run)).toBe(2);
    expect(run.hero.dashCharges).toBe(2);
  });
});

describe('traînée de braises', () => {
  it('la ruée laisse des braises qui blessent ce qui les traverse', () => {
    const run = calm({ dashTrail: 6 });
    const uid = sturdy(run, 0, 60);
    const hp = run.enemies.hp[byUid(run, uid)]!;
    play(run, 0.3, true);
    expect(run.zones.count).toBeGreaterThanOrEqual(6);
    play(run, 1.5);
    expect(run.enemies.hp[byUid(run, uid)]!).toBeLessThan(hp);
  });

  it('les braises s\'éteignent après deux secondes', () => {
    const run = calm({ dashTrail: 6 });
    play(run, 0.3, true, true);
    expect(run.zones.count).toBeGreaterThan(0);
    play(run, 2.2, false, true);
    expect(run.zones.count).toBe(0);
  });

  it('sans la Flamme, la ruée ne laisse rien', () => {
    const run = calm({});
    play(run, 0.3, true, true);
    expect(run.zones.count).toBe(0);
  });
});

describe('halo', () => {
  it('le rayon éclairé vaut la Lueur plus la marge du disque', () => {
    const run = makeRun();
    expect(litRadius(run)).toBeCloseTo(64, 6);
    run.cfg.sheet.glowShare = -0.8;
    recomputeStats(run);
    expect(litRadius(run)).toBeCloseTo(32, 6);
  });

  it('brûle les Éteints dans la lumière, pas ceux du dehors', () => {
    const run = calm({ haloBurn: 3 });
    const near = sturdy(run, 60, 0);
    const far = sturdy(run, 220, 0);
    play(run, 0.6);
    const n = byUid(run, near);
    expect(run.enemies.status[n]! & ST_BURN).toBe(ST_BURN);
    expect(run.enemies.burnDmg[n]).toBe(3);
    expect(run.enemies.status[byUid(run, far)]! & ST_BURN).toBe(0);
  });

  it('une lanterne rétrécie brûle moins loin', () => {
    const run = calm({ haloBurn: 3 });
    run.cfg.sheet.glowShare = -0.8;
    recomputeStats(run);
    const uid = sturdy(run, 60, 0);
    play(run, 0.6);
    expect(run.enemies.status[byUid(run, uid)]! & ST_BURN).toBe(0);
  });

  it('sans la Flamme, rien ne brûle', () => {
    const run = calm({});
    const uid = sturdy(run, 30, 0);
    play(run, 0.6);
    expect(run.enemies.status[byUid(run, uid)]! & ST_BURN).toBe(0);
  });
});

describe('ombre', () => {
  const base = (): number => {
    const run = makeModRun({});
    recomputeStats(run);
    return run.hero.stats.critChance;
  };

  it('donne du critique pour chaque point de Lueur sous 100 %', () => {
    const run = makeModRun({ shadowCrit: 0.0025 });
    run.cfg.sheet.glowShare = -0.4;
    recomputeStats(run);
    expect(run.hero.stats.critChance - base()).toBeCloseTo(0.1, 6);
  });

  it('ne donne rien à pleine Lueur ou au-dessus', () => {
    const run = makeModRun({ shadowCrit: 0.0025 });
    run.cfg.sheet.glowShare = 0.2;
    recomputeStats(run);
    expect(run.hero.stats.critChance).toBeCloseTo(base(), 6);
  });

  it('ne dépasse pas le plafond de critique', () => {
    const run = makeModRun({ shadowCrit: 0.05 });
    run.cfg.sheet.glowShare = -0.8;
    recomputeStats(run);
    expect(run.hero.stats.critChance).toBe(data.tuning.hero.critCap);
  });
});

describe('rappel', () => {
  /** Une gemme lointaine, reconnue à sa valeur : assez petite pour ne pas faire monter de niveau. */
  function farGem(run: Run, value: number): void {
    addPickup(run, PK_GEM, run.hero.x + 500, run.hero.y, value);
  }
  /** 0 : au sol, immobile ; 1 : attirée ou déjà ramassée. */
  function pulled(run: Run, value: number): number {
    const p = run.pickups;
    for (let i = 0; i < p.count; i++) if (p.value[i] === value) return p.attracted[i]!;
    return 1;
  }

  it('toutes les 40 s, les gemmes de la carte volent vers le héros', () => {
    const run = calm({ recallEvery: 40 });
    farGem(run, 0.25);
    play(run, 39.9, false, true);
    expect(pulled(run, 0.25)).toBe(0);
    play(run, 0.2, false, true);
    expect(pulled(run, 0.25)).toBe(1);
    farGem(run, 0.5);
    play(run, 39.7, false, true);
    expect(pulled(run, 0.5)).toBe(0);
    play(run, 0.3, false, true);
    expect(pulled(run, 0.5)).toBe(1);
  });

  it('sans la Flamme, une gemme lointaine reste où elle est', () => {
    const run = calm({});
    farGem(run, 0.25);
    play(run, 45, false, true);
    expect(pulled(run, 0.25)).toBe(0);
  });
});

describe('élites appelés par l\'Appât', () => {
  function elites(run: Run): number {
    let n = 0;
    for (let k = 0; k < run.evCount; k++) if (run.evType[k] === EV.eliteSpawn) n++;
    return n;
  }
  function take(run: Run, rarity: number): boolean {
    run.cfg.flameRarity = 4;
    run.phase = 'totem';
    run.totemOffers = [{ line: line('flame.bait'), base: 0, rarity, gift: false }];
    run.evCount = 0;
    return takeFlame(run, 0);
  }

  it('Épique : un élite surgit ; Légendaire : deux', () => {
    const a = makeRun(5);
    expect(take(a, 2)).toBe(true);
    expect(elites(a)).toBe(1);
    const b = makeRun(5);
    expect(take(b, 3)).toBe(true);
    expect(elites(b)).toBe(2);
    expect(b.enemies.count).toBeGreaterThanOrEqual(2);
  });

  it('Commune : aucun élite', () => {
    const run = makeRun(5);
    expect(take(run, 0)).toBe(true);
    expect(elites(run)).toBe(0);
  });

  it('pendant le boss, la Flamme est prise sans élite', () => {
    const run = makeRun(5);
    run.director.bossSpawned = true;
    expect(take(run, 3)).toBe(true);
    expect(elites(run)).toBe(0);
    expect(run.flames.length).toBe(1);
  });

  it('dans le tutoriel, la Flamme est prise sans élite', () => {
    const run = makeTutorial();
    expect(take(run, 3)).toBe(true);
    expect(elites(run)).toBe(0);
    expect(run.flames.length).toBe(1);
  });
});
