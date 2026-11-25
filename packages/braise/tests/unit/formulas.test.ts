import { describe, expect, it } from 'vitest';
import { damageTaken, effectiveCooldown, enemyDamageScale, enemyHpScale, resolveStats, runXpForNext, threatPerSecond } from '../../src/core/stats.ts';
import { buildSheet } from '../../src/meta/hero.ts';
import { CLASS, data, makeSave } from './helpers.ts';

const t = data.tuning;

describe('formules de l\'expédition (document 02 §11)', () => {
  it('expérience de partie par niveau', () => {
    expect(runXpForNext(1, t.xp)).toBe(8);
    expect(runXpForNext(10, t.xp)).toBe(139);
    expect(runXpForNext(20, t.xp)).toBe(465);
  });

  it('expérience cumulée : repères du document 12 §1', () => {
    const cumulative = (level: number): number => {
      let total = 0;
      for (let l = 1; l < level; l++) total += runXpForNext(l, t.xp);
      return total;
    };
    expect(cumulative(5)).toBe(82);
    expect(cumulative(10)).toBe(483);
    expect(cumulative(20)).toBe(3184);
    expect(cumulative(30)).toBe(10000);
  });

  it('échelle des ennemis', () => {
    expect(enemyHpScale(t.scale, 0, 0, 0)).toBe(1);
    expect(enemyHpScale(t.scale, 15, 0, 0)).toBeCloseTo(5.5, 5);
    expect(enemyHpScale(t.scale, 15, 2, 0)).toBeCloseTo(14.08, 2);
    expect(enemyHpScale(t.scale, 15, 0, 20)).toBeCloseTo(25.6, 1);
    expect(enemyDamageScale(t.scale, 15, 0, 0)).toBeCloseTo(1.6, 5);
  });

  it('budget de menace', () => {
    expect(threatPerSecond(t.threat, 0, 0, 0)).toBeCloseTo(1.2, 5);
    expect(threatPerSecond(t.threat, 15, 0, 0)).toBeCloseTo(14.7, 5);
  });

  it('dégâts subis : réduction d\'armure plafonnée à 75 %, minimum 1', () => {
    expect(damageTaken(10, 0, 0.75)).toBe(10);
    expect(damageTaken(10, 100, 0.75)).toBe(5);
    expect(damageTaken(100, 100000, 0.75)).toBe(25);
    expect(damageTaken(1, 500, 0.75)).toBe(1);
  });

  it('rechargement effectif : plancher à 25 % de la base', () => {
    expect(effectiveCooldown(2, 0)).toBe(2);
    expect(effectiveCooldown(2, 1)).toBe(1);
    expect(effectiveCooldown(2, 100)).toBe(0.5);
  });
});

describe('statistiques du héros (documents 03 et 12 §6)', () => {
  it('Lame-Cendre au niveau 1 : 98 points de vie, 90,9 px/s', () => {
    const { sheet } = buildSheet(data, makeSave(1), CLASS);
    const s = resolveStats(sheet, t, data.heroTuning);
    expect(s.maxHp).toBe(98);
    expect(s.regen).toBeCloseTo(0.18, 5);
    expect(s.armor).toBeCloseTo(1.8, 5);
    expect(s.speed).toBeCloseTo(90 * 1.01, 5);
    expect(s.critChance).toBeCloseTo(0.05 + 0.005 + 0.002, 5);
    expect(s.glow).toBe(40);
    expect(s.cards).toBe(3);
    expect(s.flasks).toBe(2);
  });

  it('les boosts de l\'Autel s\'ajoutent, et un boost désactivé n\'a aucun effet', () => {
    const save = makeSave(1);
    save.account.altar = { 'altar.ardor': 4, 'altar.endurance': 2, 'altar.glow': 5 };
    let s = resolveStats(buildSheet(data, save, CLASS).sheet, t, data.heroTuning);
    expect(s.power).toBeCloseTo(0.12, 5);
    expect(s.maxHp).toBe(Math.round(98 * 1.1));
    expect(s.glow).toBeCloseTo(40 * 1.4, 5);
    save.account.altarDisabled = ['altar.ardor', 'altar.endurance', 'altar.glow'];
    s = resolveStats(buildSheet(data, save, CLASS).sheet, t, data.heroTuning);
    expect(s.power).toBe(0);
    expect(s.maxHp).toBe(98);
    expect(s.glow).toBe(40);
  });

  it('la vitesse venue de l\'Agilité est plafonnée à +30 %', () => {
    const { sheet } = buildSheet(data, makeSave(1), CLASS);
    sheet.attrs.agi = 1000;
    const s = resolveStats(sheet, t, data.heroTuning);
    expect(s.speed).toBeCloseTo(90 * 1.3, 5);
    sheet.speedShare = 5;
    expect(resolveStats(sheet, t, data.heroTuning).speed).toBeCloseTo(90 * 1.8, 5);
  });
});
