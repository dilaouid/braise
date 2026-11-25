import { describe, expect, it } from 'vitest';
import { activeBot, explorerBot, hashRun, plannedPick, simulate } from '../../src/core/bots.ts';
import { closeChest, takeCard } from '../../src/core/levelup.ts';
import { takeFlame } from '../../src/core/flames.ts';
import { buyItem, closeFind, closeShop, resumeRun, shopItems } from '../../src/core/places.ts';
import { computeResult } from '../../src/core/rewards.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { EV, SERVICES, type Poi, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeRun, makeSave } from './helpers.ts';

const ev = data.tuning.events;

function nth(run: Run, kind: Poi['kind'], n = 0): Poi {
  return run.map.pois.filter((p) => p.kind === kind)[n]!;
}

function put(run: Run, x: number, y: number): void {
  run.hero.x = x;
  run.hero.y = y;
  run.hero.px = x;
  run.hero.py = y;
}

function at(run: Run, kind: Poi['kind'], n = 0): Poi {
  const poi = nth(run, kind, n);
  put(run, poi.x, poi.y + 4);
  return poi;
}

/** Avance de n pas ; les niveaux et les coffres sont résolus, les nouveaux écrans arrêtent la boucle. */
function play(run: Run, n: number): void {
  const input = idleInput();
  for (let i = 0; i < n; i++) {
    if (run.phase === 'levelup') takeCard(run, 0);
    else if (run.phase === 'chest') closeChest(run);
    if (run.phase !== 'playing') return;
    stepRun(run, input);
    run.evCount = 0;
  }
}

function flame(id: string): { line: number; base: number; rarity: number; gift: boolean } {
  const line = data.flames.lines.findIndex((l) => l.id === id);
  const first = data.flames.lines[line]!.first;
  return { line, base: first, rarity: first, gift: false };
}

function find(id: string): number {
  return data.finds.findIndex((f) => f.id === id);
}

function fresh(seed: number): Run {
  const run = makeRun(seed);
  makeImmortal(run);
  return run;
}

describe('totems', () => {
  it('entrer dans le cercle lance une vague, y rester 5 s ouvre un choix de 3 Flammes', () => {
    const run = fresh(41);
    const poi = at(run, 'totem');
    play(run, 2);
    expect(poi.state).toBe(1);
    expect(run.enemies.count).toBeGreaterThanOrEqual(8);
    play(run, 4 * 60);
    expect(run.phase).toBe('playing');
    play(run, 90);
    expect(run.phase).toBe('totem');
    expect(poi.state).toBe(2);
    expect(run.totemOffers.length).toBe(3);
    expect(new Set(run.totemOffers.map((o) => o.line)).size).toBe(3);
  });

  it('prendre une Flamme l\'applique et rend la main', () => {
    const run = fresh(41);
    at(run, 'totem');
    play(run, 6 * 60);
    expect(run.phase).toBe('totem');
    run.totemOffers = [flame('flame.stride'), flame('flame.edge'), flame('flame.vein')];
    const speed = run.hero.stats.speed;
    const base = data.tuning.hero.speed;
    expect(takeFlame(run, 0)).toBe(true);
    expect(run.flames).toEqual([{ line: flame('flame.stride').line, rarity: 0 }]);
    expect(run.hero.stats.speed - speed).toBeCloseTo(base * 0.06, 6);
    expect(run.totemOffers).toEqual([]);
    expect(run.phase === 'playing' || run.phase === 'levelup').toBe(true);
    expect(takeFlame(run, 0)).toBe(false);
  });

  it('sortir du cercle fait redescendre la charge', () => {
    const run = fresh(41);
    const poi = at(run, 'totem');
    play(run, 3 * 60);
    const before = poi.progress;
    expect(before).toBeGreaterThan(2.5);
    put(run, poi.x + 200, poi.y);
    play(run, 60);
    expect(poi.progress).toBeLessThan(before);
  });

  it('deux Flammes de lignées différentes s\'ajoutent', () => {
    const run = fresh(42);
    const power = run.hero.stats.power;
    const hp = run.hero.stats.maxHp;
    for (const id of ['flame.edge', 'flame.breath']) {
      run.phase = 'totem';
      run.totemOffers = [flame(id)];
      takeFlame(run, 0);
    }
    expect(run.hero.stats.power - power).toBeCloseTo(0.07, 6);
    expect(run.hero.stats.maxHp).toBeGreaterThan(hp);
  });
});

