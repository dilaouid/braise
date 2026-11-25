import { describe, expect, it } from 'vitest';
import type { TutorialStep } from '../../src/content/index.ts';
import { isSolidAt } from '../../src/core/map.ts';
import { takeFlame } from '../../src/core/flames.ts';
import { buyItem, closeShop, shopItems } from '../../src/core/places.ts';
import { closeFind, takeCard } from '../../src/core/levelup.ts';
import { idleInput, stepRun } from '../../src/core/run.ts';
import { advanceDialogue, currentLine, skipDialogue, tickDialogue, tutorialTarget } from '../../src/core/tutorial.ts';
import { EV, PK_GEM, STEP, TG_CIRCLE, TG_LINE, TILE_GATE, type Run } from '../../src/core/types.ts';
import { data, makeImmortal, makeTutorial, tutoMarker as marker } from './helpers.ts';

const CRAWLER = data.enemies.findIndex((e) => e.id === 'enemy.crawler');
const WATCHER = data.enemies.findIndex((e) => e.id === 'boss.watcher');
const T = data.tuning.tileSize;
const tutoPoint = (name: string): { x: number; y: number } => marker(name);

function place(run: Run, p: { x: number; y: number }): void {
  run.hero.x = p.x;
  run.hero.y = p.y;
  run.hero.px = p.x;
  run.hero.py = p.y;
}

function steps(run: Run, n: number, input: Partial<ReturnType<typeof idleInput>> = {}): void {
  for (let i = 0; i < n; i++) stepRun(run, { ...idleInput(), ...input });
}

const wait = (until: Extract<TutorialStep, { do: 'wait' }>['until'], at?: string, seconds = 0): TutorialStep => {
  const p = at ? marker(at) : { x: 0, y: 0 };
  return { do: 'wait', until, hasAt: at !== undefined, x: p.x, y: p.y, seconds };
};
const checkpoint = (at: string): TutorialStep => ({ do: 'checkpoint', ...marker(at) });
const spawn = (kind: number, at: string[], count = 1, boss = false): TutorialStep => ({ do: 'spawn', kind, points: at.map(marker), count, boss });
const placeAt = (kind: 'spring' | 'treasure' | 'smith' | 'totem', at: string): TutorialStep => ({ do: 'place', kind, ...marker(at) });
const END: TutorialStep = { do: 'end' };
const MARK: TutorialStep = { do: 'banner', text: 'tuto.banner.move', glyph: null };

/** Vrai si l'étape qui suit l'attente a été jouée. */
const passed = (run: Run): boolean => run.tutorial!.banner === 'tuto.banner.move';

function events(run: Run, type: number): number {
  let n = 0;
  for (let i = 0; i < run.evCount; i++) if (run.evType[i] === type) n++;
  return n;
}

