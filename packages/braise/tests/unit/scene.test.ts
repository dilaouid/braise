import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { CAMP_CREAM, CAMP_MOON, SCENES_RAW, compileScene, type SceneDef } from '../../src/content/scene.ts';
import { advanceScene, finishScene, newScene, sceneLine, stepScene, type SceneState } from '../../src/core/scene.ts';
import { data } from './helpers.ts';

/** Joue la scène jusqu'au bout : A sur chaque réplique, au plus `seconds` secondes. */
function playThrough(s: SceneState, seconds = 120): { lines: string[]; kindled: number } {
  const lines: string[] = [];
  let kindled = 0;
  for (let t = 0; t < seconds && !s.done; t += 0.05) {
    stepScene(s, 0.05);
    if (s.kindled) kindled++;
    const line = sceneLine(s);
    if (line && line.who >= 0) {
      lines.push(line.text);
      advanceScene(s);
    }
  }
  return { lines, kindled };
}

function scene(steps: SceneDef['steps'], fire = false): SceneState {
  return newScene({ id: 'essai', fire, moon: [600, 250], cream: [620, 250], steps }, data.dialogues);
}

describe('scènes de route', () => {
  it('chaque scène compile, et le jeu les connaît', () => {
    const known = new Set(Object.keys(data.dialogues));
    for (const [id, raw] of Object.entries(SCENES_RAW)) {
      expect(compileScene(raw, known).errors, id).toEqual([]);
      expect(data.scenes[id], id).toBeDefined();
    }
  });

  it('un dialogue inconnu est une erreur', () => {
    const raw = { id: 'x', fire: false, moon: [0, 0], cream: [0, 0], steps: [{ do: 'say', dialogue: 'nulle.part' }] };
    expect(compileScene(raw, new Set()).errors.join()).toContain('nulle.part');
  });

  it('une scène de souvenir inconnue est une erreur', () => {
    const raw = structuredClone(RAW);
    (raw.memories as { memories: Array<{ scene?: string }> }).memories[0]!.scene = 'absente';
    expect(compileContent(raw).errors.join()).toContain('absente');
  });

  it('le souvenir de la rencontre a sa scène', () => {
    expect(data.memories.find((m) => m.id === 'memory.meeting')!.scene).toBe('after-memory-meeting');
  });

  it('move amène chacun à son point avant l\'étape suivante', () => {
    const s = scene([{ do: 'move', moon: [500, 240], cream: [480, 250] }, { do: 'wait', seconds: 1 }]);
    stepScene(s, 0.5);
    expect(s.moon.moving).toBe(true);
    expect(s.step).toBe(0);
    for (let i = 0; i < 200 && s.step === 0; i++) stepScene(s, 0.05);
    expect(s.step).toBe(1);
    expect([s.moon.x, s.moon.y]).toEqual([500, 240]);
    expect([s.cream.x, s.cream.y]).toEqual([480, 250]);
    expect(s.moon.moving).toBe(false);
  });

  it('une réplique attend A, une ligne muette passe seule', () => {
    const s = scene([{ do: 'say', dialogue: 'scene.after-memory-meeting.1' }]);
    stepScene(s, 0.05);
    // La première ligne est muette (1,2 s) : elle passe sans A.
    expect(sceneLine(s)!.who).toBe(-1);
    for (let i = 0; i < 30; i++) stepScene(s, 0.05);
    const line = sceneLine(s)!;
    expect(line.who).toBe(0);
    for (let i = 0; i < 100; i++) stepScene(s, 0.05);
    expect(sceneLine(s)).toBe(line);
    advanceScene(s);
    expect(sceneLine(s)).not.toBe(line);
  });

  it('kindle allume le feu une fois', () => {
    const s = scene([{ do: 'kindle' }, { do: 'wait', seconds: 1 }]);
    expect(s.fire).toBe(false);
    stepScene(s, 0.05);
    expect(s.fire).toBe(true);
    expect(s.kindled).toBe(true);
    stepScene(s, 0.05);
    expect(s.kindled).toBe(false);
  });

  it('chaque scène se joue jusqu\'au bout et finit au refuge, feu allumé', () => {
    for (const id of Object.keys(SCENES_RAW)) {
      const s = newScene(data.scenes[id]!, data.dialogues);
      const { lines, kindled } = playThrough(s);
      expect(s.done, id).toBe(true);
      expect(lines.length, id).toBeGreaterThan(0);
      expect(kindled, id).toBe(1);
      expect(s.fire).toBe(true);
      expect([s.moon.x, s.moon.y]).toEqual([CAMP_MOON.x, CAMP_MOON.y]);
      expect([s.cream.x, s.cream.y]).toEqual([CAMP_CREAM.x, CAMP_CREAM.y]);
    }
  });

  it('passer la scène la finit tout de suite, au refuge', () => {
    const s = newScene(data.scenes['after-tutorial']!, data.dialogues);
    stepScene(s, 0.3);
    finishScene(s);
    expect(s.done).toBe(true);
    expect(sceneLine(s)).toBeNull();
    expect([s.moon.x, s.moon.y]).toEqual([CAMP_MOON.x, CAMP_MOON.y]);
    stepScene(s, 1);
    expect(s.done).toBe(true);
  });
});