describe('trésors et trouvailles', () => {
  it('toucher un trésor donne une trouvaille, une seule fois', () => {
    const run = fresh(43);
    const poi = at(run, 'treasure');
    const pool = run.findPool.length;
    play(run, 2);
    expect(run.phase).toBe('find');
    expect(poi.state).toBe(2);
    expect(run.find).toBeGreaterThanOrEqual(0);
    expect(run.finds).toEqual([run.find]);
    expect(run.findPool.length).toBe(pool - 1);
    expect(run.findPool).not.toContain(run.find);
    closeFind(run);
    expect(run.phase).toBe('playing');
    expect(run.find).toBe(-1);
    play(run, 10);
    expect(run.phase).toBe('playing');
    expect(run.finds.length).toBe(1);
  });

  it('six trouvailles de suite sont toutes différentes', () => {
    const run = fresh(44);
    for (let k = 0; k < 6; k++) {
      run.pendingFinds++;
      resumeRun(run);
      expect(run.phase).toBe('find');
      closeFind(run);
    }
    expect(new Set(run.finds).size).toBe(6);
  });

  it('réserve vide : le trésor donne l\'or d\'un coffre', () => {
    const run = fresh(45);
    run.findPool = [];
    const gold = run.hero.gold;
    at(run, 'treasure');
    play(run, 2);
    expect(run.phase).toBe('find');
    expect(run.find).toBe(-2);
    const got = run.hero.gold - gold;
    expect(got).toBeGreaterThanOrEqual(data.tuning.gold.chest[0]);
    expect(got).toBeLessThanOrEqual(data.tuning.gold.chest[1]);
    expect(run.findGold).toBe(got);
    closeFind(run);
    expect(run.phase).toBe('playing');
  });

  it('une cache ouverte donne aussi une trouvaille', () => {
    const run = fresh(46);
    const poi = at(run, 'cache');
    play(run, 2);
    expect(poi.state).toBe(1);
    // Le gardien tombe.
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) if (e.uid[i] === poi.guardUid) e.hp[i] = 0;
    for (let i = 0; i < 300 && run.phase !== 'find'; i++) play(run, 1);
    expect(poi.state).toBe(2);
    expect(run.phase).toBe('find');
    expect(run.finds.length).toBe(1);
  });

  it('la Gourde ajoute une fiole pleine, l\'Écharpe une résurrection', () => {
    const run = fresh(47);
    const flasks = run.hero.flasks;
    const max = run.hero.stats.flasks;
    const revives = run.hero.revives;
    run.findPool = [find('find.scarf'), find('find.flask')];
    run.pendingFinds = 2;
    resumeRun(run);
    closeFind(run);
    closeFind(run);
    expect(run.hero.stats.flasks).toBe(max + 1);
    expect(run.hero.flasks).toBe(flasks + 1);
    expect(run.hero.revives).toBe(revives + 1);
  });

  it('coffre, trouvaille et niveau en attente s\'enchaînent sans rien perdre', () => {
    const run = fresh(48);
    run.pendingChests = 1;
    run.pendingFinds = 1;
    run.pendingLevels = 1;
    resumeRun(run);
    expect(run.phase).toBe('chest');
    closeChest(run);
    expect(run.phase).toBe('find');
    closeFind(run);
    expect(run.phase).toBe('levelup');
    // Le coffre sans évolution a ajouté un choix gratuit : deux cartes à prendre.
    takeCard(run, 0);
    expect(run.phase).toBe('levelup');
    takeCard(run, 0);
    expect(run.phase).toBe('playing');
  });
});

