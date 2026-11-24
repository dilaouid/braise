import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { cinematicById } from '../../src/content/cinematic.ts';
import { explorerBot, simulate } from '../../src/core/bots.ts';
import { spawnEnemy } from '../../src/core/combat.ts';
import { closeChest, takeCard } from '../../src/core/levelup.ts';
import { computeResult } from '../../src/core/rewards.ts';
import { abandonRun, createRun, idleInput, stepRun } from '../../src/core/run.ts';
import type { Run } from '../../src/core/types.ts';
import { applyRunResult, buildSheet, hasMemory, memoryCount, pendingMemory, unlockedContent } from '../../src/meta/hero.ts';
import { CLASS, REGION, data, makeImmortal, makeSave, makeTutorial } from './helpers.ts';

const MEETING = 'memory.meeting';

type RawMemories = { total: number; memories: Array<{ id: string; boss: string; cinematic: string }> };

function broken(change: (m: RawMemories, raw: typeof RAW) => void): string[] {
  const raw = structuredClone(RAW);
  change(raw.memories as RawMemories, raw);
  return compileContent(raw).errors;
}

/** Une expédition où le boss doit (ou non) rendre un souvenir. */
function makeMemoryRun(memory: string | null, seed = 5): Run {
  const save = makeSave(10);
  const { sheet } = buildSheet(data, save, CLASS);
  const unlocked = unlockedContent(data, save);
  return createRun(data, {
    seed, regionId: REGION, classId: CLASS, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false, memory,
  });
}

/** Fait apparaître le boss à côté du héros et le tue : le pas suivant résout sa mort. */
function killBoss(run: Run, offset = 120): void {
  const i = spawnEnemy(run, run.region.bossIdx, run.hero.x + 60, run.hero.y, 1);
  run.director.bossSpawned = true;
  run.director.arenaX = run.hero.x + offset;
  run.director.arenaY = run.hero.y;
  run.director.arenaR = 400;
  run.director.bossUid = run.enemies.uid[i]!;
  run.enemies.hp[i] = 0;
  stepRun(run, idleInput());
}

/** Referme les écrans de choix que le butin du boss a ouverts. */
function settle(run: Run): void {
  for (let i = 0; i < 20 && (run.phase === 'levelup' || run.phase === 'chest'); i++) {
    if (run.phase === 'levelup') takeCard(run, 0);
    else closeChest(run);
  }
}

function touch(run: Run, kind: string): void {
  settle(run);
  for (let i = 0; i < 60 * 2; i++) {
    stepRun(run, idleInput());
    settle(run);
  }
  const poi = run.map.pois.find((p) => p.kind === kind)!;
  run.hero.x = poi.x;
  run.hero.y = poi.y;
  stepRun(run, idleInput());
}

describe('contenu des souvenirs', () => {
  it('le contenu livré compile', () => {
    expect(compileContent().errors).toEqual([]);
    expect(data.memoriesTotal).toBe(5);
    expect(data.memories).toHaveLength(1);
    expect(data.memories[0]).toMatchObject({ id: MEETING, index: 0, cinematic: 'memory-meeting' });
    expect(data.enemies[data.memories[0]!.bossIdx]!.id).toBe('boss.lightless-stag');
  });

  it('un boss inconnu est refusé', () => {
    expect(broken((m) => {
      m.memories[0]!.boss = 'boss.personne';
    }).some((e) => e.includes('boss.personne'))).toBe(true);
  });

  it('une cinématique inconnue est refusée', () => {
    expect(broken((m) => {
      m.memories[0]!.cinematic = 'memory-absente';
    }).some((e) => e.includes('memory-absente'))).toBe(true);
  });

  it('deux souvenirs pour un même boss sont refusés', () => {
    expect(broken((m) => {
      m.memories.push({ id: 'memory.autre', boss: 'boss.lightless-stag', cinematic: 'memory-meeting' });
    }).some((e) => e.includes('boss.lightless-stag'))).toBe(true);
  });

  it('un total inférieur au nombre de souvenirs est refusé', () => {
    expect(broken((m) => {
      m.total = 0;
    }).length).toBeGreaterThan(0);
  });

  it('un nom manquant est refusé', () => {
    expect(broken((_m, raw) => {
      delete raw.fr['memory.meeting.name'];
    }).some((e) => e.includes('memory.meeting.name'))).toBe(true);
  });

  it('la cinématique du souvenir est valide et a quatre plans', () => {
    const c = cinematicById('memory-meeting');
    expect(c.shots).toHaveLength(4);
    expect(c.shots.every((s) => s.caption !== undefined)).toBe(true);
    expect(cinematicById('intro').id).toBe('intro');
    expect(() => cinematicById('nulle-part')).toThrow();
  });
});

