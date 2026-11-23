import { addPickup, healHero, spawnEnemy } from './combat.ts';
import { isSolidAt } from './map.ts';
import { emit } from './stores.ts';
import { EV, PK_ASH, PK_CHEST, PK_GOLD, type Poi, type Run } from './types.ts';

const TAU = Math.PI * 2;

function guardAlive(run: Run, uid: number): boolean {
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) if (e.uid[i] === uid && e.hp[i]! > 0) return true;
  return false;
}

function convergingWave(run: Run, poi: Poi): void {
  const cfg = run.data.tuning.events.brazier;
  const kind = run.data.enemies.findIndex((e) => e.id === cfg.waveEnemy);
  if (kind < 0) return;
  const offset = run.rngSpawn.float() * TAU;
  for (let k = 0; k < cfg.waveCount; k++) {
    const a = offset + (k * TAU) / cfg.waveCount;
    const x = poi.x + Math.cos(a) * 300;
    const y = poi.y + Math.sin(a) * 300;
    if (!isSolidAt(run.map, x, y)) spawnEnemy(run, kind, x, y, run.hpScaleNow);
  }
}

/** Les événements de la carte : braséros, sources, caches, portail. */
export function updatePois(run: Run, dt: number): void {
  const hero = run.hero;
  const ev = run.data.tuning.events;
  const tile = run.map.tile;
  const discover = ev.discoverTiles * tile;
  for (const poi of run.map.pois) {
    const dist = Math.hypot(hero.x - poi.x, hero.y - poi.y);
    if (!poi.discovered && dist < discover) poi.discovered = true;
    if (poi.state === 2) continue;
    switch (poi.kind) {
      case 'brazier': {
        const inside = dist < ev.brazier.radius;
        if (poi.state === 0) {
          if (inside) {
            poi.state = 1;
            convergingWave(run, poi);
            emit(run, EV.poiStart, poi.x, poi.y, 0);
          }
        } else {
          // Rester dans le cercle le rallume ; en sortir fait retomber la flamme.
          if (inside) poi.progress += dt;
          else poi.progress = Math.max(0, poi.progress - dt * 0.5);
          if (poi.progress >= ev.brazier.seconds) {
            poi.state = 2;
            run.braziersLit++;
            addPickup(run, PK_CHEST, poi.x, poi.y + 26, 1);
            addPickup(run, PK_ASH, poi.x - 14, poi.y + 22, run.data.tuning.ashes.brazier);
            emit(run, EV.poiDone, poi.x, poi.y, 0);
          }
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
          emit(run, EV.poiDone, poi.x, poi.y, 2);
        }
        break;
      case 'portal':
        if (dist < 20) {
          poi.state = 2;
          run.outcome = 'victory';
          run.phase = 'victory';
        }
        break;
    }
  }
}
