import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { CAMP_MOON } from '../../src/content/scene.ts';
import { nearestObject, newCamp, stepCamp, walkTo, type CampState } from '../../src/core/camp.ts';
import { data } from './helpers.ts';

const def = data.camp;
const ALL = new Set(def.objects.map((o) => o.id));
const DT = 1 / 60;
const at = (id: string) => def.objects.find((o) => o.id === id)!;

function walk(s: CampState, mx: number, my: number, seconds: number, visible: ReadonlySet<string> = ALL): void {
  for (let i = 0; i < seconds * 60; i++) stepCamp(s, def, visible, mx, my, DT);
}

/** Moon posé quelque part, loin de tout. */
function placed(x: number, y: number): CampState {
  return { ...newCamp(def), x, y };
}

/** Le bord d'un obstacle : 1 sur le bord, moins à l'intérieur. */
function depth(s: CampState, id: string): number {
  const o = at(id);
  return Math.hypot((s.x - o.x) / o.solid.rx, (s.y - o.y) / o.solid.ry);
}

function broken(change: (camp: any, raw: typeof RAW) => void): string {
  const raw = structuredClone(RAW);
  change(raw.camp, raw);
  return compileContent(raw).errors.join('\n');
}

describe('contenu du refuge', () => {
  it('la porte, l\'Autel, la Lanterne, Cream, les Souvenirs et le feu', () => {
    expect(compileContent().errors).toEqual([]);
    expect(def.objects.map((o) => o.id)).toEqual(['door', 'altar', 'lantern', 'cream', 'memories', 'fire']);
    expect(def.speed).toBe(90);
  });

  it('chaque objet qui s\'ouvre a son nom', () => {
    expect(broken((_c, raw) => {
      delete raw.fr['camp.object.altar'];
    })).toContain('camp.object.altar');
  });

  it('un identifiant en double, ou un point d\'arrêt dans un obstacle ou hors de la clairière, est refusé', () => {
    expect(broken((c) => {
      c.objects[1].id = 'door';
    })).toContain('door');
    expect(broken((c) => {
      c.objects[1].stand = [c.objects[0].x, c.objects[0].y];
    })).toContain('altar');
    expect(broken((c) => {
      c.objects[1].stand = [10, 10];
    })).toContain('altar');
  });
});

describe('marcher', () => {
  it('Moon arrive là où finissent les scènes, devant la porte', () => {
    const s = newCamp(def);
    expect([s.x, s.y]).toEqual([CAMP_MOON.x, CAMP_MOON.y]);
    expect(nearestObject(s, def, ALL)).toBe('door');
  });

  it('90 px/s, et pas plus vite en diagonale', () => {
    const a = placed(320, 260);
    walk(a, 1, 0, 0.5);
    expect(a.x).toBeCloseTo(320 + 45, 3);
    const b = placed(320, 250);
    walk(b, Math.SQRT1_2, Math.SQRT1_2, 0.5);
    expect(Math.hypot(b.x - 320, b.y - 250)).toBeCloseTo(45, 3);
    const c = placed(320, 260);
    walk(c, 0.5, 0, 0.5);
    expect(c.x).toBeCloseTo(320 + 22.5, 3);
  });

  it('le regard suit la marche, et Moon s\'arrête quand on lâche', () => {
    const s = placed(320, 260);
    walk(s, -1, 0, 0.1);
    expect(s.moving).toBe(true);
    expect(s.facing).toBe(2);
    walk(s, 0, 0, 0.05);
    expect(s.moving).toBe(false);
    expect(s.facing).toBe(2);
  });

  it('il ne sort pas de la clairière', () => {
    for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7]] as const) {
      const s = newCamp(def);
      walk(s, mx, my, 6);
      const b = def.bounds;
      expect(Math.hypot((s.x - b.x) / b.rx, (s.y - b.y) / b.ry)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('il contourne les obstacles sans jamais y entrer', () => {
    for (const o of def.objects) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const s = placed(o.x + Math.cos(a) * 70, o.y + Math.sin(a) * 50);
        for (let i = 0; i < 180; i++) {
          const dx = o.x - s.x;
          const dy = o.y - s.y;
          const d = Math.hypot(dx, dy) || 1;
          stepCamp(s, def, ALL, dx / d, dy / d, DT);
        }
        for (const other of def.objects) if (other.solid.rx > 0) expect(depth(s, other.id), `${o.id} ${k}`).toBeGreaterThan(0.999);
      }
    }
  });

  it('un objet caché n\'arrête pas Moon', () => {
    const o = at('altar');
    const s = placed(o.x + 60, o.y);
    walk(s, -1, 0, 0.6, new Set(['door']));
    expect(s.x).toBeLessThan(o.x + o.solid.rx);
  });
});

describe('aller à un objet', () => {
  it('Moon arrive à côté de chaque objet, de partout, en trois secondes au plus', () => {
    for (const from of def.objects) {
      for (const to of def.objects) {
        if (to.reach === 0) continue;
        const s = placed(from.stand[0], from.stand[1]);
        walkTo(s, def, to.id);
        walk(s, 0, 0, 3.1);
        expect(s.goal, `${from.id} vers ${to.id}`).toBeNull();
        expect(nearestObject(s, def, ALL), `${from.id} vers ${to.id}`).toBe(to.id);
      }
    }
  });

  it('le stick reprend la main', () => {
    const s = newCamp(def);
    walkTo(s, def, 'altar');
    walk(s, 0, 0, 0.2);
    expect(s.goal).not.toBeNull();
    walk(s, 1, 0, 0.05);
    expect(s.goal).toBeNull();
  });

  it('un objet inconnu ne fait rien', () => {
    const s = newCamp(def);
    walkTo(s, def, 'personne');
    expect(s.goal).toBeNull();
  });
});

describe('l\'objet proche', () => {
  it('rien loin de tout, le plus proche dans son rayon, jamais le feu', () => {
    expect(nearestObject(placed(330, 300), def, ALL)).toBeNull();
    const l = at('lantern');
    const c = at('cream');
    expect(nearestObject(placed(l.stand[0], l.stand[1]), def, ALL)).toBe('lantern');
    expect(nearestObject(placed(c.stand[0], c.stand[1]), def, ALL)).toBe('cream');
    const f = at('fire');
    expect(nearestObject(placed(f.stand[0], f.stand[1]), def, new Set(['fire']))).toBeNull();
  });

  it('un objet caché ne compte pas', () => {
    const m = at('memories');
    expect(nearestObject(placed(m.stand[0], m.stand[1]), def, ALL)).toBe('memories');
    expect(nearestObject(placed(m.stand[0], m.stand[1]), def, new Set(['door', 'altar']))).not.toBe('memories');
  });
});
