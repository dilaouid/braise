import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { data } from './helpers.ts';

type RawTuto = {
  map: { rows: string[]; markers: Record<string, string> };
  steps: Array<Record<string, unknown>>;
};
type RawDialogues = { dialogues: Record<string, Array<Record<string, unknown>>> };

/** Une copie du contenu, à casser. */
function broken(change: (tuto: RawTuto, dlg: RawDialogues, raw: typeof RAW) => void): string[] {
  const raw = structuredClone(RAW);
  change(raw.tutorial as RawTuto, raw.dialogues as RawDialogues, raw);
  return compileContent(raw).errors;
}

describe('contenu du tutoriel', () => {
  it('le contenu livré compile', () => {
    expect(compileContent().errors).toEqual([]);
    expect(data.tutorial.steps.length).toBeGreaterThan(20);
    expect(data.dialogues['tuto.opening']!.length).toBeGreaterThanOrEqual(18);
  });

  it('l\'ouverture garde la phrase de la bible', () => {
    const texts = data.dialogues['tuto.opening']!.map((l) => RAW.fr[l.text]);
    expect(texts).toContain('Tu ne m\'avais jamais vraiment écouté.');
    expect(texts).toContain('TU PARLES ?!');
  });

  it('un repère inconnu est refusé', () => {
    const errors = broken((t) => {
      (t.steps.find((s) => s.do === 'guide') as { to: string }).to = 'nulle-part';
    });
    expect(errors.some((e) => e.includes('nulle-part'))).toBe(true);
  });

  it('une barrière sans tuile est refusée', () => {
    const errors = broken((t) => {
      (t.steps.find((s) => s.do === 'gate') as { id: number }).id = 9;
    });
    expect(errors.some((e) => e.includes('barrière 9'))).toBe(true);
  });

  it('un dialogue inconnu est refusé', () => {
    const errors = broken((t) => {
      (t.steps.find((s) => s.do === 'say') as { dialogue: string }).dialogue = 'tuto.absent';
    });
    expect(errors.some((e) => e.includes('tuto.absent'))).toBe(true);
  });

  it('une clé de texte absente est refusée', () => {
    const errors = broken((_t, _d, raw) => {
      delete raw.fr['dialog.tuto.opening.2'];
    });
    expect(errors.some((e) => e.includes('dialog.tuto.opening.2'))).toBe(true);
  });

  it('une réplique de 161 caractères est refusée', () => {
    const errors = broken((_t, _d, raw) => {
      raw.fr['dialog.tuto.opening.2'] = 'x'.repeat(161);
    });
    expect(errors.some((e) => e.includes('160'))).toBe(true);
    expect(broken((_t, _d, raw) => {
      raw.fr['dialog.tuto.opening.2'] = 'x'.repeat(160);
    })).toEqual([]);
  });

  it('un portrait ou une pose hors liste est refusé', () => {
    expect(broken((_t, d) => {
      d.dialogues['tuto.opening']![0]!.face = 'grognon';
    }).some((e) => e.includes('grognon'))).toBe(true);
    expect(broken((_t, d) => {
      d.dialogues['tuto.opening']![0]!.poses = { moon: 'salto' };
    }).some((e) => e.includes('salto'))).toBe(true);
  });

  it('une carte non carrée est refusée', () => {
    const errors = broken((t) => {
      t.map.rows.pop();
    });
    expect(errors.some((e) => e.includes('carrée'))).toBe(true);
  });

  it('un repère posé dans un mur est refusé', () => {
    const errors = broken((t) => {
      t.map.markers.perdu = '§';
    });
    expect(errors.some((e) => e.includes('perdu'))).toBe(true);
  });

  it('une salle murée est refusée', () => {
    const errors = broken((t) => {
      // On mure le couloir de la salle 0 à la salle 1, barrière comprise.
      for (const y of [7, 8, 9]) t.map.rows[y] = t.map.rows[y]!.slice(0, 14) + '####' + t.map.rows[y]!.slice(18);
    });
    expect(errors.some((e) => e.includes('atteindre'))).toBe(true);
  });

  it('l\'or donné couvre un achat chez le Ferrailleur', () => {
    const errors = broken((t) => {
      (t.steps.find((s) => s.do === 'gold') as { amount: number }).amount = 10;
    });
    expect(errors.some((e) => e.includes('Ferrailleur'))).toBe(true);
  });

  it('le Guetteur annonce ses attaques au moins 1,2 s avant', () => {
    const watcher = data.enemies.find((e) => e.id === 'boss.watcher')!;
    expect(watcher.behavior).toBe('boss-watcher');
    expect(watcher.charge!.telegraph).toBeGreaterThanOrEqual(1.2);
    expect(watcher.slam!.telegraph).toBeGreaterThanOrEqual(1.2);
    const errors = broken((_t, _d, raw) => {
      const w = (raw.enemies as Array<{ id: string; slam?: unknown }>).find((e) => e.id === 'boss.watcher')!;
      delete w.slam;
    });
    expect(errors.some((e) => e.includes('boss.watcher'))).toBe(true);
  });

  it('le script commence par un point de reprise et finit par end', () => {
    expect(data.tutorial.steps[0]!.do).toBe('checkpoint');
    expect(data.tutorial.steps[data.tutorial.steps.length - 1]!.do).toBe('end');
    expect(broken((t) => {
      t.steps.shift();
    }).some((e) => e.includes('point de reprise'))).toBe(true);
    expect(broken((t) => {
      t.steps.pop();
    }).some((e) => e.includes('end'))).toBe(true);
  });

  it('les repères sont résolus en pixels, au centre de leur tuile', () => {
    const start = data.tutorial.markers.start!;
    expect(start).toEqual({ x: 5.5 * data.tuning.tileSize, y: 8.5 * data.tuning.tileSize });
  });
});
