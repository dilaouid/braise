import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/core/combat.ts';
import { litRadius } from '../../src/core/light.ts';
import { ST_FROZEN, ST_SLOW } from '../../src/core/types.ts';
import { armed, crawler, hold, lost } from './arms-helpers.ts';

describe('Lisière', () => {
  it('un Éteint sur le bord prend 5 dégâts et du Gel', () => {
    const run = armed('weapon.verge');
    const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run), run.hero.y, 1e6);
    hold(run, 1);
    expect(lost(run, i)).toBe(5);
    expect(run.enemies.status[i]! & ST_SLOW).toBeTruthy();
  });

  it('ni l\'Éteint au milieu de la lumière, ni celui qui est loin dehors', () => {
    const run = armed('weapon.verge');
    const inside = spawnEnemy(run, crawler, run.hero.x + litRadius(run) - 30, run.hero.y, 1e6);
    const outside = spawnEnemy(run, crawler, run.hero.x - litRadius(run) - 30, run.hero.y, 1e6);
    hold(run, 2);
    expect(lost(run, inside)).toBe(0);
    expect(lost(run, outside)).toBe(0);
  });

  it('la bande s\'ajoute au corps : touché à 12 px du bord, pas à 13', () => {
    // Moitié de la bande (5) plus le rayon d'un Rampant (7).
    for (const [offset, dmg] of [[11.5, 5], [12.5, 0], [-11.5, 5], [-12.5, 0]] as const) {
      const run = armed('weapon.verge');
      const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run) + offset, run.hero.y, 1e6);
      hold(run, 1);
      expect(lost(run, i), `à ${offset} px`).toBe(dmg);
    }
  });

  it('pas de second coup avant 2,2 s, et la Cadence n\'y change rien', () => {
    const run = armed('weapon.verge');
    run.hero.stats.cadence = 3;
    const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run), run.hero.y, 1e6);
    hold(run, 125);
    expect(lost(run, i)).toBe(5);
    hold(run, 10);
    expect(lost(run, i)).toBe(10);
  });

  it('gardé sur le bord, un Éteint finit figé', () => {
    const run = armed('weapon.verge', 4);
    const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run), run.hero.y, 1e6);
    hold(run, 60 * 3.5 + 10);
    expect(run.enemies.status[i]! & ST_FROZEN).toBeTruthy();
  });

  it('mord plus fort quand la Lueur manque, jamais moins quand elle déborde', () => {
    for (const [glow, dmg] of [[1, 5], [0.4, 7], [1.5, 5], [0.2, 8]] as const) {
      const run = armed('weapon.verge');
      run.hero.stats.glow = run.data.tuning.hero.glow * glow;
      const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run), run.hero.y, 1e6);
      hold(run, 1);
      expect(lost(run, i), `à ${glow}`).toBe(dmg);
    }
  });

  it('la Zone élargit la bande', () => {
    const run = armed('weapon.verge');
    run.hero.stats.zone = 1;
    const i = spawnEnemy(run, crawler, run.hero.x + litRadius(run) + 16, run.hero.y, 1e6);
    hold(run, 1);
    expect(lost(run, i)).toBe(5);
  });

  it('Solstice coupe aussi à mi-rayon, avec le même intervalle', () => {
    const run = armed('weapon.solstice');
    const r = litRadius(run);
    const outer = spawnEnemy(run, crawler, run.hero.x + r, run.hero.y, 1e6);
    const inner = spawnEnemy(run, crawler, run.hero.x - r / 2, run.hero.y, 1e6);
    hold(run, 1);
    expect(lost(run, outer)).toBe(14);
    expect(lost(run, inner)).toBe(14);
    hold(run, 80);
    expect(lost(run, inner)).toBe(14);
  });

  it('Solstice à très petite lumière : un seul coup pour un Éteint sur les deux bords', () => {
    const run = armed('weapon.solstice');
    run.hero.stats.glow = 0;
    const i = spawnEnemy(run, crawler, run.hero.x + 18, run.hero.y, 1e6);
    hold(run, 1);
    expect(lost(run, i)).toBe(Math.round(14 * 1.8));
  });
});
