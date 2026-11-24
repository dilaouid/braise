import { loadGameData, type GameData, type TutorialStep } from '../../src/content/index.ts';
import { recomputeStats } from '../../src/core/levelup.ts';
import { createRun } from '../../src/core/run.ts';
import { createTutorialRun } from '../../src/core/tutorial-run.ts';
import type { Run } from '../../src/core/types.ts';
import { buildSheet, unlockedContent } from '../../src/meta/hero.ts';
import { newHero, newSave, type Save } from '../../src/meta/save.ts';

export const data: GameData = loadGameData();
export const CLASS = 'class.ash-blade';
export const REGION = 'region.ash-woods';

/** Une sauvegarde de test, avec un héros au niveau voulu. */
export function makeSave(heroLevel = 1): Save {
  const save = newSave(0);
  const hero = newHero();
  hero.level = heroLevel;
  save.heroes[CLASS] = hero;
  save.activeHero = CLASS;
  return save;
}

/** Rend le héros d'une expédition de test increvable, même après une relique. */
export function makeImmortal(run: Run): void {
  run.cfg.sheet.maxHp = 1e7;
  recomputeStats(run);
  run.hero.hp = run.hero.stats.maxHp;
}

/** Une expédition de test. */
export function makeRun(seed = 1234, save: Save = makeSave(), autoSkills = false): Run {
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  return createRun(data, {
    seed, regionId: REGION, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills,
  });
}

/**
 * Une partie de tutoriel de test. Sans `steps`, le script est vide : seules la carte et les règles jouent.
 * Avec `steps: 'content'`, c'est le script livré.
 */
export function makeTutorial(seed = 7, steps: TutorialStep[] | 'content' = []): Run {
  const save = makeSave();
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  const run = createTutorialRun(data, {
    seed, regionId: REGION, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false,
  });
  if (steps !== 'content') {
    run.tutorial!.def = { ...run.tutorial!.def, steps };
    run.tutorial!.played = new Uint8Array(steps.length);
  }
  return run;
}

/** Un repère de la carte du tutoriel, en pixels. */
export function tutoMarker(name: string): { x: number; y: number } {
  const p = data.tutorial.markers[name];
  if (!p) throw new Error(`Repère inconnu : ${name}`);
  return p;
}
