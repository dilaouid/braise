import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { CINEMATICS_RAW, INTRO_RAW, assetFrames, cinematicDuration, compileCinematic } from '../../src/content/cinematic.ts';
import { RAW } from '../../src/content/index.ts';

const publicDir = join(__dirname, '..', '..', 'public');
const sounds = new Set(Object.keys(JSON.parse(readFileSync(join(publicDir, 'audio', 'index.json'), 'utf8')) as Record<string, string>));

/** La palette fermée du document 10 §3. */
const PALETTE = new Set([
  '#0b0f1a', '#131c2e', '#1d2b44', '#2c3e5c', '#2a2d3a', '#454a5c', '#6b7285', '#9aa3b5', '#c9d1dc', '#eef2f6',
  '#fff1c2', '#ffd166', '#ffb020', '#fb7a0c', '#d9480f', '#8f1d0a', '#ff3d81', '#c2185b', '#7a1048',
  '#b8fff0', '#4fe0c8', '#1f9e96', '#3d5a3a', '#5f8a4e', '#9cc46a', '#f2c9a0', '#c98b5e', '#7a4a2e', '#4a2c1c',
  '#dff6ff', '#7fd4ff', '#f6f08a',
].map((h) => parseInt(h.slice(1), 16)));

describe('cinématique d\'intro (document 15)', () => {
  const { cinematic, errors } = compileCinematic(INTRO_RAW, RAW.fr, sounds);

  it('est valide : images, textes, temps et sons connus', () => {
    expect(errors).toEqual([]);
    expect(cinematic).not.toBeNull();
  });

  it('dure entre 95 et 120 secondes', () => {
    const d = cinematicDuration(cinematic!);
    expect(d).toBeGreaterThanOrEqual(95);
    expect(d).toBeLessThanOrEqual(120);
  });

  it('se passe en maintenant B au moins une demi-seconde', () => {
    expect(cinematic!.skipHoldMs).toBeGreaterThanOrEqual(500);
  });

  it('a un seul carton, et une ligne de récit par illustration', () => {
    const cards = cinematic!.shots.filter((s) => s.card).map((s) => RAW.fr[s.card!]);
    expect(cards).toEqual(['Un an plus tard.']);
    const silent = cinematic!.shots.filter((s) => s.layers.some((l) => l.type === 'image') && !s.caption).map((s) => s.id);
    expect(silent).toEqual([]);
  });

  it('chaque ligne de récit tient en deux lignes de 80 caractères, et laisse le temps de la lire', () => {
    for (const shot of cinematic!.shots) {
      if (!shot.caption) continue;
      const text = RAW.fr[shot.caption]!;
      expect(text.length, shot.id).toBeLessThanOrEqual(160);
      const visible = shot.duration - (shot.fadeOut ?? 0) - (shot.captionAt ?? 0.8);
      expect(visible, `${shot.id} : ${text}`).toBeGreaterThanOrEqual(3 + text.length / 20);
    }
  });

  it('ne dit rien de ce que Cream est (document 14 §6)', () => {
    const all = cinematic!.shots.filter((s) => s.caption).map((s) => RAW.fr[s.caption!]).join(' ');
    expect(all).not.toMatch(/ombre|parl|deux mondes/i);
  });

  it('chaque image est construite, de la bonne taille, et dans la palette', () => {
    for (const name of Object.keys(cinematic!.assets)) {
      const file = join(publicDir, 'cinematics', 'intro', `${name}.png`);
      expect(existsSync(file), `${name}.png manquant : lancer node tools/build-cinematic.mjs`).toBe(true);
      const png = PNG.sync.read(readFileSync(file));
      expect(png.width % assetFrames(cinematic!, name), `${name} : largeur non divisible`).toBe(0);
      for (let i = 0; i < png.data.length; i += 4) {
        const a = png.data[i + 3]!;
        if (a === 0) continue;
        expect(a, `${name} : transparence partielle`).toBe(255);
        const rgb = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
        if (!PALETTE.has(rgb)) throw new Error(`${name} : couleur hors palette #${rgb.toString(16).padStart(6, '0')}`);
      }
    }
  });

  it('refuse une image inconnue, un texte manquant et un signal hors du plan', () => {
    const raw = structuredClone(INTRO_RAW) as { shots: Array<Record<string, unknown>> };
    raw.shots[1]!.layers = [{ type: 'image', asset: 'nulle-part', at: [0, 0] }];
    raw.shots[0]!.card = 'cle.absente';
    raw.shots[2]!.cues = [{ at: 99, sfx: 'intro-miaou' }];
    const res = compileCinematic(raw, RAW.fr, sounds);
    expect(res.cinematic).toBeNull();
    expect(res.errors.join('\n')).toMatch(/nulle-part/);
    expect(res.errors.join('\n')).toMatch(/cle\.absente/);
    expect(res.errors.join('\n')).toMatch(/99 s/);
  });
});

describe('scène de souvenir « La rencontre »', () => {
  const { cinematic, errors } = compileCinematic(CINEMATICS_RAW['memory-meeting'], RAW.fr, sounds);

  it('est valide, et son rire est un son connu', () => {
    expect(errors).toEqual([]);
    const sfx = cinematic!.shots.flatMap((s) => s.cues ?? []).map((c) => c.sfx).filter(Boolean);
    expect(sfx).toContain('memory-rire');
    expect(sounds.has('sfx-memory-rire')).toBe(true);
  });

  it('a quatre illustrations plein écran, construites et dans la palette', () => {
    expect(Object.keys(cinematic!.assets)).toEqual(['ill-01', 'ill-02', 'ill-03', 'ill-04']);
    for (const name of Object.keys(cinematic!.assets)) {
      const file = join(publicDir, 'cinematics', 'memory-meeting', `${name}.png`);
      expect(existsSync(file), `${name}.png manquant : lancer node tools/build-cinematic.mjs memory-meeting`).toBe(true);
      const png = PNG.sync.read(readFileSync(file));
      expect([png.width, png.height], name).toEqual([640, 360]);
      for (let i = 0; i < png.data.length; i += 4) {
        expect(png.data[i + 3], `${name} : image non opaque`).toBe(255);
        const rgb = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
        if (!PALETTE.has(rgb)) throw new Error(`${name} : couleur hors palette #${rgb.toString(16).padStart(6, '0')}`);
      }
    }
  });
});
