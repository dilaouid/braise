import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/content/index.ts';
import { activeBot, hashRun, simulate } from '../../src/core/bots.ts';
import { reapEnemies, spawnEnemy } from '../../src/core/combat.ts';
import { closeChest, closeFind, takeCard } from '../../src/core/levelup.ts';
import { computeResult } from '../../src/core/rewards.ts';
import { abandonRun, createRun, idleInput, stepRun } from '../../src/core/run.ts';
import { EV, PK_PIECE, type Run, type RunConfig } from '../../src/core/types.ts';
import { applyRunResult, buildSheet, unlockedContent, type RunSummary } from '../../src/meta/hero.ts';
import { lanternRun } from '../../src/meta/lantern.ts';
import type { Save } from '../../src/meta/save.ts';
import { CLASS, REGION, data, makeImmortal, makeSave, makeTutorial } from './helpers.ts';

const ELITE = data.enemies.findIndex((e) => e.rank === 'elite');
const ALL = data.lantern.pieces.map((p) => p.id);
const kindOf = (id: string): string => data.lantern.pieces.find((p) => p.id === id)!.kind;

/** Les mêmes données, avec ces chances de tomber. */
function chances(elite: number, reborn: number): GameData {
  return { ...data, lantern: { ...data.lantern, drops: { elite, reborn } } };
}

/** Une sauvegarde qui possède ces pièces, posées sur les premières faces s'il y a la place. */
function owning(owned: string[], opened = 1, placed: string[] = []): Save {
  const save = makeSave(10);
  Object.assign(save.account.lantern, { owned: owned.slice(), opened });
  placed.forEach((id, i) => {
    save.account.lantern.faces[i] = id;
  });
  return save;
}

interface Opts { seed?: number; reborn?: boolean; replay?: boolean; game?: GameData }

function start(save: Save, o: Opts = {}): Run {
  const game = o.game ?? data;
  const { sheet } = buildSheet(game, save, CLASS);
  const unlocked = unlockedContent(game, save);
  const cfg: RunConfig = {
    seed: o.seed ?? 5, regionId: REGION, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false, reborn: o.reborn,
    ...lanternRun(game, save, o.replay ?? false),
  };
  const run = createRun(game, cfg);
  makeImmortal(run);
  run.enemies.count = 0;
  return run;
}

function killElite(run: Run): void {
  const i = spawnEnemy(run, ELITE, run.hero.x + 400, run.hero.y, 1);
  run.enemies.hp[i] = 0;
  reapEnemies(run);
}

/** Pose le boss de la région et le tue au pas suivant. Déjà reformé s'il se reforme. */
function killBoss(run: Run, reformed = true): void {
  const i = spawnEnemy(run, run.region.bossIdx, run.hero.x + 60, run.hero.y, 1);
  run.director.bossSpawned = true;
  run.director.arenaX = run.hero.x + 200;
  run.director.arenaY = run.hero.y;
  run.director.arenaR = 400;
  run.director.bossUid = run.enemies.uid[i]!;
  run.director.bossReformed = reformed;
  run.enemies.hp[i] = 0;
  stepRun(run, idleInput());
}

function settle(run: Run): void {
  for (let i = 0; i < 30 && run.phase !== 'playing'; i++) {
    if (run.phase === 'levelup') takeCard(run, 0);
    else if (run.phase === 'chest') closeChest(run);
    else if (run.phase === 'find') closeFind(run);
    else return;
  }
}

/** Laisse passer `seconds` secondes. */
function wait(run: Run, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) {
    settle(run);
    stepRun(run, idleInput());
  }
  settle(run);
}

function pieces(run: Run): number[] {
  const out: number[] = [];
  for (let i = 0; i < run.pickups.count; i++) if (run.pickups.kind[i] === PK_PIECE) out.push(i);
  return out;
}

/** Amène la pièce au sol sur le héros et la ramasse. */
function pickPiece(run: Run): void {
  const i = pieces(run)[0]!;
  run.pickups.x[i] = run.hero.x;
  run.pickups.y[i] = run.hero.y - 6;
  stepRun(run, idleInput());
}

function win(run: Run): void {
  run.outcome = 'victory';
  run.phase = 'victory';
}

function die(run: Run): void {
  run.outcome = 'death';
  run.phase = 'dead';
}

/** Une run finie d'un coup, et ce qu'elle change dans la sauvegarde. */
function finish(save: Save, o: Opts, end: (run: Run) => void): RunSummary {
  const run = start(save, o);
  end(run);
  return applyRunResult(save, o.game ?? data, computeResult(run));
}

