import { healHero, spawnEnemy } from './combat.ts';
import { applyCard, cardCandidates, recomputeStats, resumeRun } from './levelup.ts';
import { isSolidAt } from './map.ts';
import { emit, tutorialNote } from './stores.ts';
import { EV, SERVICES, type Card, type Poi, type Run, type ShopItem } from './types.ts';

export { closeFind, resumeRun } from './levelup.ts';

const TAU = Math.PI * 2;

/** Une vague qui converge vers un lieu, en cercle. */
export function convergingWave(run: Run, poi: Poi, count: number, enemyId: string): void {
  const kind = run.data.enemies.findIndex((e) => e.id === enemyId);
  if (kind < 0) return;
  const offset = run.rngSpawn.float() * TAU;
  for (let k = 0; k < count; k++) {
    const a = offset + (k * TAU) / count;
    const x = poi.x + Math.cos(a) * 300;
    const y = poi.y + Math.sin(a) * 300;
    if (!isSolidAt(run.map, x, y)) spawnEnemy(run, kind, x, y, run.hpScaleNow);
  }
}

/** Tire des buffs différents pour un totem. */
function drawBoons(run: Run): number[] {
  const weights = run.data.boons.map(() => 1);
  const out: number[] = [];
  const wanted = Math.min(run.data.tuning.events.totem.choices, weights.length);
  while (out.length < wanted) {
    const pick = run.rngDraw.weighted(weights);
    if (pick < 0) break;
    out.push(pick);
    weights[pick] = 0;
  }
  return out;
}

/** Les cartes qu'un Ferrailleur peut vendre maintenant : armes et reliques seulement. */
function sellable(run: Run): Array<{ card: Card; weight: number }> {
  return cardCandidates(run).filter((c) => c.card.kind === 'weapon' || c.card.kind === 'relic');
}

/** Tire les offres d'un Ferrailleur, toutes différentes. */
function drawOffers(run: Run): Card[] {
  const pool = sellable(run);
  const weights = pool.map((c) => c.weight);
  const out: Card[] = [];
  const wanted = run.data.tuning.events.smith.offers;
  while (out.length < wanted) {
    const pick = run.rngDraw.weighted(weights);
    if (pick < 0) break;
    out.push({ ...pool[pick]!.card });
    weights[pick] = 0;
  }
  return out;
}

/** Retire les offres devenues impossibles, et met les autres au niveau que le héros obtiendrait. */
function refreshOffers(run: Run, poi: Poi): void {
  if (!poi.offers) return;
  const pool = sellable(run);
  const kept: Card[] = [];
  for (const offer of poi.offers) {
    const now = pool.find((c) => c.card.kind === offer.kind && c.card.def === offer.def);
    if (now) kept.push({ ...now.card });
  }
  poi.offers = kept;
}

function openShop(run: Run, poi: Poi, index: number): void {
  if (poi.kind === 'smith') {
    if (!poi.offers) poi.offers = drawOffers(run);
    else refreshOffers(run, poi);
  }
  poi.progress = 0;
  poi.armed = false;
  run.shopPoi = index;
  run.phase = 'shop';
  emit(run, EV.shopOpen, poi.x, poi.y, poi.kind === 'smith' ? 0 : 1);
}