describe('dialogue', () => {
  it('say ouvre un dialogue et met la partie en pause', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.opening' }, MARK, wait('time', undefined, 99)]);
    steps(run, 1);
    expect(run.phase).toBe('dialogue');
    expect(currentLine(run)!.text).toBe('dialog.tuto.opening.1');
    expect(run.tutorial!.heroPose).toBe('think');
    const time = run.time;
    steps(run, 30);
    expect(run.time).toBe(time);
    expect(passed(run)).toBe(false);
  });

  it('advanceDialogue va jusqu\'au bout, puis la partie reprend sans pose ni bulle', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.opening' }, MARK, wait('time', undefined, 99)]);
    steps(run, 1);
    const lines = data.dialogues['tuto.opening']!.length;
    for (let i = 0; i < lines - 1; i++) advanceDialogue(run);
    expect(run.phase).toBe('dialogue');
    expect(run.tutorial!.guide.pose).toBe('rise');
    expect(run.tutorial!.emoteCream).toBe('exclaim');
    advanceDialogue(run);
    expect(run.phase).toBe('playing');
    expect(currentLine(run)).toBeNull();
    expect(run.tutorial!.heroPose).toBe('');
    expect(run.tutorial!.guide.pose).toBe('');
    expect(run.tutorial!.emoteMoon + run.tutorial!.emoteCream).toBe('');
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('skipDialogue passe tout le dialogue', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.opening' }, MARK, wait('time', undefined, 99)]);
    steps(run, 1);
    advanceDialogue(run);
    skipDialogue(run);
    expect(run.phase).toBe('playing');
    expect(run.tutorial!.heroPose).toBe('');
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('une ligne muette avance seule après sa durée', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.opening' }, END]);
    steps(run, 1);
    // Le silence est la cinquième ligne de l'ouverture.
    for (let i = 0; i < 4; i++) advanceDialogue(run);
    const silent = currentLine(run)!;
    expect(silent.who).toBe(-1);
    expect(run.tutorial!.emoteMoon).toBe('dots');
    tickDialogue(run, silent.seconds - 0.1);
    expect(currentLine(run)).toBe(silent);
    tickDialogue(run, 0.2);
    expect(currentLine(run)!.text).toBe('dialog.tuto.opening.4');
  });

  it('un niveau gagné avant un dialogue s\'ouvre après lui', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.room1.a' }, END]);
    run.pendingLevels = 1;
    steps(run, 1);
    expect(run.phase).toBe('dialogue');
    advanceDialogue(run);
    expect(run.phase).toBe('levelup');
    expect(takeCard(run, 0)).toBe(true);
    expect(run.phase).toBe('playing');
    expect(run.tutorial!.notes.card).toBe(1);
  });

  it('chaque ligne émet un événement avec celui qui parle', () => {
    const run = makeTutorial(1, [{ do: 'say', dialogue: 'tuto.opening' }, END]);
    steps(run, 1);
    advanceDialogue(run);
    expect(events(run, EV.dialogueLine)).toBe(2);
  });
});

