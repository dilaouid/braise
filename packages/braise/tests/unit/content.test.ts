import { describe, expect, it } from 'vitest';
import { RAW, compileContent, FR } from '../../src/content/index.ts';
import { altarTotalCost } from '../../src/meta/altar.ts';
import { data } from './helpers.ts';

describe('données du jeu', () => {
  it('tous les fichiers passent leur schéma et leurs références croisées', () => {
    const { errors } = compileContent();
    expect(errors).toEqual([]);
  });

  it('une référence inconnue fait échouer la validation', () => {
    const broken = structuredClone(RAW);
    (broken.weapons as Array<{ relic: string }>)[0]!.relic = 'relic.nope';
    expect(compileContent(broken).errors.length).toBeGreaterThan(0);
  });

  it('un texte manquant fait échouer la validation', () => {
    const broken = { ...RAW, fr: { ...RAW.fr } };
    delete broken.fr['weapon.scythe.name'];
    expect(compileContent(broken).errors.some((e) => e.includes('weapon.scythe.name'))).toBe(true);
  });

  it('chaque niveau d\'arme change au moins une valeur visible', () => {
    const visible = ['arc', 'range', 'strikes', 'count', 'pierce', 'speed', 'spread', 'radius', 'pause', 'impactRadius',
      'puddleRadius', 'puddleDuration', 'waves', 'stun', 'damage', 'cooldown',
      'band', 'hitInterval', 'jumps', 'shock', 'life', 'radiusShare', 'width', 'splash'] as const;
    for (const w of data.weapons) {
      for (let l = 1; l < w.levels.length; l++) {
        const a = w.levels[l - 1]!;
        const b = w.levels[l]!;
        const changed = visible.some((k) => a[k] !== b[k]);
        expect(changed, `${w.id} niveau ${l + 1}`).toBe(true);
      }
    }
  });

  it('chaque évolution est plus forte que le niveau 6 de son arme', () => {
    for (const w of data.weapons) {
      if (!w.evolved) continue;
      const base = data.weapons[w.from]!;
      expect(w.levels[0]!.damage).toBeGreaterThanOrEqual(base.levels[5]!.damage);
      expect(base.evolution).toBe(w.index);
      expect(base.relic).toBe(w.relic);
    }
  });

  it('toute attaque d\'élite ou de boss est annoncée au moins 0,7 s avant', () => {
    for (const e of data.enemies) {
      for (const tele of [e.charge?.telegraph, e.slam?.telegraph, e.roots?.telegraph, e.stomp?.telegraph, e.stalk?.telegraph, e.volley?.windup]) {
        if (tele !== undefined) expect(tele).toBeGreaterThanOrEqual(0.7);
      }
    }
  });

  it('la région a cinq ennemis de cinq familles, deux élites et un boss', () => {
    const region = data.regions['region.ash-woods']!;
    const families = new Set(region.enemyIdx.map((i) => data.enemies[i]!.family));
    expect(families.size).toBe(5);
    expect(region.eliteIdx.every((i) => data.enemies[i]!.rank === 'elite')).toBe(true);
    expect(data.enemies[region.bossIdx]!.rank).toBe('boss');
  });

  it('les totaux de l\'Autel sont ceux du document 12 §10', () => {
    const total = (id: string): number => {
      const b = data.altar.find((x) => x.id === id)!;
      return altarTotalCost(b, b.ranks);
    };
    expect(total('altar.ardor')).toBe(445);
    expect(total('altar.endurance')).toBe(445);
    expect(total('altar.glow')).toBe(126);
    expect(total('altar.wisdom')).toBe(189);
    expect(data.altar.filter((b) => b.row === 1).reduce((s, b) => s + altarTotalCost(b, b.ranks), 0)).toBe(1205);
  });

  it('aucun texte ne dépasse deux lignes de 80 caractères', () => {
    for (const [key, text] of Object.entries(FR)) expect(text.length, key).toBeLessThanOrEqual(160);
  });
});