describe('une pièce tombe', () => {
  it('le premier élite en lâche une, le second non', () => {
    const run = start(owning(['rune.call']), { game: chances(1, 0) });
    run.evCount = 0;
    killElite(run);
    expect(pieces(run)).toHaveLength(1);
    killElite(run);
    expect(pieces(run)).toHaveLength(1);
    let drops = 0;
    for (let i = 0; i < run.evCount; i++) if (run.evType[i] === EV.pieceDrop) drops++;
    expect(drops).toBe(1);
    expect(ALL).toContain(ALL[run.piece!.index]);
    expect(ALL[run.piece!.index]).not.toBe('rune.call');
  });

  it('jamais quand la chance est nulle, et jamais sans cfg.lantern', () => {
    const none = start(owning(['rune.call']), { game: chances(0, 0) });
    killElite(none);
    expect(none.piece).toBeNull();
    const run = start(owning(['rune.call']), { game: chances(1, 1) });
    const bare = createRun(run.data, { ...run.cfg, lantern: undefined });
    killElite(bare);
    expect(bare.piece).toBeNull();
    expect(pieces(bare)).toHaveLength(0);
  });

  it('sans aucune pièce, le Cerf en lâche une, toujours une rune', () => {
    const found = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const run = start(makeSave(10), { seed, game: chances(0, 0) });
      killBoss(run);
      const id = ALL[run.piece!.index]!;
      expect(kindOf(id), id).toBe('rune');
      found.add(id);
    }
    expect(found.size).toBeGreaterThan(4);
  });

  it('sans aucune pièce, un élite ne lâche qu\'une rune', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const run = start(makeSave(10), { seed, game: chances(1, 0) });
      killElite(run);
      expect(kindOf(ALL[run.piece!.index]!)).toBe('rune');
    }
  });

  it('sans garantie, le premier Cerf ne lâche rien ; le Cerf de Cendre suit sa chance', () => {
    const drop = (reborn: boolean, chance: number): boolean => {
      const run = start(owning(['rune.call']), { reborn, game: chances(0, chance) });
      killBoss(run);
      return run.piece !== null;
    };
    expect(drop(false, 1)).toBe(false);
    expect(drop(true, 0)).toBe(false);
    expect(drop(true, 1)).toBe(true);
  });

  it('la poussière ne lâche rien, la vraie mort oui', () => {
    const run = start(owning(['rune.call']), { reborn: true, game: chances(0, 1) });
    killBoss(run, false);
    expect(run.piece).toBeNull();
    const i = run.enemies.uid.indexOf(run.director.bossUid);
    run.director.bossReformT = 0;
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    expect(run.piece).toMatchObject({ fromBoss: true });
  });

  it('la pièce du boss vole vers Moon', () => {
    const run = start(owning(['rune.call']), { reborn: true, game: chances(0, 1) });
    killBoss(run);
    wait(run, 4);
    expect(run.piece!.taken).toBe(true);
    expect(pieces(run)).toHaveLength(0);
  });

  it('les douze pièces possédées : élites et boss meurent sans rien lâcher', () => {
    const run = start(owning(ALL), { reborn: true, game: chances(1, 1) });
    killElite(run);
    killBoss(run);
    expect(run.piece).toBeNull();
    expect(run.director.bossDead).toBe(true);
  });

  it('une graine rejouée ne lâche rien, pas même la garantie', () => {
    const run = start(makeSave(10), { replay: true, game: chances(1, 1) });
    killElite(run);
    killBoss(run);
    expect(run.piece).toBeNull();
  });

  it('le tutoriel ne lâche rien', () => {
    const run = makeTutorial();
    killElite(run);
    expect(run.piece).toBeNull();
  });

  it('même graine : même pièce, et le tirage ne déplace rien d\'autre', () => {
    const played = (save: Save, game: GameData): Run => simulate(start(save, { seed: 3, game }), {
      bot: activeBot,
      maxSteps: 60 * 60,
      // Un élite meurt à la dixième seconde.
      onStep: (run) => {
        if (run.tick === 600) killElite(run);
      },
    });
    const a = played(owning(['rune.call']), chances(0, 0));
    const b = played(owning(ALL), chances(1, 1));
    expect(a.hero.elites).toBeGreaterThan(0);
    expect(hashRun(a)).toBe(hashRun(b));
    const first = played(owning(['rune.call']), chances(1, 0));
    expect(first.piece).not.toBeNull();
    expect(played(owning(['rune.call']), chances(1, 0)).piece!.index).toBe(first.piece!.index);
  }, 60_000);
});

