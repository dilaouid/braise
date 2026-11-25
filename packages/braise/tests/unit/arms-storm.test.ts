import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/core/combat.ts';
import { ST_SHOCK, type Run } from '../../src/core/types.ts';
import { armed, crawler, hold, lost } from './arms-helpers.ts';

/** Un Rampant à cet endroit, par rapport à Moon. */
function at(run: Run, x: number, y = 0, hp = 1e6): number {
  const i = spawnEnemy(run, crawler, run.hero.x + x, run.hero.y + y, 1);
  run.enemies.hp[i] = hp;
  run.enemies.maxHp[i] = hp;
  return i;
}

describe('Guet d\'orage', () => {
  it('ne frappe que dans le noir : le plus proche hors de la lumière', () => {
    const run = armed('weapon.storm-watch');
    const lit = at(run, 60);
    const dark = at(run, 0, 100);
    const far = at(run, 0, -175);
    hold(run, 1);
    expect(lost(run, lit)).toBe(0);
    expect(lost(run, dark)).toBe(11);
    expect(lost(run, far)).toBe(0);
  });

  it('une petite lumière rend des cibles au noir', () => {
    const run = armed('weapon.storm-watch');
    const i = at(run, 60);
    run.hero.stats.glow = 10;
    hold(run, 1);
    expect(lost(run, i)).toBe(11);
  });

  it('portée de 180 px', () => {
    const run = armed('weapon.storm-watch');
    const i = at(run, 195);
    hold(run, 1);
    expect(lost(run, i)).toBe(0);
  });

  it('sans cible, l\'arme reste prête : elle frappe dès qu\'il y en a une', () => {
    const run = armed('weapon.storm-watch');
    hold(run, 300);
    const i = at(run, 100);
    hold(run, 8);
    expect(lost(run, i)).toBe(11);
  });

  it('saute à 80 px, trois fois au niveau 1, sans jamais revenir', () => {
    const run = armed('weapon.storm-watch');
    const line = [100, 170, 240, 310, 380].map((x) => at(run, x));
    hold(run, 1);
    expect(line.map((i) => lost(run, i))).toEqual([11, 11, 11, 11, 0]);
  });

  it('ne saute pas au-delà de la distance de saut', () => {
    const run = armed('weapon.storm-watch');
    const first = at(run, 100);
    const next = at(run, 190);
    hold(run, 1);
    expect(lost(run, first)).toBe(11);
    expect(lost(run, next)).toBe(0);
  });

  it('un projectile de plus donne un saut de plus, pas un éclair de plus', () => {
    const run = armed('weapon.storm-watch');
    run.hero.stats.projectiles = 1;
    const line = [100, 170, 240, 310, 380].map((x) => at(run, x));
    const apart = at(run, 0, 150);
    hold(run, 1);
    expect(line.map((i) => lost(run, i))).toEqual([11, 11, 11, 11, 11]);
    expect(lost(run, apart)).toBe(0);
  });

  it('recharge : un éclair toutes les 1,8 s', () => {
    const run = armed('weapon.storm-watch');
    const i = at(run, 100);
    hold(run, 100);
    expect(lost(run, i)).toBe(11);
    hold(run, 12);
    expect(lost(run, i)).toBe(22);
  });

  it('une cible tuée au passage n\'arrête pas la chaîne', () => {
    const run = armed('weapon.storm-watch');
    at(run, 100, 0, 1);
    const next = at(run, 170);
    hold(run, 1);
    expect(lost(run, next)).toBe(11);
  });

  it('une cible déjà morte n\'est pas visée', () => {
    const run = armed('weapon.storm-watch');
    const dead = at(run, 100);
    run.enemies.hp[dead] = 0;
    const alive = at(run, 0, 150);
    hold(run, 1);
    expect(lost(run, alive)).toBe(11);
  });

  it('un boss en poussière n\'est pas visé', () => {
    const run = armed('weapon.storm-watch');
    const boss = at(run, 100);
    run.director.bossUid = run.enemies.uid[boss]!;
    run.director.bossReformT = 3;
    const alive = at(run, 0, 150);
    hold(run, 1);
    expect(lost(run, boss)).toBe(0);
    expect(lost(run, alive)).toBe(11);
  });

  it('n\'entre pas dans la lumière en sautant', () => {
    const run = armed('weapon.storm-watch');
    at(run, 100);
    const lit = at(run, 60);
    hold(run, 1);
    expect(lost(run, lit)).toBe(0);
  });

  it('applique Choc au niveau 5, pas au niveau 4', () => {
    for (const [level, want] of [[4, 0], [5, ST_SHOCK]] as const) {
      const run = armed('weapon.storm-watch', level);
      const i = at(run, 100);
      hold(run, 1);
      expect(run.enemies.status[i]! & ST_SHOCK, `niveau ${level}`).toBe(want);
    }
  });

  it('deux éclairs au niveau 6, sur deux cibles différentes', () => {
    const run = armed('weapon.storm-watch', 6);
    const a = at(run, 100);
    const b = at(run, -150);
    hold(run, 1);
    expect(lost(run, a)).toBe(15);
    expect(lost(run, b)).toBe(15);
  });

  it('le second éclair ne vise pas un mort : il cherche une autre cible', () => {
    const run = armed('weapon.storm-watch', 6);
    at(run, 100, 0, 1);
    at(run, 160, 0, 1);
    const alive = at(run, -175);
    hold(run, 1);
    expect(lost(run, alive)).toBe(15);
  });

  it('avec une seule cible, deux éclairs n\'en frappent qu\'un', () => {
    const run = armed('weapon.storm-watch', 6);
    const a = at(run, 100);
    hold(run, 1);
    expect(lost(run, a)).toBe(15);
  });

  it('Orage noir : la première cible est dans le noir, les sauts entrent dans la lumière', () => {
    const run = armed('weapon.black-storm');
    const dark = at(run, 100);
    const lit = at(run, 60);
    hold(run, 1);
    expect(lost(run, dark)).toBe(17);
    expect(lost(run, lit)).toBe(17);
    const alone = armed('weapon.black-storm');
    const only = at(alone, 60);
    hold(alone, 1);
    expect(lost(alone, only)).toBe(0);
  });
});
