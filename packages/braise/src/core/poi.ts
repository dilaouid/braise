import { addPickup, healHero, spawnEnemy } from './combat.ts';
import { recomputeStats } from './levelup.ts';
import { advanceNight, callBoss } from './director.ts';
import { convergingWave, offerEvolution, updatePlace } from './places.ts';
import { emit } from './stores.ts';
import { EV, PK_ASH, PK_GOLD, type Run } from './types.ts';

function guardAlive(run: Run, uid: number): boolean {
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) if (e.uid[i] === uid && e.hp[i]! > 0) return true;
  return false;
}

/** Les événements de la carte : braséros, sources, caches, portail. */
export function updatePois(run: Run, dt: number): void {
  const hero = run.hero;
  const ev = run.data.tuning.events;
  const tile = run.map.tile;
  const discover = ev.discoverTiles * tile;
  for (let index = 0; index < run.map.pois.length; index++) {
    // Un lieu vient d'ouvrir un écran : les autres attendent le pas suivant.
    if (run.phase !== 'playing') return;
    const poi = run.map.pois[index]!;
    const dist = Math.hypot(hero.x - poi.x, hero.y - poi.y);
    if (!poi.discovered && dist < discover) poi.discovered = true;
    if (poi.state === 2) continue;
    switch (poi.kind) {
      case 'brazier': {
        const inside = dist < ev.brazier.radius;
        if (poi.state === 0) {
          if (inside) {
            poi.state = 1;
            // Dans le tutoriel, la vague vient du script : la vague habituelle naîtrait dans les murs.
            if (!run.tutorial) convergingWave(run, poi, ev.brazier.waveCount, ev.brazier.waveEnemy);
            emit(run, EV.poiStart, poi.x, poi.y, 0);
          }
        } else if (poi.state === 1) {
          // Rester dans le cercle le rallume ; en sortir fait retomber la flamme.
          if (inside) poi.progress += dt;
          else poi.progress = Math.max(0, poi.progress - dt * 0.5);
          if (poi.progress >= ev.brazier.seconds) {
            poi.state = 3;
            poi.armed = true;
            run.braziersLit++;
            // Rallumer fait avancer la Nuit : la horde, les vagues et les élites arrivent plus tôt.
            if (!run.tutorial) advanceNight(run, run.data.tuning.night.brazierJump);
            // Le braséro rembourse de la Lueur brûlée : la lanterne regrandit tout de suite.
            recomputeStats(run);
            addPickup(run, PK_ASH, poi.x - 14, poi.y + 22, run.data.tuning.ashes.brazier);
            emit(run, EV.poiDone, poi.x, poi.y, 0);
            if (inside) offerEvolution(run, poi, index);
          }
        } else if (!inside) {
          // Allumé : il propose une évolution à chaque fois que le héros revient dans le cercle.
          poi.armed = true;
        } else if (poi.armed) {
          offerEvolution(run, poi, index);
        }
        break;
      }
      case 'spring':
        if (dist < ev.spring.radius && hero.hp < hero.stats.maxHp) {
          poi.state = 2;
          healHero(run, hero.stats.maxHp);
          emit(run, EV.poiDone, poi.x, poi.y, 1);
        }
        break;
      case 'cache':
        if (poi.state === 0) {
          if (dist < ev.cache.triggerRadius) {
            const kind = run.rngSpawn.pick(run.region.eliteIdx);
            const i = spawnEnemy(run, kind, poi.x, poi.y - 30, run.hpScaleNow);
            if (i >= 0) {
              run.enemies.timer2[i] = 1.2;
              poi.guardUid = run.enemies.uid[i]!;
              emit(run, EV.eliteSpawn, poi.x, poi.y - 30, kind);
            }
            poi.state = 1;
          }
        } else if (dist < ev.cache.openRadius && !guardAlive(run, poi.guardUid)) {
          poi.state = 2;
          const gold = run.data.tuning.gold.chest;
          addPickup(run, PK_GOLD, poi.x + 10, poi.y + 14, run.rngDraw.intRange(gold[0], gold[1]));
          addPickup(run, PK_ASH, poi.x - 10, poi.y + 14, ev.cache.ashes);
          run.pendingFinds++;
          emit(run, EV.poiDone, poi.x, poi.y, 2);
        }
        break;
      case 'bell':
        if (poi.state === 0) {
          if (run.braziersLit >= run.data.tuning.night.bellBraziers) {
            poi.state = 1;
            emit(run, EV.bellReady, poi.x, poi.y);
          }
        } else if (poi.state === 1) {
          // Il faut y rester : on ne la sonne pas par accident en passant.
          if (dist < ev.bell.radius) poi.progress += dt;
          else poi.progress = 0;
          if (poi.progress >= ev.bell.seconds) {
            poi.state = 2;
            emit(run, EV.bellRung, poi.x, poi.y);
            callBoss(run);
          }
        }
        break;
      case 'portal':
      case 'memory':
        // Un Souvenir ne se prend pas à l'instant où il tombe : Moon a le temps de le voir, même s'il est dessus.
        if (!poi.armed) {
          poi.progress += dt;
          if (poi.progress >= ev.memoryArmSeconds) poi.armed = true;
          break;
        }
        if (dist < 20) {
          poi.state = 2;
          if (poi.kind === 'memory') run.memoryTaken = true;
          run.outcome = 'victory';
          run.phase = 'victory';
        }
        break;
      default:
        updatePlace(run, poi, index, dist, dt);
        break;
    }
  }
}