/** Les règles des lieux de la carte vivante : totems, marchands, trésors. */
export function updatePlace(run: Run, poi: Poi, index: number, dist: number, dt: number): void {
  const ev = run.data.tuning.events;
  switch (poi.kind) {
    case 'totem': {
      const inside = dist < ev.totem.radius;
      if (poi.state === 0) {
        if (inside) {
          poi.state = 1;
          // Dans le tutoriel, la vague vient du script : la vague habituelle naîtrait dans les murs.
          if (run.tutorial) tutorialNote(run, 'totem');
          else convergingWave(run, poi, ev.totem.waveCount, ev.totem.waveEnemy);
          emit(run, EV.poiStart, poi.x, poi.y, 1);
        }
      } else {
        if (inside) poi.progress += dt;
        else poi.progress = Math.max(0, poi.progress - dt * 0.5);
        if (poi.progress >= ev.totem.seconds) {
          poi.state = 2;
          run.totemChoices = drawBoons(run);
          emit(run, EV.totemDone, poi.x, poi.y);
          if (run.totemChoices.length > 0) run.phase = 'totem';
        }
      }
      break;
    }
    case 'smith':
    case 'herbalist': {
      const cfg = poi.kind === 'smith' ? ev.smith : ev.herbalist;
      if (dist >= cfg.radius) {
        poi.armed = true;
        poi.progress = 0;
      } else if (poi.armed) {
        poi.progress += dt;
        if (poi.progress >= cfg.dwell) openShop(run, poi, index);
      }
      break;
    }
    case 'treasure':
      if (dist < ev.treasure.radius) {
        poi.state = 2;
        run.pendingFinds++;
        emit(run, EV.poiDone, poi.x, poi.y, 3);
      }
      break;
    default:
      break;
  }
}

/** Prend le buff d'indice donné parmi ceux que le totem propose. */
export function takeBoon(run: Run, index: number): boolean {
  if (run.phase !== 'totem') return false;
  const boon = run.totemChoices[index];
  if (boon === undefined) return false;
  run.boons.push(boon);
  run.totemChoices = [];
  tutorialNote(run, 'boon');
  recomputeStats(run);
  resumeRun(run);
  return true;
}

function servicePrice(run: Run, service: number): number {
  const price = run.data.tuning.events.herbalist.services[SERVICES[service]!];
  return price.base + price.step * run.serviceBuys[service]!;
}

/** Ce que vend la boutique ouverte, avec les prix du moment. */
export function shopItems(run: Run): ShopItem[] {
  const poi = run.map.pois[run.shopPoi];
  if (!poi) return [];
  if (poi.kind === 'smith') {
    const ev = run.data.tuning.events.smith;
    const price = ev.basePrice + ev.priceStep * run.smithBuys;
    return (poi.offers ?? []).map((card) => ({ card, service: -1, price }));
  }
  return SERVICES.map((_, service) => ({ card: null, service, price: servicePrice(run, service) }));
}

/** Vrai si l'article peut être acheté maintenant (assez d'or, et il sert à quelque chose). */
export function canBuy(run: Run, item: ShopItem): boolean {
  if (run.hero.gold < item.price) return false;
  if (item.service === 1 && run.hero.hp >= run.hero.stats.maxHp) return false;
  return true;
}

/** Achète l'article d'indice donné dans la boutique ouverte. La boutique reste ouverte. */
export function buyItem(run: Run, index: number): boolean {
  if (run.phase !== 'shop') return false;
  const poi = run.map.pois[run.shopPoi];
  const item = shopItems(run)[index];
  if (!poi || !item || !canBuy(run, item)) return false;
  const hero = run.hero;
  hero.gold -= item.price;
  hero.goldSpent += item.price;
  if (item.card) {
    applyCard(run, item.card);
    poi.offers!.splice(index, 1);
    run.smithBuys++;
    refreshOffers(run, poi);
  } else {
    switch (SERVICES[item.service]) {
      case 'flask':
        run.extraFlasks++;
        recomputeStats(run);
        break;
      case 'balm': healHero(run, hero.stats.maxHp); break;
      case 'reroll': hero.rerolls++; break;
      case 'banish': hero.banishes++; break;
    }
    run.serviceBuys[item.service]!++;
  }
  emit(run, EV.shopBuy, hero.x, hero.y, item.price);
  tutorialNote(run, 'buy');
  return true;
}

/** Ferme la boutique et reprend la partie, ou enchaîne sur ce qui attend. */
export function closeShop(run: Run): void {
  if (run.phase !== 'shop') return;
  run.shopPoi = -1;
  tutorialNote(run, 'shopClosed');
  resumeRun(run);
}
