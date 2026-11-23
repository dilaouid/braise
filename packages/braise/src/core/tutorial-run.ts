import type { GameData } from '../content/index.ts';
import { createRun } from './run.ts';
import { buildTutorialMap, newTutorialState, tutorialRegion } from './tutorial.ts';
import type { Run, RunConfig } from './types.ts';

/**
 * Crée la partie du tutoriel : une expédition normale sur la carte fixe de `content/tutorial.json`,
 * sans horde, pilotée par le script. `cfg.regionId` donne la région dont le tutoriel reprend les ennemis.
 */
export function createTutorialRun(data: GameData, cfg: RunConfig): Run {
  const base = data.regions[cfg.regionId];
  if (!base) throw new Error(`Région inconnue : ${cfg.regionId}`);
  const def = data.tutorial;
  const run = createRun(data, cfg, {
    map: buildTutorialMap(def, data.tuning.tileSize),
    region: tutorialRegion(data, base),
    startX: def.start.x,
    startY: def.start.y,
  });
  run.tutorial = newTutorialState(def);
  // Le trésor du tutoriel donne toujours la même trouvaille.
  run.findPool = [def.find];
  return run;
}