describe('garder ou perdre', () => {
  const some = chances(1, 1);

  it('ramassée puis victoire : gardée', () => {
    const run = start(owning(['rune.call']), { game: some });
    killElite(run);
    pickPiece(run);
    win(run);
    const id = ALL[run.piece!.index]!;
    expect(computeResult(run).lantern).toMatchObject({ kept: id, lost: null });
  });

  it('ramassée puis mort ou abandon : perdue', () => {
    for (const end of [die, abandonRun]) {
      const run = start(owning(['rune.call']), { game: some });
      killElite(run);
      pickPiece(run);
      end(run);
      expect(computeResult(run).lantern).toMatchObject({ kept: null, lost: ALL[run.piece!.index]! });
    }
  });

  it('laissée au sol par un élite : ni gardée ni perdue', () => {
    for (const end of [win, die]) {
      const run = start(owning(['rune.call']), { game: some });
      killElite(run);
      end(run);
      expect(computeResult(run).lantern).toMatchObject({ kept: null, lost: null });
    }
  });

  it('la pièce du boss, même au sol, est gardée à la victoire', () => {
    const run = start(owning(['rune.call']), { reborn: true, game: some });
    killBoss(run);
    expect(run.piece!.taken).toBe(false);
    win(run);
    expect(computeResult(run).lantern.kept).toBe(ALL[run.piece!.index]!);
  });

  it('mourir dans la même image que le Cerf de Cendre : victoire, pièce gardée', () => {
    const run = start(owning(['rune.call']), { reborn: true, game: some });
    run.hero.hp = -1e9;
    killBoss(run);
    expect(run.phase).not.toBe('dead');
    win(run);
    expect(computeResult(run).lantern.kept).not.toBeNull();
  });

  it('première pièce laissée au sol : donnée à la victoire', () => {
    const save = makeSave(10);
    const summary = finish(save, { game: some }, (run) => {
      killElite(run);
      killBoss(run);
      expect(run.piece!.fromBoss).toBe(false);
      expect(run.piece!.taken).toBe(false);
      win(run);
    });
    expect(summary.lanternPiece).not.toBeNull();
    expect(save.account.lantern.owned).toEqual([summary.lanternPiece]);
  });

  it('première pièce perdue à la mort : la run suivante est encore garantie', () => {
    const save = makeSave(10);
    const summary = finish(save, { game: some }, (run) => {
      killElite(run);
      pickPiece(run);
      die(run);
    });
    expect(summary.lanternLost).not.toBeNull();
    expect(save.account.lantern.owned).toEqual([]);
    expect(lanternRun(data, save, false).lantern.guaranteed).toBe(true);
  });

  it('applyRunResult inscrit la pièce une seule fois', () => {
    const save = owning(['rune.call']);
    const run = start(save, { reborn: true, game: some });
    killBoss(run);
    win(run);
    const result = computeResult(run);
    const first = applyRunResult(save, data, result);
    const second = applyRunResult(save, data, result);
    expect(first.lanternPiece).toBe(result.lantern.kept);
    expect(second.lanternPiece).toBeNull();
    expect(save.account.lantern.owned).toEqual(['rune.call', result.lantern.kept]);
  });
});

describe('ouvrir les faces', () => {
  const quiet = chances(0, 0);
  const SOME = ['rune.call', 'rune.hunt', 'rune.hunger'];
  const victory = (save: Save, reborn = true, replay = false): RunSummary => finish(save, { reborn, replay, game: quiet }, win);

  it('face 2 : le Cerf de Cendre, même Lanterne vide, et la victoire ne compte pas', () => {
    const save = owning(['rune.call']);
    expect(victory(save, false).lanternFace).toBeNull();
    expect(save.account.lantern).toMatchObject({ opened: 1, wins: 0 });
    expect(victory(save).lanternFace).toBe(2);
    expect(save.account.lantern).toMatchObject({ opened: 2, wins: 0 });
  });

  it('face 3 : à la troisième victoire avec une pièce ; une victoire vide ne compte pas', () => {
    const save = owning(SOME, 2, ['rune.call']);
    expect(victory(save).lanternFace).toBeNull();
    save.account.lantern.faces[0] = null;
    expect(victory(save).lanternFace).toBeNull();
    expect(save.account.lantern.wins).toBe(1);
    save.account.lantern.faces[0] = 'rune.call';
    expect(victory(save, false).lanternFace).toBeNull();
    expect(victory(save, false).lanternFace).toBe(3);
    expect(save.account.lantern).toMatchObject({ opened: 3, wins: 3 });
  });

  it('face 4 : le Cerf de Cendre avec trois pièces, pas deux, pas le premier Cerf', () => {
    const save = owning(SOME, 3, SOME.slice(0, 2));
    expect(victory(save).lanternFace).toBeNull();
    save.account.lantern.faces[2] = SOME[2]!;
    expect(victory(save, false).lanternFace).toBeNull();
    expect(victory(save).lanternFace).toBe(4);
    expect(victory(save).lanternFace).toBeNull();
    expect(save.account.lantern.opened).toBe(4);
  });

  it('trois victoires avant la face 2 : la 2 d\'abord, la 3 à la victoire suivante', () => {
    const save = owning(SOME, 1, ['rune.call']);
    for (let k = 0; k < 3; k++) expect(victory(save, false).lanternFace).toBeNull();
    expect(victory(save).lanternFace).toBe(2);
    expect(victory(save, false).lanternFace).toBe(3);
  });

  it('mort ou abandon : ni victoire comptée ni face', () => {
    for (const end of [die, abandonRun]) {
      const save = owning(SOME, 1, ['rune.call']);
      expect(finish(save, { reborn: true, game: quiet }, end).lanternFace).toBeNull();
      expect(save.account.lantern).toMatchObject({ opened: 1, wins: 0 });
    }
  });

  it('une graine rejouée compte pour les faces', () => {
    const save = owning(SOME, 1, ['rune.call']);
    expect(victory(save, true, true).lanternFace).toBe(2);
    expect(save.account.lantern.wins).toBe(1);
  });
});
