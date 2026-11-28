import { describe, expect, it } from 'vitest';
import { POI_GLYPHS } from '../../src/ui/minimap.ts';

describe('les icônes de la mini-carte', () => {
  it('sont des carrés de 7 points, sans autre signe que # + .', () => {
    for (const [kind, glyph] of Object.entries(POI_GLYPHS)) {
      expect(glyph.rows, kind).toHaveLength(7);
      for (const row of glyph.rows) expect(row, kind).toMatch(/^[#+.]{7}$/);
    }
  });

  it('se distinguent toutes : pas deux lieux avec le même dessin et la même couleur', () => {
    const seen = new Set<string>();
    for (const glyph of Object.values(POI_GLYPHS)) {
      const key = `${glyph.rows.join('/')}|${glyph.main}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