describe('le Souvenir dans l\'arène', () => {
  it('boss battu avec un souvenir à rendre : un lieu memory, pas de portail', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run);
    expect(run.map.pois.filter((p) => p.kind === 'memory')).toHaveLength(1);
    expect(run.map.pois.some((p) => p.kind === 'portal')).toBe(false);
    expect(run.phase).toBe('playing');
  });

  it('sans souvenir à rendre : le portail', () => {
    const run = makeMemoryRun(null);
    makeImmortal(run);
    killBoss(run);
    expect(run.map.pois.some((p) => p.kind === 'portal')).toBe(true);
    expect(run.map.pois.some((p) => p.kind === 'memory')).toBe(false);
    touch(run, 'portal');
    expect(run.phase).toBe('victory');
    expect(computeResult(run).memory).toBeNull();
  });

  it('toucher le Souvenir finit en victoire et le résultat le porte', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run);
    expect(run.memoryTaken).toBe(false);
    touch(run, 'memory');
    expect(run.phase).toBe('victory');
    expect(run.outcome).toBe('victory');
    expect(run.memoryTaken).toBe(true);
    expect(computeResult(run).memory).toBe(MEETING);
  });

  it('héros à terre dans l\'image où le boss meurt : un seul Souvenir, et la victoire en le touchant', () => {
    const run = makeMemoryRun(MEETING);
    run.hero.hp = -1;
    run.hero.revives = 0;
    killBoss(run);
    expect(run.phase).toBe('playing');
    for (let i = 0; i < 10; i++) stepRun(run, idleInput());
    expect(run.map.pois.filter((p) => p.kind === 'memory')).toHaveLength(1);
    touch(run, 'memory');
    expect(run.phase).toBe('victory');
  });

  it('un Souvenir tombé sous les pieds de Moon se prend après un court instant, sans bouger', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run, 0);
    settle(run);
    // Juste après la mort du boss, il n'est pas encore prenable : Moon a le temps de le voir.
    for (let i = 0; i < 20; i++) {
      stepRun(run, idleInput());
      settle(run);
    }
    expect(run.phase).toBe('playing');
    for (let i = 0; i < 60 * 3 && run.phase !== 'victory'; i++) {
      stepRun(run, idleInput());
      settle(run);
    }
    expect(run.phase).toBe('victory');
    expect(run.memoryTaken).toBe(true);
  });

  it('le robot prend un Souvenir tombé sous ses pieds', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run, 0);
    simulate(run, { bot: explorerBot, maxSteps: 60 * 20 });
    expect(run.phase).toBe('victory');
  });

  it('le boss du tutoriel ne laisse ni Souvenir ni portail', () => {
    const run = makeTutorial(1);
    const watcher = data.enemies.findIndex((e) => e.id === 'boss.watcher');
    const i = spawnEnemy(run, watcher, run.hero.x + 60, run.hero.y, 1);
    run.enemies.hp[i] = 0;
    stepRun(run, idleInput());
    expect(run.map.pois).toEqual([]);
    expect(run.memoryTaken).toBe(false);
  });

  it('abandonner avec le Souvenir au sol : pas de souvenir', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run);
    abandonRun(run);
    const result = computeResult(run);
    expect(result.outcome).toBe('abandon');
    expect(result.memory).toBeNull();
  });

  it('le tutoriel ne laisse pas de Souvenir', () => {
    const run = makeTutorial(1);
    expect(run.cfg.memory ?? null).toBeNull();
    expect(run.memoryTaken).toBe(false);
  });

  it('le robot va chercher le Souvenir', () => {
    const run = makeMemoryRun(MEETING);
    makeImmortal(run);
    killBoss(run);
    const poi = run.map.pois.find((p) => p.kind === 'memory')!;
    run.hero.x = poi.x + 150;
    simulate(run, { bot: explorerBot, maxSteps: 60 * 20 });
    expect(run.phase).toBe('victory');
    expect(run.memoryTaken).toBe(true);
  });
});

describe('le Souvenir dans la sauvegarde', () => {
  it('une victoire avec le Souvenir l\'inscrit, une seule fois', () => {
    const save = makeSave(10);
    expect(hasMemory(save, MEETING)).toBe(false);
    expect(pendingMemory(data, save, REGION)).toBe(MEETING);
    for (let k = 0; k < 2; k++) {
      const run = makeMemoryRun(MEETING, 5 + k);
      makeImmortal(run);
      killBoss(run);
      touch(run, 'memory');
      const summary = applyRunResult(save, data, computeResult(run));
      expect(summary.memory).toBe(k === 0 ? MEETING : null);
    }
    expect(save.account.unlocks.filter((u) => u === MEETING)).toHaveLength(1);
    expect(hasMemory(save, MEETING)).toBe(true);
    expect(memoryCount(data, save)).toBe(1);
    expect(pendingMemory(data, save, REGION)).toBeNull();
  });

  it('une sauvegarde où le Cerf est déjà battu, mais sans souvenir, le recevra', () => {
    const save = makeSave(10);
    save.account.regions[REGION] = { lit: true, bestVigil: 1, bossKills: 3 };
    expect(memoryCount(data, save)).toBe(0);
    expect(pendingMemory(data, save, REGION)).toBe(MEETING);
  });

  it('une défaite ne donne rien', () => {
    const save = makeSave(10);
    const run = makeMemoryRun(MEETING);
    abandonRun(run);
    const summary = applyRunResult(save, data, computeResult(run));
    expect(summary.memory).toBeNull();
    expect(hasMemory(save, MEETING)).toBe(false);
  });

  it('une région inconnue n\'a pas de souvenir', () => {
    expect(pendingMemory(data, makeSave(), 'region.nulle-part')).toBeNull();
  });
});