describe('marchands', () => {
  it('une boutique s\'ouvre après 0,6 s dans son cercle, pas avant', () => {
    const run = fresh(51);
    at(run, 'smith');
    play(run, 30);
    expect(run.phase).toBe('playing');
    play(run, 10);
    expect(run.phase).toBe('shop');
  });

  it('la frôler en courant ne l\'ouvre pas', () => {
    const run = fresh(51);
    const poi = at(run, 'smith');
    play(run, 10);
    put(run, poi.x + 100, poi.y);
    play(run, 60);
    expect(run.phase).toBe('playing');
    expect(poi.progress).toBe(0);
  });

  it('fermée, elle ne se rouvre que si on sort du cercle puis qu\'on revient', () => {
    const run = fresh(51);
    const poi = at(run, 'smith');
    play(run, 40);
    expect(run.phase).toBe('shop');
    closeShop(run);
    expect(run.phase).toBe('playing');
    play(run, 120);
    expect(run.phase).toBe('playing');
    put(run, poi.x + 100, poi.y);
    play(run, 2);
    put(run, poi.x, poi.y + 4);
    play(run, 40);
    expect(run.phase).toBe('shop');
  });

  it('Ferrailleur : 3 offres, l\'achat coûte, équipe, retire l\'offre et monte les prix des deux Ferrailleurs', () => {
    const run = fresh(52);
    at(run, 'smith');
    play(run, 40);
    const items = shopItems(run);
    expect(items.length).toBe(3);
    for (const it of items) {
      expect(it.card).not.toBeNull();
      expect(it.service).toBe(-1);
      expect(it.price).toBe(ev.smith.basePrice);
    }
    const owned = run.weapons.length + run.relics.length + run.weapons.reduce((s, w) => s + w.level, 0);
    run.hero.gold = ev.smith.basePrice + 40;
    expect(buyItem(run, 0)).toBe(true);
    expect(run.hero.gold).toBe(40);
    expect(run.hero.goldSpent).toBe(ev.smith.basePrice);
    expect(run.weapons.length + run.relics.length + run.weapons.reduce((s, w) => s + w.level, 0)).toBeGreaterThan(owned);
    const left = shopItems(run);
    expect(left.length).toBeLessThanOrEqual(2);
    for (const it of left) expect(it.price).toBe(ev.smith.basePrice + ev.smith.priceStep);
    // Plus assez d'or : rien ne change.
    const gold = run.hero.gold;
    expect(buyItem(run, 0)).toBe(false);
    expect(run.hero.gold).toBe(gold);
    closeShop(run);
    expect(run.phase).toBe('playing');
    at(run, 'smith', 1);
    play(run, 40);
    expect(run.phase).toBe('shop');
    expect(shopItems(run)[0]!.price).toBe(ev.smith.basePrice + ev.smith.priceStep);
  });

  it('sans or, la boutique se ferme sans rien bloquer', () => {
    const run = fresh(52);
    at(run, 'smith');
    play(run, 40);
    run.hero.gold = 0;
    expect(buyItem(run, 0)).toBe(false);
    closeShop(run);
    expect(run.phase).toBe('playing');
  });

  it('Ferrailleur sans rien à vendre : liste vide, fermeture possible', () => {
    const run = fresh(53);
    run.weaponPool = [];
    run.relicPool = [];
    for (const w of run.weapons) w.level = data.weapons[w.def]!.levels.length;
    at(run, 'smith');
    play(run, 40);
    expect(run.phase).toBe('shop');
    expect(shopItems(run)).toEqual([]);
    expect(buyItem(run, 0)).toBe(false);
    closeShop(run);
    expect(run.phase).toBe('playing');
  });

  it('une offre devenue impossible disparaît à la réouverture', () => {
    const run = fresh(54);
    const poi = at(run, 'smith');
    play(run, 40);
    expect(shopItems(run).length).toBe(3);
    closeShop(run);
    run.weaponPool = [];
    run.relicPool = [];
    for (const w of run.weapons) w.level = data.weapons[w.def]!.levels.length;
    put(run, poi.x + 100, poi.y);
    play(run, 2);
    put(run, poi.x, poi.y + 4);
    play(run, 40);
    expect(run.phase).toBe('shop');
    expect(shopItems(run)).toEqual([]);
  });

  it('Herboriste : quatre services, chacun avec son effet et son prix qui monte', () => {
    const run = fresh(55);
    at(run, 'herbalist');
    play(run, 40);
    expect(run.phase).toBe('shop');
    const s = ev.herbalist.services;
    const items = shopItems(run);
    expect(items.map((it) => it.service)).toEqual([0, 1, 2, 3]);
    expect(items.map((it) => it.price)).toEqual([s.flask.base, s.balm.base, s.reroll.base, s.banish.base]);
    expect(SERVICES).toEqual(['flask', 'balm', 'reroll', 'banish']);
    run.hero.gold = 10000;
    const hero = run.hero;
    const flasks = hero.flasks;
    const max = hero.stats.flasks;
    expect(buyItem(run, 0)).toBe(true);
    expect(hero.stats.flasks).toBe(max + 1);
    expect(hero.flasks).toBe(flasks + 1);
    expect(shopItems(run)[0]!.price).toBe(s.flask.base + s.flask.step);
    // Le baume ne se vend pas à un héros en pleine forme.
    expect(buyItem(run, 1)).toBe(false);
    hero.hp = 1;
    expect(buyItem(run, 1)).toBe(true);
    expect(hero.hp).toBe(hero.stats.maxHp);
    expect(shopItems(run)[1]!.price).toBe(s.balm.base + s.balm.step);
    const rerolls = hero.rerolls;
    const banishes = hero.banishes;
    expect(buyItem(run, 2)).toBe(true);
    expect(buyItem(run, 3)).toBe(true);
    expect(hero.rerolls).toBe(rerolls + 1);
    expect(hero.banishes).toBe(banishes + 1);
    expect(hero.goldSpent).toBe(10000 - hero.gold);
  });

  it('le bilan compte l\'or dépensé et ne ramène que l\'or restant', () => {
    const run = fresh(56);
    run.hero.gold = 40;
    run.hero.goldSpent = 60;
    const res = computeResult(run);
    expect(res.goldSpent).toBe(60);
    expect(res.goldCollected).toBe(Math.round(40 * (1 + run.hero.stats.greed)));
  });
});

