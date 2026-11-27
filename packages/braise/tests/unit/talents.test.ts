import { describe, expect, it } from 'vitest';
import { hurtEnemy, spawnEnemy } from '../../src/core/combat.ts';
import { glowNow } from '../../src/core/light.ts';
import { grantDodge, updateMarsh } from '../../src/core/marsh.ts';
import { NEUTRAL_MODS, stackMods } from '../../src/core/mods.ts';
import { createRun, dashCooldown, idleInput, stepRun } from '../../src/core/run.ts';
import { STEP } from '../../src/core/types.ts';
import { buildSheet, runMods } from '../../src/meta/hero.ts';
import {
  addTalent, canAddTalent, canRemoveTalent, removeTalent, resetTalents, resolveTalents, talentPointsEarned, talentPointsLeft,
  talentPointsSpent, talentRank,
} from '../../src/meta/talents.ts';
import type { Save } from '../../src/meta/save.ts';
import { CLASS, data, makeImmortal, makeModRun, makeRun, makeSave } from './helpers.ts';

const cls = data.classes[CLASS]!;
const tuning = data.heroTuning;
const hero = (save: Save) => save.heroes[CLASS]!;

/** Place `n` points dans ce nœud, ou échoue. */
function put(save: Save, id: string, n = 1): void {
  for (let k = 0; k < n; k++) expect(addTalent(cls, hero(save), tuning, id), `${id} point ${k + 1}`).toBe(true);
}

/** Une partie lancée avec les talents de cette sauvegarde, comme le fait le jeu. */
function runWith(save: Save) {
  const base = makeRun(1234, save);
  return createRun(data, { ...base.cfg, mods: runMods(data, save, CLASS, { ...NEUTRAL_MODS }) });
}

describe("l'arbre de Moon : le contenu", () => {
  it('3 branches de 6 nœuds, 66 points pour tout prendre', () => {
    expect(cls.tree.branches).toEqual(['rampart', 'stride', 'glow']);
    expect(cls.tree.nodes).toHaveLength(18);
    expect(cls.tree.nodes.reduce((s, n) => s + n.ranks, 0)).toBe(66);
  });

  it('un point de talent par niveau à partir du niveau 2', () => {
    expect(talentPointsEarned(1, tuning)).toBe(0);
    expect(talentPointsEarned(12, tuning)).toBe(11);
    expect(talentPointsEarned(60, tuning)).toBe(59);
  });
});

describe("l'arbre de Moon : les règles", () => {
  it('sans point, rien ne se place', () => {
    const save = makeSave(1);
    expect(canAddTalent(cls, hero(save), tuning, 'talent.thick-hide')).toBe('points');
  });

  it("l'étage 2 s'ouvre à 5 points dans la branche, pas avec des points ailleurs", () => {
    const save = makeSave(30);
    put(save, 'talent.great-fire', 5);
    expect(canAddTalent(cls, hero(save), tuning, 'talent.spare-flask')).toBe('locked');
    put(save, 'talent.thick-hide', 4);
    expect(canAddTalent(cls, hero(save), tuning, 'talent.spare-flask')).toBe('locked');
    put(save, 'talent.steady-foot');
    expect(canAddTalent(cls, hero(save), tuning, 'talent.spare-flask')).toBeNull();
  });

  it('un nœud plein refuse un point de plus', () => {
    const save = makeSave(30);
    put(save, 'talent.thick-hide', 5);
    expect(canAddTalent(cls, hero(save), tuning, 'talent.thick-hide')).toBe('max');
  });

  it("retirer un point qui fermerait un étage occupé est refusé", () => {
    const save = makeSave(30);
    put(save, 'talent.thick-hide', 5);
    put(save, 'talent.spare-flask');
    expect(canRemoveTalent(cls, hero(save), tuning, 'talent.thick-hide')).toBe('holds');
    expect(removeTalent(cls, hero(save), tuning, 'talent.spare-flask')).toBe(true);
    expect(removeTalent(cls, hero(save), tuning, 'talent.thick-hide')).toBe(true);
    expect(talentRank(cls, hero(save), 'talent.thick-hide')).toBe(4);
  });

  it('la remise à zéro rend exactement les points placés', () => {
    const save = makeSave(20);
    put(save, 'talent.supple', 5);
    put(save, 'talent.second-dash', 2);
    expect(resetTalents(cls, hero(save))).toBe(7);
    expect(talentPointsLeft(cls, hero(save), tuning)).toBe(19);
  });

  it("une sauvegarde abîmée (nœud inconnu, rang trop haut) ne compte que ce que l'arbre connaît", () => {
    const save = makeSave(5);
    hero(save).talents = { 'talent.gone': 3, 'talent.thick-hide': 99 };
    expect(talentRank(cls, hero(save), 'talent.thick-hide')).toBe(5);
    expect(talentPointsSpent(cls, hero(save))).toBe(5);
    expect(talentPointsLeft(cls, hero(save), tuning)).toBe(-1);
    expect(() => buildSheet(data, save, CLASS)).not.toThrow();
  });
});

