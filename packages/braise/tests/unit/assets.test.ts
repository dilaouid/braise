import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { data } from './helpers.ts';

const assets = join(__dirname, '..', '..', 'assets');
const sprites = join(assets, 'sprites');
const publicDir = join(__dirname, '..', '..', 'public');

/** La palette fermée du document 10 §3. */
const PALETTE = [
  '#0b0f1a', '#131c2e', '#1d2b44', '#2c3e5c',
  '#2a2d3a', '#454a5c', '#6b7285', '#9aa3b5', '#c9d1dc', '#eef2f6',
  '#fff1c2', '#ffd166', '#ffb020', '#fb7a0c', '#d9480f', '#8f1d0a',
  '#ff3d81', '#c2185b', '#7a1048',
  '#b8fff0', '#4fe0c8', '#1f9e96',
  '#3d5a3a', '#5f8a4e', '#9cc46a',
  '#f2c9a0', '#c98b5e', '#7a4a2e', '#4a2c1c',
  '#dff6ff', '#7fd4ff', '#f6f08a',
];

const files = existsSync(sprites) ? readdirSync(sprites).filter((f) => f.endsWith('.png')) : [];

describe('assets (documents 10 et 11)', () => {
  it('la palette a 32 couleurs', () => {
    expect(new Set(PALETTE).size).toBe(32);
    const png = PNG.sync.read(readFileSync(join(assets, 'palette.png')));
    expect(png.width).toBe(32);
    expect(png.height).toBe(1);
  });

  it('aucun pixel d\'un sprite livré n\'est hors de la palette, et la transparence est tout ou rien', () => {
    expect(files.length).toBeGreaterThan(50);
    const allowed = new Set(PALETTE.map((h) => parseInt(h.slice(1), 16)));
    for (const file of files) {
      const png = PNG.sync.read(readFileSync(join(sprites, file)));
      for (let i = 0; i < png.data.length; i += 4) {
        const a = png.data[i + 3]!;
        if (a === 0) continue;
        expect(a, `${file} : transparence partielle`).toBe(255);
        const rgb = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
        if (!allowed.has(rgb)) throw new Error(`${file} : couleur hors palette #${rgb.toString(16).padStart(6, '0')}`);
      }
    }
  });

  it('chaque sprite gardé a son entrée dans provenance.yaml', () => {
    const yaml = readFileSync(join(assets, 'provenance.yaml'), 'utf8');
    for (const file of files) expect(yaml.includes(`- file: sprites/${file}`), file).toBe(true);
  });

  it('l\'atlas contient chaque sprite cité par les données', () => {
    const atlas = JSON.parse(readFileSync(join(publicDir, 'atlas', 'atlas.json'), 'utf8')) as {
      frames: Record<string, unknown>;
      anims: Record<string, number>;
    };
    const has = (name: string): boolean => name in atlas.frames || name in atlas.anims;
    const need: string[] = [];
    for (const w of data.weapons) need.push(w.icon);
    for (const r of data.relics) need.push(r.icon);
    for (const e of data.enemies) need.push(e.sprite);
    for (const a of data.altar) need.push(a.icon);
    for (const p of data.lantern.pieces) need.push(p.icon);
    need.push('pickup-lantern-piece', 'lantern-frame', 'lantern-face-closed');
    for (const region of Object.values(data.regions)) {
      for (let mask = 0; mask < 16; mask++) need.push(`${region.tileset}-${mask}`);
      for (const d of region.decor) need.push(d.sprite);
      need.push(region.borderDecor);
    }
    for (const c of Object.values(data.classes)) {
      need.push(c.skill.icon, c.ultimate.icon);
      for (let d = 0; d < 8; d++) need.push(`${c.sprite}-walk-${d}`, `${c.sprite}-idle-${d}`, `${c.sprite}-rot-${d}`);
    }
    need.push('pickup-gem-small', 'pickup-gem-medium', 'pickup-gem-large', 'pickup-gem-red', 'pickup-gold', 'pickup-ash', 'pickup-drop',
      'pickup-coffre', 'pickup-call', 'shot-spark', 'shot-arrow', 'shot-brand', 'shot-enemy', 'fx-flame', 'fx-puff', 'fx-firefly',
      'font-digits', 'ui-arrow', 'poi-brasero', 'poi-source', 'poi-cache', 'poi-portail', 'icon-gold', 'icon-ashes', 'icon-flask', 'icon-dash');
    // La carte vivante : lieux, buffs de totem, trouvailles, services de l'Herboriste.
    need.push('poi-totem', 'poi-ferrailleur', 'poi-herboriste', 'poi-tresor',
      'icon-boon-wisdom', 'icon-boon-stride', 'icon-boon-glow', 'icon-boon-edge', 'icon-boon-breath', 'icon-boon-vein',
      'icon-find-boots', 'icon-find-lantern-glass', 'icon-find-holed-coin', 'icon-find-purse', 'icon-find-notebook', 'icon-find-scarf',
      'icon-find-flask', 'icon-find-cards', 'icon-find-flint', 'icon-find-winder', 'icon-find-blanket', 'icon-find-door-nail',
      'icon-service-flask', 'icon-service-balm', 'icon-service-reroll', 'icon-service-banish');
    // Le tutoriel avec Cream : le chat, les poses de Moon, les portraits, le donjon, les bulles.
    for (let d = 0; d < 8; d++) need.push(`cream-walk-${d}`);
    need.push('cream-sit', 'cream-pose-laugh', 'cream-pose-groom', 'cream-pose-scratch', 'cream-pose-rise',
      'hero-lame-cendre-pose-startle', 'hero-lame-cendre-pose-think', 'hero-lame-cendre-pose-laugh');
    for (const face of ['neutral', 'think', 'surprised', 'shocked', 'laugh', 'awkward', 'sad', 'resolute']) need.push(`face-moon-${face}`);
    for (const face of ['neutral', 'smug', 'serious', 'laugh', 'closed', 'surprised']) need.push(`face-cream-${face}`);
    for (let mask = 0; mask < 16; mask++) need.push(`tile-cave-${mask}`);
    need.push('boss-guetteur', 'decor-mur-cave', 'fx-barriere-fumee', 'decor-eteints-endormis', 'camp-cream',
      'emote-exclaim', 'emote-question', 'emote-dots', 'emote-drop', 'emote-note');
    // Les Souvenirs : la gemme que le boss laisse.
    need.push('poi-souvenir');
    for (const name of need) expect(has(name), `image manquante dans l'atlas : ${name}`).toBe(true);
  });

  it('la gemme du Souvenir est une image seule, nettement plus grande que les gemmes d\'expérience', () => {
    const atlas = JSON.parse(readFileSync(join(publicDir, 'atlas', 'atlas.json'), 'utf8')) as {
      frames: Record<string, { w: number; h: number }>;
    };
    const gem = atlas.frames['poi-souvenir'];
    expect(gem, 'poi-souvenir').toBeDefined();
    expect(Math.min(gem!.w, gem!.h)).toBeGreaterThanOrEqual(2 * atlas.frames['pickup-gem-large']!.h);
  });

  it('les sons du Souvenir existent', () => {
    const index = JSON.parse(readFileSync(join(publicDir, 'audio', 'index.json'), 'utf8')) as Record<string, string>;
    for (const name of ['sfx-memory', 'sfx-memory-rire']) {
      expect(index[name], name).toBeDefined();
      expect(existsSync(join(publicDir, 'audio', index[name]!)), name).toBe(true);
    }
  });

  it('les portraits du dialogue ont tous la même taille, et les poses fixes ne sont pas des bandes', () => {
    const atlas = JSON.parse(readFileSync(join(publicDir, 'atlas', 'atlas.json'), 'utf8')) as {
      frames: Record<string, { w: number; h: number }>;
      anims: Record<string, number>;
    };
    const faces = Object.keys(atlas.frames).filter((n) => n.startsWith('face-'));
    expect(faces.length).toBe(14);
    for (const n of faces) expect([atlas.frames[n]!.w, atlas.frames[n]!.h], n).toEqual([64, 64]);
    // Une pose est lue par `atlas.get` : elle doit être une image seule.
    for (const n of ['cream-sit', 'cream-pose-laugh', 'cream-pose-groom', 'cream-pose-scratch', 'cream-pose-rise',
      'hero-lame-cendre-pose-startle', 'hero-lame-cendre-pose-think', 'hero-lame-cendre-pose-laugh']) {
      expect(n in atlas.frames, n).toBe(true);
    }
    for (let d = 0; d < 8; d++) expect(atlas.anims[`cream-walk-${d}`], `cream-walk-${d}`).toBe(8);
  });

  it('les sons du tutoriel existent', () => {
    const index = JSON.parse(readFileSync(join(publicDir, 'audio', 'index.json'), 'utf8')) as Record<string, string>;
    for (const name of ['sfx-talk-moon', 'sfx-talk-cream', 'sfx-surprise', 'sfx-gate']) {
      expect(index[name], name).toBeDefined();
      expect(existsSync(join(publicDir, 'audio', index[name]!)), name).toBe(true);
    }
  });

  it('chaque ennemi animé a de 2 à 8 images, toutes de la même taille', () => {
    for (const file of files) {
      const m = /^(enemy|elite|boss)-.*@(\d+)\.png$/.exec(file);
      if (!m) continue;
      const frames = Number(m[2]);
      expect(frames).toBeGreaterThanOrEqual(2);
      expect(frames).toBeLessThanOrEqual(8);
      const png = PNG.sync.read(readFileSync(join(sprites, file)));
      expect(png.width % frames, file).toBe(0);
    }
  });

  it('les musiques de la région existent', () => {
    const index = JSON.parse(readFileSync(join(publicDir, 'audio', 'index.json'), 'utf8')) as Record<string, string>;
    for (const region of Object.values(data.regions)) {
      expect(index[region.music.calm], region.music.calm).toBeDefined();
      expect(index[region.music.boss], region.music.boss).toBeDefined();
    }
    for (const file of Object.values(index)) expect(existsSync(join(publicDir, 'audio', file)), file).toBe(true);
  });
});
