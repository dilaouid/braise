import { describe, expect, it } from 'vitest';
import { hashRun } from '../../src/core/bots.ts';
import { simulateTutorial } from '../../src/core/tutorial-bot.ts';
import { data, makeTutorial } from './helpers.ts';

describe('robot de tutoriel', () => {
  it('finit le tutoriel livré sur 5 graines, en mourant deux fois au plus', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = makeTutorial(seed, 'content');
      const res = simulateTutorial(run, 600);
      expect(res.done, `graine ${seed} : arrêté à l'étape ${run.tutorial!.step}`).toBe(true);
      expect(res.deaths, `graine ${seed}`).toBeLessThanOrEqual(2);
      // Toutes les leçons ont été faites, aucune n'a été passée par une issue de secours.
      const n = run.tutorial!.notes;
      expect(n.dash).toBeGreaterThan(0);
      expect(n.card).toBeGreaterThan(0);
      expect(n.find).toBe(1);
      expect(n.buy).toBe(1);
      expect(n.boon).toBe(1);
      expect(n.boss).toBe(1);
      expect(run.finds).toEqual([data.tutorial.find]);
    }
  }, 120_000);

  // Le robot marche droit au but et ne lit rien : un joueur met deux à trois fois plus de temps.
  it('le robot met 1 min 30 à 4 min hors dialogues, dont 30 à 90 secondes face au Guetteur', () => {
    let total = 0;
    let boss = 0;
    const seeds = [11, 12, 13, 14, 15, 16];
    for (const seed of seeds) {
      const res = simulateTutorial(makeTutorial(seed, 'content'), 600);
      expect(res.done).toBe(true);
      total += res.seconds;
      boss += res.bossSeconds;
    }
    const mean = total / seeds.length;
    const bossMean = boss / seeds.length;
    expect(mean).toBeGreaterThan(90);
    expect(mean).toBeLessThan(240);
    expect(bossMean).toBeGreaterThan(30);
    expect(bossMean).toBeLessThan(90);
  }, 120_000);

  it('deux fois la même graine, même empreinte', () => {
    const play = (): number => {
      const run = makeTutorial(9, 'content');
      simulateTutorial(run, 600);
      return hashRun(run);
    };
    expect(play()).toBe(play());
  }, 120_000);
});