describe("l'arbre de Moon : les effets", () => {
  it('Cuir épais : +4 % de points de vie par rang', () => {
    const save = makeSave(10);
    const before = makeRun(1, save).hero.stats.maxHp;
    put(save, 'talent.thick-hide', 3);
    expect(makeRun(1, save).hero.stats.maxHp).toBe(Math.round((before) * 1.12));
  });

  it('Fiole de plus : une fiole, puis des fioles plus fortes, puis encore une', () => {
    const save = makeSave(10);
    const base = makeRun(1, save).hero.stats.flasks;
    put(save, 'talent.thick-hide', 5);
    put(save, 'talent.spare-flask', 2);
    const run = runWith(save);
    expect(run.hero.stats.flasks).toBe(base + 1);
    expect(run.mods.flaskHealMult).toBeCloseTo(1.1, 5);
    put(save, 'talent.spare-flask');
    expect(runWith(save).hero.stats.flasks).toBe(base + 2);
  });

  it('Second souffle : une fiole se remplit seule après 90 s', () => {
    const run = makeModRun({ flaskRefillEvery: 90 });
    makeImmortal(run);
    run.hero.flasks = 0;
    for (let t = 0; t < 89 / STEP; t++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.hero.flasks).toBe(0);
    for (let t = 0; t < 2 / STEP; t++) {
      run.enemies.count = 0;
      stepRun(run, idleInput());
    }
    expect(run.hero.flasks).toBe(1);
  });

  it('Dernier rempart : un coup mortel laisse 1 PV, une seule fois, avant les résurrections', () => {
    const run = makeModRun({ lastStand: true });
    run.hero.revives = 1;
    run.hero.hp = -5;
    run.enemies.count = 0;
    stepRun(run, idleInput());
    expect(run.phase).toBe('playing');
    expect(run.hero.hp).toBe(1);
    expect(run.hero.revives).toBe(1);
    expect(run.lastStandUsed).toBe(true);
  });

  it('Second élan : deux charges, et la recharge raccourcie de 0,3 s par rang suivant', () => {
    const save = makeSave(20);
    put(save, 'talent.supple', 5);
    const before = dashCooldown(runWith(save));
    put(save, 'talent.second-dash', 3);
    const run = runWith(save);
    expect(run.hero.dashCharges).toBe(2);
    expect(dashCooldown(run)).toBeCloseTo(before - 0.6, 5);
  });

  it("Élan long et Insaisissable : l'esquive juste dure plus et recharge toute la ruée", () => {
    const run = makeModRun({ dodgeExtra: 1.2, dodgeRefill: true, dashCharges: 1 });
    run.hero.dashT = 0.1;
    run.hero.dashCharges = 0;
    run.hero.dashCd = 2;
    grantDodge(run);
    expect(run.hero.dodgeT).toBeCloseTo(data.tuning.dodge.duration + 1.2, 5);
    expect(run.hero.dashCharges).toBe(2);
    expect(run.hero.dashCd).toBe(0);
  });

  it('Feinte : chaque coup critique pendant la Feinte quand la chance dépasse 100 %', () => {
    const run = makeModRun({ dashCrit: 2 });
    run.hero.stats.critChance = 0;
    run.hero.stats.power = 0;
    const kind = data.enemies.findIndex((e) => e.id === 'enemy.crawler');
    const i = spawnEnemy(run, kind, run.hero.x + 300, run.hero.y, 1);
    run.enemies.hp[i] = 1e6;
    run.hero.feintT = 1;
    const crit = hurtEnemy(run, i, 10, 0, null, -1);
    run.hero.feintT = 0;
    const plain = hurtEnemy(run, i, 10, 0, null, -1);
    expect(crit).toBeGreaterThan(plain);
  });

  it('Perce-brume : la brume étouffe moins, jamais au-delà de la Lueur normale', () => {
    const fog = data.regions['region.drowned-marsh']!.fog!.glowMult;
    const run = makeModRun({ fogResist: 0.5 });
    run.region = { ...run.region, fog: { glowMult: fog } };
    run.blind = 0.5;
    for (let k = 0; k < 600; k++) updateMarsh(run, STEP);
    expect(run.dim).toBeCloseTo((1 - (1 - fog) * 0.5) * (1 - 0.5 * 0.5), 2);
    expect(run.dim).toBeLessThanOrEqual(1);
  });

  it('Phare : la Lueur double pendant 4 s toutes les 20 s', () => {
    const run = makeModRun({ beaconPulse: 20 });
    const base = run.hero.stats.glow;
    run.pulseT = 10;
    expect(glowNow(run)).toBeCloseTo(base, 5);
    run.pulseT = 17;
    expect(glowNow(run)).toBeCloseTo(base * 2, 5);
  });

  it('les talents se cumulent aux modificateurs de la Lanterne au lieu de les écraser', () => {
    const lantern = stackMods({ ...NEUTRAL_MODS }, { dashCharges: 1, healMult: 0.5 });
    const save = makeSave(20);
    put(save, 'talent.thick-hide', 5);
    put(save, 'talent.supple', 5);
    put(save, 'talent.second-dash');
    put(save, 'talent.deep-draught', 5);
    const mods = runMods(data, save, CLASS, lantern);
    expect(mods.dashCharges).toBe(2);
    expect(mods.healMult).toBeCloseTo(0.5 * 1.3, 5);
    expect(resolveTalents(cls, hero(save)).mods.lastStand).toBeUndefined();
  });
});