describe('conditions d\'attente', () => {
  it('reach : il faut rejoindre le repère', () => {
    const run = makeTutorial(1, [wait('reach', 'door0'), MARK, wait('time', undefined, 999)]);
    steps(run, 30);
    expect(passed(run)).toBe(false);
    expect(tutorialTarget(run)).toEqual(marker('door0'));
    place(run, marker('door0'));
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('clear : tant qu\'un ennemi vit, on attend', () => {
    const run = makeTutorial(1, [checkpoint('r1in'), spawn(CRAWLER, ['r1a', 'r1b', 'r1c']), wait('clear'), MARK, wait('time', undefined, 999)]);
    makeImmortal(run);
    place(run, marker('r1in'));
    steps(run, 1);
    expect(run.enemies.count).toBe(3);
    expect(passed(run)).toBe(false);
    steps(run, 30);
    expect(passed(run)).toBe(false);
    for (let i = 0; i < run.enemies.count; i++) run.enemies.hp[i] = 0;
    steps(run, 2);
    expect(run.enemies.count).toBe(0);
    expect(passed(run)).toBe(true);
  });

  it('gems : il faut ramasser les éclats', () => {
    const run = makeTutorial(1, [{ do: 'gem', ...marker('r1a') }, wait('gems'), MARK, wait('time', undefined, 999)]);
    steps(run, 30);
    expect(passed(run)).toBe(false);
    run.pickups.count = 0;
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('gem fait gagner exactement un niveau, et card attend le choix', () => {
    const run = makeTutorial(1, [{ do: 'gem', ...marker('start') }, wait('card'), MARK, wait('time', undefined, 999)]);
    run.hero.xp = 3.3;
    steps(run, 1);
    expect(run.pickups.kind[0]).toBe(PK_GEM);
    for (let i = 0; i < 120 && run.phase === 'playing'; i++) steps(run, 1);
    expect(run.phase).toBe('levelup');
    expect(run.hero.level).toBe(2);
    expect(run.pendingLevels).toBe(1);
    expect(passed(run)).toBe(false);
    takeCard(run, 0);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('healed : une fiole bue suffit, et sans fiole on n\'attend pas', () => {
    const script: TutorialStep[] = [{ do: 'hurt', share: 0.5 }, wait('healed'), MARK, wait('time', undefined, 999)];
    const run = makeTutorial(1, script);
    steps(run, 5);
    expect(run.hero.hp).toBeLessThanOrEqual(run.hero.stats.maxHp * 0.5 + 1);
    expect(passed(run)).toBe(false);
    steps(run, 1, { flask: true });
    steps(run, 1);
    expect(run.tutorial!.notes.flask).toBe(1);
    expect(passed(run)).toBe(true);

    const dry = makeTutorial(1, script);
    dry.hero.flasks = 0;
    steps(dry, 2);
    expect(passed(dry)).toBe(true);
  });

  it('full : la source remet toute la vie', () => {
    const run = makeTutorial(1, [{ do: 'hurt', share: 0.5 }, placeAt('spring', 'r4spring'), wait('full', 'r4spring'), MARK, wait('time', undefined, 999)]);
    steps(run, 5);
    expect(passed(run)).toBe(false);
    place(run, marker('r4spring'));
    steps(run, 2);
    expect(run.hero.hp).toBe(run.hero.stats.maxHp);
    expect(passed(run)).toBe(true);
  });

  it('find : le trésor donne la trouvaille du tutoriel', () => {
    const run = makeTutorial(1, [placeAt('treasure', 'r5treasure'), wait('find', 'r5treasure'), MARK, wait('time', undefined, 999)]);
    place(run, marker('r5treasure'));
    steps(run, 2);
    expect(run.phase).toBe('find');
    expect(run.find).toBe(data.tutorial.find);
    closeFind(run);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('buy : un achat chez le Ferrailleur', () => {
    const run = makeTutorial(1, [{ do: 'gold', amount: 160, ...marker('r5smith') }, placeAt('smith', 'r5smith'), wait('buy', 'r5smith'), MARK, wait('time', undefined, 999)]);
    place(run, marker('r5smith'));
    for (let i = 0; i < 120 && run.phase === 'playing'; i++) steps(run, 1);
    expect(run.phase).toBe('shop');
    expect(run.hero.gold).toBe(160);
    expect(shopItems(run).length).toBeGreaterThan(0);
    expect(buyItem(run, 0)).toBe(true);
    closeShop(run);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('buy : fermer la boutique sans assez d\'or débloque la salle', () => {
    const run = makeTutorial(1, [placeAt('smith', 'r5smith'), wait('buy', 'r5smith'), MARK, wait('time', undefined, 999)]);
    place(run, marker('r5smith'));
    for (let i = 0; i < 120 && run.phase === 'playing'; i++) steps(run, 1);
    expect(run.phase).toBe('shop');
    expect(buyItem(run, 0)).toBe(false);
    closeShop(run);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('buy : fermer la boutique avec assez d\'or ne débloque rien', () => {
    const run = makeTutorial(1, [placeAt('smith', 'r5smith'), wait('buy', 'r5smith'), MARK, wait('time', undefined, 999)]);
    run.hero.gold = 500;
    place(run, marker('r5smith'));
    for (let i = 0; i < 120 && run.phase === 'playing'; i++) steps(run, 1);
    closeShop(run);
    steps(run, 5);
    expect(passed(run)).toBe(false);
  });

  it('buy : un achat fait avant que la leçon commence compte', () => {
    const run = makeTutorial(1, [placeAt('smith', 'r5smith'), wait('time', undefined, 3), wait('buy', 'r5smith'), MARK, wait('time', undefined, 999)]);
    run.hero.gold = 160;
    place(run, tutoPoint('r5smith'));
    for (let i = 0; i < 120 && run.phase === 'playing'; i++) steps(run, 1);
    expect(buyItem(run, 0)).toBe(true);
    closeShop(run);
    place(run, tutoPoint('r5in'));
    steps(run, 60 * 4);
    expect(passed(run)).toBe(true);
  });

  it('totem puis boon : la vague vient du script, pas du totem', () => {
    const run = makeTutorial(1, [
      placeAt('totem', 'r6totem'), checkpoint('r6in'), wait('totem', 'r6totem'), spawn(CRAWLER, ['r6a', 'r6b'], 2),
      wait('boon', 'r6totem'), MARK, wait('time', undefined, 999),
    ]);
    makeImmortal(run);
    place(run, marker('r6in'));
    steps(run, 30);
    expect(run.enemies.count).toBe(0);
    place(run, marker('r6totem'));
    steps(run, 2);
    expect(run.tutorial!.notes.totem).toBe(1);
    expect(run.enemies.count).toBe(4);
    for (let i = 0; i < 60 * 8 && run.phase === 'playing'; i++) {
      place(run, marker('r6totem'));
      steps(run, 1);
    }
    expect(run.phase).toBe('totem');
    expect(takeFlame(run, 0)).toBe(true);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('time : une durée de jeu', () => {
    const run = makeTutorial(1, [wait('time', undefined, 1), MARK, wait('time', undefined, 999)]);
    steps(run, 50);
    expect(passed(run)).toBe(false);
    steps(run, 15);
    expect(passed(run)).toBe(true);
  });
});

describe('étapes', () => {
  it('gate libère les tuiles de sa barrière, et elles seules', () => {
    const run = makeTutorial(1, [{ do: 'gate', id: 1 }, wait('time', undefined, 999)]);
    const size = run.map.size;
    expect(run.map.solid[8 * size + 14]).toBe(TILE_GATE);
    steps(run, 1);
    for (const y of [7, 8, 9]) expect(run.map.solid[y * size + 14]).toBe(0);
    expect(run.map.solid[8 * size + 30]).toBe(TILE_GATE);
    expect(events(run, EV.gateOpen)).toBe(3);
  });

  it('une barrière ouverte laisse passer Moon et les ennemis', () => {
    const run = makeTutorial(1, [{ do: 'gate', id: 1 }, spawn(CRAWLER, ['r1in']), wait('time', undefined, 999)]);
    makeImmortal(run);
    run.weapons.length = 0;
    steps(run, 60 * 12);
    const e = run.enemies;
    expect(e.count).toBe(1);
    // Le Rampant a traversé le couloir pour rejoindre Moon dans la salle de départ.
    expect(e.x[0]!).toBeLessThan(14 * T);
    place(run, marker('door0'));
    steps(run, 90, { moveX: 1 });
    expect(run.hero.x).toBeGreaterThan(15 * T);
  });

  it('banner pose et retire le bandeau, bark s\'efface seul', () => {
    const run = makeTutorial(1, [
      { do: 'banner', text: 'tuto.banner.dash', glyph: 'dash' }, { do: 'bark', text: 'tuto.bark.skill' }, wait('time', undefined, 1),
      { do: 'banner', text: null, glyph: null }, wait('time', undefined, 999),
    ]);
    steps(run, 1);
    expect(run.tutorial!.banner).toBe('tuto.banner.dash');
    expect(run.tutorial!.bannerGlyph).toBe('dash');
    expect(run.tutorial!.bark).toBe('tuto.bark.skill');
    steps(run, 70);
    expect(run.tutorial!.banner).toBeNull();
    expect(run.tutorial!.bannerGlyph).toBeNull();
    steps(run, Math.ceil(data.tutorial.tuning.barkSeconds / STEP));
    expect(run.tutorial!.bark).toBeNull();
  });

  it('end termine en victoire', () => {
    const run = makeTutorial(1, [END]);
    steps(run, 1);
    expect(run.tutorial!.done).toBe(true);
    expect(run.phase).toBe('victory');
    expect(run.outcome).toBe('victory');
  });

  it('pas de horde en tutoriel', () => {
    const run = makeTutorial(1, [wait('time', undefined, 999)]);
    steps(run, 60 * 30);
    expect(run.enemies.count).toBe(0);
    expect(run.hpScaleNow).toBe(1);
    expect(run.dmgScale).toBe(1);
  });
});

describe('Cream', () => {
  it('rejoint son repère en contournant les murs', () => {
    const run = makeTutorial(1, [{ do: 'gate', id: 1 }, { do: 'guide', ...marker('r1out') }, wait('time', undefined, 999)]);
    const g = run.tutorial!.guide;
    let inWall = 0;
    for (let i = 0; i < 60 * 12; i++) {
      steps(run, 1);
      if (run.map.solid[Math.floor(g.y / T) * run.map.size + Math.floor(g.x / T)] === 1) inWall++;
    }
    expect(inWall).toBe(0);
    expect(Math.hypot(g.x - marker('r1out').x, g.y - marker('r1out').y)).toBeLessThan(2);
    expect(g.moving).toBe(false);
  });

  it('passe la fumée et les Éteints endormis', () => {
    const run = makeTutorial(1, [{ do: 'guide', ...marker('r3out') }, wait('time', undefined, 999)]);
    steps(run, 60 * 25);
    const g = run.tutorial!.guide;
    expect(Math.hypot(g.x - marker('r3out').x, g.y - marker('r3out').y)).toBeLessThan(2);
  });

  it('sort de la lueur quand Moon s\'approche, sans entrer dans un mur', () => {
    const run = makeTutorial(1, [wait('time', undefined, 999)]);
    const g = run.tutorial!.guide;
    const keep = run.hero.stats.glow + data.tutorial.tuning.guideKeep;
    // Moon marche droit sur lui, puis le pousse vers le coin de la salle.
    for (let i = 0; i < 600; i++) {
      const dx = g.x - run.hero.x;
      const dy = g.y - run.hero.y;
      const d = Math.hypot(dx, dy) || 1;
      steps(run, 1, { moveX: dx / d, moveY: dy / d });
      expect(isSolidAt(run.map, g.x, g.y)).toBe(false);
    }
    place(run, marker('start'));
    g.x = marker('start').x + 10;
    g.tx = g.x;
    g.y = marker('start').y;
    g.ty = g.y;
    steps(run, 120);
    expect(Math.hypot(g.x - run.hero.x, g.y - run.hero.y)).toBeGreaterThanOrEqual(keep - 0.5);
  });

  it('regarde Moon quand il attend', () => {
    const run = makeTutorial(1, [wait('time', undefined, 999)]);
    const g = run.tutorial!.guide;
    steps(run, 2);
    // Moon est en bas à gauche de lui.
    expect([0, 1, 2]).toContain(g.facing);
  });

  it('deux parties identiques donnent le même état', () => {
    const play = (): string => {
      const run = makeTutorial(3, 'content');
      for (let i = 0; i < 900; i++) {
        if (run.phase === 'dialogue') advanceDialogue(run);
        steps(run, 1, { moveX: 1, moveY: i % 120 < 60 ? 0.3 : -0.3 });
      }
      const g = run.tutorial!.guide;
      return [run.tutorial!.step, run.hero.x, run.hero.y, g.x, g.y, g.facing, run.enemies.count, run.rngSpawn.float()].join('/');
    };
    expect(play()).toBe(play());
  });
});

describe('mourir dans le tutoriel', () => {
  const totemRoom: TutorialStep[] = [
    placeAt('totem', 'r6totem'), checkpoint('r6in'), wait('totem', 'r6totem'), spawn(CRAWLER, ['r6a', 'r6b', 'r6c', 'r6d'], 3),
    wait('boon', 'r6totem'), MARK, wait('time', undefined, 999),
  ];

  it('la mort ne finit pas le tutoriel : Moon reprend à l\'entrée de la salle', () => {
    const run = makeTutorial(1, [checkpoint('r1in'), spawn(CRAWLER, ['r1a']), wait('clear'), MARK, wait('time', undefined, 999)]);
    place(run, marker('r1b'));
    steps(run, 1);
    run.hero.flasks = 0;
    run.hero.hp = -1;
    steps(run, 1);
    expect(run.phase).toBe('playing');
    expect(run.outcome).toBeNull();
    expect(run.hero.hp).toBe(run.hero.stats.maxHp);
    expect(run.hero.flasks).toBe(run.hero.stats.flasks);
    expect({ x: run.hero.x, y: run.hero.y }).toEqual(marker('r1in'));
    expect(run.tutorial!.deaths).toBe(1);
    expect(run.tutorial!.bark).toBe('tuto.death.1');
    expect(events(run, EV.tutoRespawn)).toBe(1);
    // La salle recommence : un seul Rampant, pas deux.
    steps(run, 1);
    expect(run.enemies.count).toBe(1);
  });

  it('les répliques de reprise tournent', () => {
    const run = makeTutorial(1, [checkpoint('r1in'), wait('time', undefined, 999)]);
    const seen: Array<string | null> = [];
    for (let k = 0; k < 4; k++) {
      steps(run, 1);
      run.hero.hp = -1;
      steps(run, 1);
      seen.push(run.tutorial!.bark);
    }
    expect(seen).toEqual(['tuto.death.1', 'tuto.death.2', 'tuto.death.3', 'tuto.death.1']);
  });

  it('mourir trois fois au totem ne double rien', () => {
    const run = makeTutorial(1, totemRoom);
    for (let k = 0; k < 3; k++) {
      place(run, marker('r6totem'));
      steps(run, 30);
      expect(run.map.pois[0]!.state).toBe(1);
      expect(run.enemies.count).toBe(12);
      run.hero.hp = -1;
      steps(run, 1);
      expect(run.map.pois.length).toBe(1);
      expect(run.map.pois[0]!.state).toBe(0);
      expect(run.map.pois[0]!.progress).toBe(0);
      expect(run.enemies.count).toBe(0);
      expect(run.tutorial!.step).toBe(2);
    }
    // Et la salle se finit toujours.
    makeImmortal(run);
    for (let i = 0; i < 60 * 10 && run.phase === 'playing'; i++) {
      place(run, marker('r6totem'));
      steps(run, 1);
    }
    expect(run.phase).toBe('totem');
    takeFlame(run, 0);
    steps(run, 1);
    expect(passed(run)).toBe(true);
  });

  it('ce qui est gagné reste : niveau, or, lieux finis', () => {
    const run = makeTutorial(1, [placeAt('treasure', 'r5treasure'), checkpoint('r5in'), wait('time', undefined, 999)]);
    place(run, marker('r5treasure'));
    steps(run, 2);
    closeFind(run);
    run.hero.gold = 77;
    run.hero.level = 3;
    run.hero.hp = -1;
    steps(run, 1);
    expect(run.hero.gold).toBe(77);
    expect(run.hero.level).toBe(3);
    expect(run.finds).toEqual([data.tutorial.find]);
    expect(run.map.pois[0]!.state).toBe(2);
  });
});

describe('le Guetteur', () => {
  const bossRoom: TutorialStep[] = [checkpoint('r7in'), spawn(WATCHER, ['r7boss'], 1, true), wait('boss'), MARK, wait('time', undefined, 999)];

  it('annonce une ligne, puis un cercle', () => {
    const run = makeTutorial(1, bossRoom);
    makeImmortal(run);
    run.weapons.length = 0;
    place(run, marker('r7in'));
    const shapes: number[] = [];
    let before = 0;
    for (let i = 0; i < 60 * 14; i++) {
      steps(run, 1);
      if (run.telegraphs.count > before) shapes.push(run.telegraphs.shape[run.telegraphs.count - 1]!);
      before = run.telegraphs.count;
    }
    expect(shapes.slice(0, 2)).toEqual([TG_LINE, TG_CIRCLE]);
    expect(run.director.bossUid).toBeGreaterThan(0);
    expect(run.director.bossSpawned).toBe(false);
  });

  it('battu, il ne laisse ni portail ni butin, et la salle s\'ouvre', () => {
    const run = makeTutorial(1, bossRoom);
    makeImmortal(run);
    place(run, marker('r7in'));
    steps(run, 2);
    expect(run.enemies.count).toBe(1);
    run.enemies.hp[0] = 0;
    steps(run, 2);
    expect(run.tutorial!.notes.boss).toBe(1);
    expect(passed(run)).toBe(true);
    expect(run.map.pois.some((p) => p.kind === 'portal')).toBe(false);
    expect(run.pickups.count).toBe(0);
    expect(run.hero.bossKills).toBe(1);
    expect(run.director.bossUid).toBe(0);
  });

  it('mourir face à lui le fait revenir avec toute sa vie', () => {
    const run = makeTutorial(1, bossRoom);
    place(run, marker('r7in'));
    steps(run, 2);
    run.enemies.hp[0] = run.enemies.maxHp[0]! * 0.2;
    run.hero.hp = -1;
    // La reprise vide la salle, puis le script fait revenir le boss dans le même pas.
    steps(run, 1);
    expect(run.enemies.count).toBe(1);
    expect(run.enemies.hp[0]).toBe(run.enemies.maxHp[0]);
    expect({ x: run.hero.x, y: run.hero.y }).toEqual(marker('r7in'));
  });
});