describe('le boss et la carte', () => {
  it('une alerte est émise une seule fois, à la minute réglée', () => {
    const run = fresh(61);
    run.time = ev.bossWarningMinute * 60 - 0.05;
    const input = idleInput();
    let warnings = 0;
    for (let i = 0; i < 30; i++) {
      stepRun(run, input);
      for (let k = 0; k < run.evCount; k++) if (run.evType[k] === EV.bossWarning) warnings++;
      run.evCount = 0;
    }
    expect(warnings).toBe(1);
  });

  it('un lieu dans l\'arène reste utilisable pendant le boss', () => {
    const run = fresh(62);
    run.time = data.tuning.durationMin * 60;
    play(run, 2);
    expect(run.director.bossSpawned).toBe(true);
    run.map.pois.push({ kind: 'treasure', x: run.hero.x, y: run.hero.y, state: 0, progress: 0, discovered: true, guardUid: 0, offers: null, armed: true });
    play(run, 2);
    expect(run.phase).toBe('find');
  });
});

describe('robot explorateur', () => {
  it('il va de lieu en lieu, charge des totems et achète, sans jamais bloquer la partie', () => {
    let flames = 0;
    let spent = 0;
    let finds = 0;
    for (const seed of [201, 202, 203]) {
      const run = simulate(makeRun(seed, makeSave(10), true), { bot: explorerBot, pickCard: plannedPick, maxSteps: 20 * 3600 });
      expect(run.phase === 'dead' || run.phase === 'victory', `graine ${seed} : ${run.phase} à ${run.time.toFixed(0)} s`).toBe(true);
      flames += run.flames.length;
      finds += run.finds.length;
      spent += run.hero.goldSpent;
    }
    expect(flames).toBeGreaterThanOrEqual(3);
    expect(finds).toBeGreaterThanOrEqual(3);
    expect(spent).toBeGreaterThan(0);
  }, 120000);
});

describe('déterminisme', () => {
  it('même graine, mêmes actions : même partie, lieux compris', () => {
    const a = simulate(makeRun(77), { bot: activeBot, maxSteps: 3 * 60 * 60 });
    const b = simulate(makeRun(77), { bot: activeBot, maxSteps: 3 * 60 * 60 });
    expect(hashRun(a)).toBe(hashRun(b));
  });
});
