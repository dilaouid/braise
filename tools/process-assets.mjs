/**
 * Du générateur au jeu (document 11 §7) :
 *   assets/source/…  →  mise à la palette de 32 couleurs  →  assets/sprites/…
 * Dessine aussi les petits sprites faits à la main (gemmes, projectiles, chiffres)
 * et écrit assets/palette.png et assets/provenance.yaml.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise', 'assets');
const source = join(root, 'source');
const out = join(root, 'sprites');
const manifest = JSON.parse(readFileSync(join(root, 'pixellab.json'), 'utf8'));

/** La palette fermée du document 10 §3. */
export const PALETTE = [
  '#0b0f1a', '#131c2e', '#1d2b44', '#2c3e5c',
  '#2a2d3a', '#454a5c', '#6b7285', '#9aa3b5', '#c9d1dc', '#eef2f6',
  '#fff1c2', '#ffd166', '#ffb020', '#fb7a0c', '#d9480f', '#8f1d0a',
  '#ff3d81', '#c2185b', '#7a1048',
  '#b8fff0', '#4fe0c8', '#1f9e96',
  '#3d5a3a', '#5f8a4e', '#9cc46a',
  '#f2c9a0', '#c98b5e', '#7a4a2e', '#4a2c1c',
  '#dff6ff', '#7fd4ff', '#f6f08a',
];
const RGB = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

function nearest(r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < RGB.length; i++) {
    const c = RGB[i];
    // Distance pondérée : l'œil est plus sensible au vert, puis au rouge.
    const d = 3 * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 + 2 * (b - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return RGB[best];
}

/** Ramène une image à la palette. La transparence devient tout ou rien. */
function quantize(png) {
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
    } else {
      const c = nearest(d[i], d[i + 1], d[i + 2]);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  return png;
}

function read(file) {
  return PNG.sync.read(readFileSync(file));
}

function write(name, png) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${name}.png`), PNG.sync.write(png));
}

/** Assemble des images de même taille en une bande horizontale. */
function strip(frames) {
  const w = frames[0].width;
  const h = frames[0].height;
  const png = new PNG({ width: w * frames.length, height: h });
  frames.forEach((f, i) => {
    if (f.width !== w || f.height !== h) throw new Error('Images de tailles différentes dans une animation');
    PNG.bitblt(f, png, 0, 0, w, h, i * w, 0);
  });
  return png;
}

function crop(png, x, y, w, h) {
  const res = new PNG({ width: w, height: h });
  PNG.bitblt(png, res, x, y, w, h, 0, 0);
  return res;
}

function framesIn(dir) {
  return readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).sort().map((f) => quantize(read(join(dir, f))));
}

const provenance = [];
const today = manifest.date;

function record(file, tool, id, prompt, settings, edits, date) {
  provenance.push({ file, tool, id, prompt, settings, edits, date });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ───────────── La palette ─────────────
{
  const png = new PNG({ width: PALETTE.length, height: 1 });
  RGB.forEach((c, i) => {
    png.data[i * 4] = c[0]; png.data[i * 4 + 1] = c[1]; png.data[i * 4 + 2] = c[2]; png.data[i * 4 + 3] = 255;
  });
  writeFileSync(join(root, 'palette.png'), PNG.sync.write(png));
}

// ───────────── Les héros : huit directions ─────────────
const DIRS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
for (const c of manifest.characters) {
  const base = join(source, c.name);
  if (!existsSync(base)) continue;
  const state = readdirSync(base).find((d) => existsSync(join(base, d, 'rotations')));
  if (!state) continue;
  DIRS.forEach((dir, i) => {
    write(`${c.name}-rot-${i}`, quantize(read(join(base, state, 'rotations', `${dir}.png`))));
    record(`sprites/${c.name}-rot-${i}.png`, c.tool, c.id, c.prompt, c.settings, 'palette réduite');
  });
  for (const anim of Object.keys(c.animations)) {
    DIRS.forEach((dir, i) => {
      const dirPath = join(base, state, 'animations', anim, dir);
      if (!existsSync(dirPath)) return;
      const frames = framesIn(dirPath);
      write(`${c.name}-${anim}-${i}@${frames.length}`, strip(frames));
      record(`sprites/${c.name}-${anim}-${i}@${frames.length}.png`, 'animate_character', c.id, `${c.animations[anim]} (${dir})`, c.settings, 'palette réduite ; images assemblées en bande');
    });
  }
  // Les poses : une image fixe, prise dans une animation (ou une rotation) du personnage.
  // « crop » ramène une image d'animation v3, stockée sur une toile plus grande, au cadrage du sprite.
  for (const [name, p] of Object.entries(c.poses ?? {})) {
    const file = p.rotation
      ? join(base, state, 'rotations', `${p.rotation}.png`)
      : join(base, state, 'animations', p.animation, p.direction, `frame_${String(p.frame).padStart(3, '0')}.png`);
    if (!existsSync(file)) continue;
    let png = quantize(read(file));
    if (p.crop) png = crop(png, ...p.crop);
    write(name, png);
    const from = p.rotation ? `rotation ${p.rotation}` : `animation « ${p.animation} », ${p.direction}, image ${p.frame}`;
    record(`sprites/${name}.png`, p.rotation ? c.tool : 'animate_character', c.id, p.prompt, c.settings, `palette réduite ; ${from}${p.crop ? ` ; recadrée (${p.crop.join(', ')})` : ''}`);
  }
}

/**
 * Efface la bande d'eau plate que le générateur pose parfois sous un personnage, d'un bord à l'autre de l'image :
 * depuis les bords gauche, droit et bas, à partir de la ligne `fromRow`, on retire de proche en proche les pixels
 * bleu sombre. Les remous clairs et le personnage arrêtent l'effacement.
 */
function clearBand(png, fromRow) {
  const { width: w, height: h, data } = png;
  const band = (i) => data[i * 4 + 3] !== 0 && data[i * 4] < 45 && data[i * 4 + 1] >= 35 && data[i * 4 + 1] <= 80 && data[i * 4 + 2] >= 50 && data[i * 4 + 2] <= 100;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (x < 0 || y < fromRow || x >= w || y >= h || seen[i] || !band(i)) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let y = fromRow; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  for (let x = 0; x < w; x++) push(x, h - 1);
  while (stack.length) {
    const i = stack.pop();
    data[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return png;
}

// ───────────── Les objets : ennemis, décors, points d'intérêt ─────────────
for (const o of manifest.objects) {
  const base = join(source, o.name);
  if (!existsSync(base)) continue;
  const animRoot = join(base, 'animations');
  const settings = { width: o.size[0], height: o.size[1], view: o.view ?? 'low top-down' };
  if (o.animated && existsSync(animRoot)) {
    const anim = readdirSync(animRoot)[0];
    const dir = readdirSync(join(animRoot, anim))[0];
    // `skip` : les images de tête écartées (la pose de départ, que le générateur range avant celles qu'il anime).
    const frames = framesIn(join(animRoot, anim, dir)).slice(o.skip ?? 0);
    if (o.clearBand) for (const f of frames) clearBand(f, o.clearBand.fromRow);
    write(`${o.name}@${frames.length}`, strip(frames));
    record(`sprites/${o.name}@${frames.length}.png`, 'create_map_object + animate_object', o.id, o.prompt, settings, `palette réduite ; ${o.clearBand ? 'bande d\'eau du bas effacée ; ' : ''}images assemblées en bande`, o.date);
  } else {
    const rot = join(base, 'rotations');
    const file = readdirSync(rot)[0];
    write(o.name, quantize(read(join(rot, file))));
    record(`sprites/${o.name}.png`, 'create_map_object', o.id, o.prompt, settings, 'palette réduite', o.date);
  }
}

// ───────────── Les clips d'annonce : une bande par clip ─────────────
/** Retire les poussières de moins de `max` pixels, sauf la plus grande forme : le générateur sème parfois des points isolés. */
function despeckle(png, max) {
  const { width: w, height: h, data } = png;
  const seen = new Uint8Array(w * h);
  const parts = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % w;
      const y = (c - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!seen[n] && data[n * 4 + 3] !== 0) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    parts.push(cells);
  }
  const biggest = parts.reduce((a, b) => (b.length > a.length ? b : a), []);
  for (const cells of parts) {
    if (cells === biggest || cells.length >= max) continue;
    for (const c of cells) data[c * 4 + 3] = 0;
  }
  return png;
}

for (const c of manifest.clips ?? []) {
  const dir = join(source, 'clips', c.name);
  if (!existsSync(dir)) continue;
  const frames = framesIn(dir).slice(c.skip ?? 0).filter((_, i) => !(c.drop ?? []).includes(i)).map((f) => despeckle(f, c.despeckle ?? 16));
  write(`${c.name}@${frames.length}`, strip(frames));
  record(`sprites/${c.name}@${frames.length}.png`, 'animate_image', c.id, c.prompt, { width: frames[0].width, height: frames[0].height, frames: c.frames, skipped: c.skip ?? 0, dropped: c.drop ?? [] }, 'palette réduite ; poussières isolées retirées ; images assemblées en bande', c.date);
}

// ───────────── Le sol : seize tuiles nommées par leurs coins ─────────────
for (const t of manifest.tilesets) {
  const base = join(source, t.name);
  if (!existsSync(base)) continue;
  const sheet = quantize(read(join(base, 'tileset.png')));
  const meta = JSON.parse(readFileSync(join(base, 'metadata.json'), 'utf8'));
  for (const tile of meta.tileset_data.tiles) {
    const c = tile.corners;
    const bit = (v) => (v === 'upper' ? 1 : 0);
    // Masque : nord-ouest 8, nord-est 4, sud-ouest 2, sud-est 1 (1 = terrain « haut », le chemin).
    const mask = bit(c.NW) * 8 + bit(c.NE) * 4 + bit(c.SW) * 2 + bit(c.SE);
    const b = tile.bounding_box;
    write(`${t.name}-${mask}`, crop(sheet, b.x, b.y, b.width, b.height));
    record(`sprites/${t.name}-${mask}.png`, t.tool, t.id, t.prompt, t.settings, 'palette réduite ; tuile découpée');
  }
}

// ───────────── Les icônes, les portraits et les images seules ─────────────
/**
 * Fait onduler une image fixe : chaque ligne glisse d'un pixel au plus, en une vague qui monte.
 * Le bas de l'image ne bouge pas. Donne une petite animation sans rien redessiner.
 */
function wobble(png, count) {
  const frames = [];
  for (let f = 0; f < count; f++) {
    const res = new PNG({ width: png.width, height: png.height });
    for (let y = 0; y < png.height; y++) {
      const amp = Math.min(1.4, (png.height - 1 - y) / 8);
      const dx = Math.round(Math.sin(y / 4 + (f / count) * Math.PI * 2) * amp);
      for (let x = 0; x < png.width; x++) {
        const sx = x - dx;
        if (sx < 0 || sx >= png.width) continue;
        png.data.copy(res.data, (y * png.width + x) * 4, (y * png.width + sx) * 4, (y * png.width + sx) * 4 + 4);
      }
    }
    frames.push(res);
  }
  return frames;
}

for (const img of manifest.images) {
  const file = join(source, 'images', `${img.name}.png`);
  if (!existsSync(file)) continue;
  const png = quantize(read(file));
  const tool = img.tool ?? 'create_image_pixen';
  const settings = img.settings ?? { no_background: true };
  if (img.remap) {
    // Une couleur de la palette en remplace une autre, là où la mise à la palette a mal choisi.
    const hex = (i) => `#${[0, 1, 2].map((c) => png.data[i + c].toString(16).padStart(2, '0')).join('')}`;
    for (let i = 0; i < png.data.length; i += 4) {
      const to = png.data[i + 3] ? img.remap[hex(i)] : undefined;
      if (!to) continue;
      if (!PALETTE.includes(to)) throw new Error(`${img.name} : ${to} n'est pas dans la palette`);
      for (let c = 0; c < 3; c++) png.data[i + c] = parseInt(to.slice(1 + c * 2, 3 + c * 2), 16);
    }
    write(img.name, png);
    const pairs = Object.entries(img.remap).map(([a, b]) => `${a} → ${b}`).join(', ');
    record(`sprites/${img.name}.png`, tool, img.id, img.prompt, settings, `palette réduite ; couleurs remplacées (${pairs})`, img.date);
  } else if (img.wobble) {
    write(`${img.name}@${img.wobble}`, strip(wobble(png, img.wobble)));
    record(`sprites/${img.name}@${img.wobble}.png`, tool, img.id, img.prompt, settings, `palette réduite ; ${img.wobble} images faites par ondulation des lignes (tools/process-assets.mjs)`, img.date);
  } else {
    write(img.name, png);
    record(`sprites/${img.name}.png`, tool, img.id, img.prompt, settings, 'palette réduite', img.date);
  }
}

/** La porte du refuge, ouverte : le battant est rabattu à gauche, et derrière il fait nuit. */
{
  const shut = PNG.sync.read(readFileSync(join(out, 'camp-door.png')));
  const REDS = new Set(['#8f1d0a', '#d9480f', '#fb7a0c', '#7a1048', '#c2185b']);
  const hexAt = (x, y) => {
    const i = (y * shut.width + x) * 4;
    return shut.data[i + 3] ? `#${[0, 1, 2].map((c) => shut.data[i + c].toString(16).padStart(2, '0')).join('')}` : '';
  };
  let x0 = shut.width, x1 = 0, y0 = shut.height, y1 = 0;
  for (let y = 0; y < shut.height; y++) {
    for (let x = 0; x < shut.width; x++) {
      if (!REDS.has(hexAt(x, y))) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const open = PNG.sync.read(PNG.sync.write(shut));
  const leaf = Math.max(6, Math.round((x1 - x0) * 0.28));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const to = (y * open.width + x) * 4;
      if (x - x0 < leaf) {
        // Le battant, vu de biais : ses colonnes sont resserrées.
        const from = (y * shut.width + x0 + Math.round(((x - x0) / leaf) * (x1 - x0))) * 4;
        shut.data.copy(open.data, to, from, from + 4);
      } else {
        const night = x - x0 === leaf ? '#0b0f1a' : y > y1 - 10 ? '#1d2b44' : '#131c2e';
        for (let c = 0; c < 3; c++) open.data[to + c] = parseInt(night.slice(1 + c * 2, 3 + c * 2), 16);
        open.data[to + 3] = 255;
      }
    }
  }
  write('camp-door-open', open);
  record('sprites/camp-door-open.png', 'dérivé de sprites/camp-door.png (tools/process-assets.mjs)', null, null, null, 'battant rabattu, intérieur en nuit', '2026-11-24');
}

// ───────────── Les sprites dessinés à la main ─────────────
const INK = {
  '.': null,
  k: '#0b0f1a', K: '#131c2e', D: '#2a2d3a', d: '#454a5c', g: '#6b7285', G: '#9aa3b5', h: '#c9d1dc', w: '#eef2f6',
  Y: '#fff1c2', y: '#ffd166', o: '#ffb020', O: '#fb7a0c', r: '#d9480f', R: '#8f1d0a',
  m: '#ff3d81', M: '#c2185b', N: '#7a1048',
  T: '#b8fff0', t: '#4fe0c8', q: '#1f9e96',
  b: '#7a4a2e', B: '#c98b5e', n: '#4a2c1c',
  c: '#7fd4ff', C: '#dff6ff',
};

function draw(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Ligne ${y} de largeur ${rows[y].length} au lieu de ${w} : ${rows[y]}`);
    for (let x = 0; x < w; x++) {
      const hex = INK[rows[y][x]];
      if (hex === undefined) throw new Error(`Encre inconnue « ${rows[y][x]} »`);
      if (!hex) continue;
      const i = (y * w + x) * 4;
      png.data[i] = parseInt(hex.slice(1, 3), 16);
      png.data[i + 1] = parseInt(hex.slice(3, 5), 16);
      png.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      png.data[i + 3] = 255;
    }
  }
  return png;
}

function hand(name, frames) {
  const list = Array.isArray(frames[0]) ? frames : [frames];
  const pngs = list.map(draw);
  write(pngs.length > 1 ? `${name}@${pngs.length}` : name, pngs.length > 1 ? strip(pngs) : pngs[0]);
  provenance.push({ file: `sprites/${name}${pngs.length > 1 ? `@${pngs.length}` : ''}.png`, tool: 'dessiné à la main (tools/process-assets.mjs)', id: null, prompt: null, settings: null, edits: null });
}

hand('pickup-gem-small', [
  '...kk...',
  '..kTtk..',
  '.kTttqk.',
  '.kttqqk.',
  '..ktqk..',
  '...kk...',
  '........',
  '........',
]);
hand('pickup-gem-medium', [
  '....kk....',
  '...kTTk...',
  '..kTTttk..',
  '.kTTtttqk.',
  '.kTttttqk.',
  '.kttttqqk.',
  '..kttqqk..',
  '...ktqk...',
  '....kk....',
  '..........',
]);
hand('pickup-gem-large', [
  '.....kk.....',
  '....kTTk....',
  '...kTTTtk...',
  '..kTTTtttk..',
  '.kTTTttttqk.',
  '.kTTtttttqk.',
  '.kTttttqqqk.',
  '.kttttqqqqk.',
  '..kttqqqqk..',
  '...ktqqqk...',
  '....kqqk....',
  '.....kk.....',
]);
hand('pickup-gem-red', [
  '.....kk.....',
  '....kYYk....',
  '...kYYyok...',
  '..kYYyooOk..',
  '.kYYyoooOrk.',
  '.kYyooooOrk.',
  '.kyooooOOrk.',
  '.koooOOOrrk.',
  '..koOOOrrk..',
  '...kOOrrk...',
  '....kOrk....',
  '.....kk.....',
]);
hand('pickup-gold', [
  '..kkkk..',
  '.kyYYyk.',
  'kyYyyyok',
  'kyYyoyok',
  'kyyyoyok',
  'kyyyyook',
  '.kooook.',
  '..kkkk..',
]);
hand('pickup-ash', [
  '........',
  '...kk...',
  '..khhk..',
  '.khGOgk.',
  '.khGGgk.',
  'khGGgggk',
  'kGGggddk',
  '.kkkkkk.',
]);
hand('pickup-drop', [
  '....kk....',
  '...kYyk...',
  '...kYyk...',
  '..kYyook..',
  '..kyyoOk..',
  '.kYyooOrk.',
  '.kyyoOOrk.',
  '.kyoOOrrk.',
  '..koOrrk..',
  '...kkkk...',
]);
// Les petits signes des effets de la Lanterne.
hand('sign-heart', [
  '.kkk...kkk.',
  'kmmmk.kmmmk',
  'kmwmmkmmmMk',
  'kmmmmmmmmMk',
  'kmmmmmmmMMk',
  '.kmmmmmMMk.',
  '..kmmmMMk..',
  '...kmMMk...',
  '....kMk....',
  '.....k.....',
]);
hand('sign-power', [
  '.........kk',
  '........kwk',
  '.......kwGk',
  '......kwGk.',
  '.....kwGk..',
  'kk..kwGk...',
  'kBkkwGk....',
  '.kBkGk.....',
  '..kBkk.....',
  '.kbkkBk....',
  'kbk..kk....',
  '.k.........',
]);
hand('sign-wisdom', [
  '.kkkk.kkkk.',
  'kwwwwkwwwwk',
  'kwGGwkwGGwk',
  'kwwwwkwwwwk',
  'kwGGwkwGGwk',
  'kwwwwkwwwwk',
  'kbbbbkbbbbk',
  '.kkkkkkkkk.',
]);
hand('sign-glow', [
  '....kkk....',
  '..kkyyykk..',
  '.kyyYYYyyk.',
  '.kyYwwwYyk.',
  'kyYwwwwwYyk',
  'kyYwwwwwYyk',
  'kyYwwwwwYyk',
  '.kyYwwwYyk.',
  '.kyyYYYyyk.',
  '..kkyyykk..',
  '....kkk....',
]);
hand('sign-crit', [
  '.....k.....',
  '....kYk....',
  '....kYk....',
  '.kk.kYk.kk.',
  '.kykkYkkyk.',
  '..kyYwYyk..',
  'kkkYwwwYkkk',
  'kYYwwwwwYYk',
  'kkkYwwwYkkk',
  '..kyYwYyk..',
  '.kykkYkkyk.',
  '.kk.kYk.kk.',
  '....kYk....',
  '.....k.....',
]);
hand('sign-hourglass', [
  'kkkkkkkkk',
  'kBBBBBBBk',
  '.kGwwwGk.',
  '.kGyyyGk.',
  '..kGyGk..',
  '...kyk...',
  '..kGyGk..',
  '.kGwywGk.',
  '.kGyyyGk.',
  'kBBBBBBBk',
  'kkkkkkkkk',
]);
hand('sign-horde', [
  '...kkkkk...',
  '..kdddddk..',
  '.kdgggggdk.',
  '.kdgmgmgdk.',
  '.kdgggggdk.',
  '..kdgggdk..',
  '.kkdddddkk.',
  'kdkkdddkkdk',
  'kk.kdddk.kk',
  '...kk.kk...',
]);
hand('sign-elite', [
  'k.........k',
  'kBk.....kBk',
  'kBBkkkkkBBk',
  '.kBwwwwwBk.',
  '..kwwwwwk..',
  '..kwkwkwk..',
  '..kwwwwwk..',
  '...kwkwk...',
  '...kwwwk...',
  '....kkk....',
]);
hand('sign-flame', [
  '....kk.....',
  '....kok....',
  '...kook....',
  '...koOkk...',
  '..koOOkok..',
  '.koOOyOOk..',
  '.kOOyyyOk..',
  'koOyYYyOOk.',
  'kOOyYwYyOk.',
  'kOOyYwYyOk.',
  '.kOOyyyOk..',
  '..kkkkkk...',
]);
hand('sign-next', [
  '..kkk....',
  '..kGGk...',
  '..kGGGk..',
  'kkkGGGGk.',
  'kGGGGGGGk',
  'kkkGGGGk.',
  '..kGGGk..',
  '..kGGk...',
  '..kkk....',
]);
hand('sign-prev', [
  '....kkk..',
  '...kGGk..',
  '..kGGGk..',
  '.kGGGGkkk',
  'kGGGGGGGk',
  '.kGGGGkkk',
  '..kGGGk..',
  '...kGGk..',
  '....kkk..',
]);
hand('sign-opposite', [
  '....k....',
  '...kGk...',
  '..kGGGk..',
  '.kGGGGGk.',
  '.kkkGkkk.',
  '...kGk...',
  '.kkkGkkk.',
  '.kGGGGGk.',
  '..kGGGk..',
  '...kGk...',
  '....k....',
]);
hand('sign-crown', [
  'kk...k...kk',
  'kyk.kyk.kyk',
  'kyykyyykyyk',
  'kyyyyyyyyyk',
  'kyYyyYyyYyk',
  'koooooooook',
  'kOOOOOOOOOk',
  'kkkkkkkkkkk',
]);
hand('sign-malus', [
  '..kkkkkk..',
  '.kMMMMMMk.',
  'kMmmmmmmMk',
  'kMmmmmmmMk',
  'kMwwwwwwMk',
  'kMwwwwwwMk',
  'kMmmmmmmMk',
  'kMmmmmmmMk',
  '.kMMMMMMk.',
  '..kkkkkk..',
]);
hand('sign-remove', [
  'kk.......kk',
  'kmk.....kmk',
  '.kmmk.kmmk.',
  '..kmmkmmk..',
  '...kmmmk...',
  '...kmmmk...',
  '..kmmkmmk..',
  '.kmmk.kmmk.',
  'kmk.....kmk',
  'kk.......kk',
]);
hand('sign-plus', [
  '..kkkk..',
  '..kttk..',
  'kkkttkkk',
  'kttttttk',
  'kttttttk',
  'kkkttkkk',
  '..kttk..',
  '..kkkk..',
]);
hand('pickup-lantern-piece', [
  '.....kk.....',
  '....kYYk....',
  '...kYYyyk...',
  '..kYYyyook..',
  '.kYYyyoooOk.',
  '.kYyyoooOOk.',
  '.kyyoooOOrk.',
  '..kooooOrk..',
  '...kooOrk...',
  '....kOrk....',
  '.....kk.....',
  '............',
]);
hand('pickup-call', [
  '.....kk.....',
  '....kTTk....',
  '....kTtk....',
  '...kTTttk...',
  '..kTTtttk.k.',
  '.kTTtttqkkTk',
  '.kTtwwtqktqk',
  'kTttwwttqqk.',
  'kTtttttqqk..',
  '.kttttqqk...',
  '..kkqqkk....',
  '....kk......',
]);
hand('shot-spark', [
  '..oOO...',
  '.oyyoO..',
  'oyYYyoO.',
  'oyYYyoO.',
  '.oyyoO..',
  '..oOO...',
  '........',
  '........',
]);
hand('shot-arrow', [
  '..........hk',
  'kbBBBBBBBhhw',
  '..........hk',
]);
hand('shot-brand', [
  '....yo....',
  '...yYyo...',
  '..oyYyoO..',
  '..oyyoOr..',
  '...oOOr...',
  '...kbbk...',
  '...kbnk...',
  '...kbnk...',
  '....kk....',
  '..........',
]);
hand('shot-enemy', [
  '..kkkkk..',
  '.kNMMMNk.',
  'kNMmmmMNk',
  'kMmwwmmMk',
  'kMmwmmmMk',
  'kMmmmmMNk',
  'kNMmmMNNk',
  '.kNMMNNk.',
  '..kkkkk..',
]);
// Le Marais : la boule de vase du Pêcheur (le bord magenta dit le danger), les sangsues, et les signes des états du héros.
hand('shot-vase', [
  '..kkkkk..',
  '.kMMMMMk.',
  'kMnnbnnMk',
  'kMnbBbnMk',
  'kMnbbnnMk',
  'kMnnnnnMk',
  'kMMnnnMMk',
  '.kMMMMMk.',
  '..kkkkk..',
]);
hand('enemy-sangsues', [
  [
    '............',
    '..kk....kk..',
    '.kDDk..kDDk.',
    '.kDmk...kDk.',
    '..kDk....kDk',
    '...kDk..kDmk',
    '....kk...kk.',
    '..kk........',
    '.kDDkk......',
    '.kmDDDk.....',
    '..kkkkk.....',
    '............',
  ],
  [
    '............',
    '.kk......kk.',
    'kDDk....kDDk',
    'kmDk....kDk.',
    '.kDk...kDk..',
    '.kDk...kmDk.',
    '..kk....kk..',
    '...kk.......',
    '..kDDkkk....',
    '..kDDDmk....',
    '...kkkkk....',
    '............',
  ],
]);
hand('sign-mire', [
  '....kk....',
  '...kqqk...',
  '..kqttqk..',
  '.kqtttqqk.',
  '.kqttqqqk.',
  'kDDqqqqDDk',
  'kDDDDDDDDk',
  '.kkkkkkkk.',
]);
hand('sign-drain', [
  '....k....',
  '...kmk...',
  '...kmk...',
  '..kmmmk..',
  '.kmwmmMk.',
  '.kmmmmMk.',
  '.kmmmMMk.',
  '..kMMMk..',
  '...kkk...',
]);
hand('sign-dim', [
  '...kkkk...',
  '..kggggk..',
  '.kgGGGGgk.',
  'kgGGddGGgk',
  'kgGddddGgk',
  'kgGddddGgk',
  'kgGGddGGgk',
  '.kgGGGGgk.',
  '..kggggk..',
  '...kkkk...',
]);
hand('sign-wade', [
  '..........',
  '.kk...kk..',
  'kttk.kttk.',
  'k..ktk..kk',
  '.kk...kk..',
  'kqqk.kqqk.',
  'k..kqk..kk',
  '..........',
]);
hand('sign-dodge', [
  'kk...kk...',
  'kyk..kyk..',
  '.kyk..kyk.',
  '..kyk..kyk',
  '.kyk..kyk.',
  'kyk..kyk..',
  'kk...kk...',
]);
hand('sign-lock', [
  '..kkkk..',
  '.kGGGGk.',
  'kGk..kGk',
  'kGk..kGk',
  'kkkkkkkk',
  'kyyyyyyk',
  'kyykkyyk',
  'kyykkyyk',
  'kyyyyyyk',
  'kkkkkkkk',
]);
hand('enemy-nuee', [
  [
    '............',
    '...k...k....',
    '..kGk.kgk...',
    '.kGhGkgGgk..',
    '..kGhGGgk...',
    '.kkGGmGgkk..',
    'kgGGmmGGgk..',
    '.kgGGGGgk...',
    '..kgGkgGk...',
    '..kgk.kgk...',
    '...k...k....',
    '............',
  ],
  [
    '............',
    '....k.k.....',
    '...kGkgk....',
    '.kkkGhGkkk..',
    'kGGhGGGGGgk.',
    '.kGGGmmGgk..',
    '.kgGGmGGgk..',
    'kgGGGGGGggk.',
    '.kkkgGgkkk..',
    '...kgkgk....',
    '....k.k.....',
    '............',
  ],
]);
hand('fx-firefly', [
  '..kkkk..',
  '.kyYYyk.',
  'kyYwwYyk',
  'kYwwwwYk',
  'kYwwwwYk',
  'kyYwwYyk',
  '.kyYYyk.',
  '..kkkk..',
]);
hand('fx-flame', [
  [
    '................',
    '.......o........',
    '......oyo.......',
    '......oyo...o...',
    '..o..oyYyo.oyo..',
    '.oyo.oyYyo.oyo..',
    '.oyo.oyYYyoyYo..',
    '.oyYooyYYyoyYo..',
    '..oyYyYYYYyYyo..',
    '..oyYYYwwYYYyo..',
    '..OoyYYwwYYyoO..',
    '..OooyYYYYyooO..',
    '...OOoyyyyoOO...',
    '....OOOooOOO....',
    '.....rrOOrr.....',
    '................',
  ],
  [
    '................',
    '........o.......',
    '.......oyo......',
    '...o...oyo......',
    '..oyo.oyYyo..o..',
    '..oyo.oyYyo.oyo.',
    '..oYyoyYYyo.oyo.',
    '..oYyoyYYyooYyo.',
    '..oyYyYYYYyYyo..',
    '..oyYYYwwYYYyo..',
    '..OoyYYwwYYyoO..',
    '..OooyYYYYyooO..',
    '...OOoyyyyoOO...',
    '....OOOooOOO....',
    '.....rrOOrr.....',
    '................',
  ],
  [
    '................',
    '......o.........',
    '......oyo.......',
    '.....oyYo....o..',
    '..o..oyYyo..oyo.',
    '.oyo.oyYyo..oyo.',
    '.oyYooyYYyooyYo.',
    '..oyYyyYYyoyYyo.',
    '..oyYYYYYYyYYo..',
    '..oyYYYwwYYYyo..',
    '..OoyYYwwYYyoO..',
    '..OooyYYYYyooO..',
    '...OOoyyyyoOO...',
    '....OOOooOOO....',
    '.....rrOOrr.....',
    '................',
  ],
  [
    '................',
    '.........o......',
    '.......oyo......',
    '..o....oyYo.....',
    '.oyo..oyYyo..o..',
    '.oyo..oyYyo.oyo.',
    '.oYyooyYYyooyYo.',
    '.oyYyoyYYyyYyo..',
    '..oYYyYYYYYYyo..',
    '..oyYYYwwYYYyo..',
    '..OoyYYwwYYyoO..',
    '..OooyYYYYyooO..',
    '...OOoyyyyoOO...',
    '....OOOooOOO....',
    '.....rrOOrr.....',
    '................',
  ],
]);
hand('fx-puff', [
  [
    '................',
    '................',
    '................',
    '................',
    '......hhh.......',
    '.....hGGGh......',
    '....hGGGGGh.....',
    '....hGGgGGh.....',
    '....hGGGGGh.....',
    '.....hGGGh......',
    '......hhh.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '.....hh..hh.....',
    '....hGGhhGGh....',
    '...hGGGGGGGGh...',
    '...hGGgggGGGh...',
    '..hGGgg..gGGGh..',
    '..hGGg....gGGh..',
    '..hGGg....gGGh..',
    '...hGGg..gGGh...',
    '...hGGGggGGGh...',
    '....hGGGGGGh....',
    '.....hhGGhh.....',
    '.......hh.......',
    '................',
    '................',
  ],
  [
    '................',
    '....gg....gg....',
    '...gGGg..gGGg...',
    '..gGg......gGg..',
    '..gg........gg..',
    '.gGg........gGg.',
    '.gg..........gg.',
    '................',
    '................',
    '.gg..........gg.',
    '.gGg........gGg.',
    '..gg........gg..',
    '..gGg......gGg..',
    '...gGGg..gGGg...',
    '....gg....gg....',
    '................',
  ],
  [
    '................',
    '...d........d...',
    '..dgd......dgd..',
    '...d........d...',
    '................',
    '.d............d.',
    '................',
    '................',
    '................',
    '................',
    '.d............d.',
    '................',
    '...d........d...',
    '..dgd......dgd..',
    '...d........d...',
    '................',
  ],
]);
hand('ui-arrow', [
  '....k....',
  '...kwk...',
  '..kwwwk..',
  '.kwwwwwk.',
  'kwwwwwwwk',
  'kkkwwwkkk',
  '..kwwwk..',
  '..kwwwk..',
  '..kkkkk..',
]);

// Bulles d'émotion du tutoriel : une bulle blanche de 16 × 16 avec sa pointe, et un signe au milieu.
function bubble(glyph) {
  const rows = [
    '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.',
    ...Array(9).fill('kwwwwwwwwwwwwwwk'),
    '.kwwwwwwwwwwwwk.',
    '..kkkkwwkkkkkk..',
    '.....kwk........',
    '.....kk.........',
    '................',
  ].map((r) => [...r]);
  const gw = glyph[0].length;
  const x0 = Math.floor((16 - gw) / 2);
  const y0 = 1 + Math.floor((11 - glyph.length) / 2);
  glyph.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') rows[y0 + y][x0 + x] = ch;
  }));
  return rows.map((r) => r.join(''));
}
hand('emote-exclaim', bubble([
  'rr',
  'rr',
  'rr',
  'rr',
  'rr',
  '..',
  'rr',
  'rr',
]));
hand('emote-question', bubble([
  '.qqqq.',
  'qq..qq',
  '....qq',
  '...qq.',
  '..qq..',
  '......',
  '..qq..',
  '..qq..',
]));
hand('emote-dots', bubble([
  'dd..dd..dd',
  'dd..dd..dd',
]));
hand('emote-drop', bubble([
  '...K...',
  '..KcK..',
  '..KcK..',
  '.KcCcK.',
  '.KcCcK.',
  'KcCcccK',
  'KcccccK',
  '.KcccK.',
  '..KKK..',
]));
hand('emote-note', bubble([
  '...KKKK',
  '...K..K',
  '...K..K',
  '...K..K',
  '...K..K',
  '.KKK.KK',
  'KKKKKKK',
  '.KK..K.',
]));

// Chiffres des nombres de dégâts : 4 × 6 px, blancs (teintés par le rendu), avec un contour sombre.
const DIGITS = {
  0: ['.ww.', 'w..w', 'w..w', 'w..w', 'w..w', '.ww.'],
  1: ['..w.', '.ww.', '..w.', '..w.', '..w.', '.www'],
  2: ['.ww.', 'w..w', '...w', '..w.', '.w..', 'wwww'],
  3: ['www.', '...w', '.ww.', '...w', '...w', 'www.'],
  4: ['w..w', 'w..w', 'wwww', '...w', '...w', '...w'],
  5: ['wwww', 'w...', 'www.', '...w', '...w', 'www.'],
  6: ['.ww.', 'w...', 'www.', 'w..w', 'w..w', '.ww.'],
  7: ['wwww', '...w', '..w.', '..w.', '.w..', '.w..'],
  8: ['.ww.', 'w..w', '.ww.', 'w..w', 'w..w', '.ww.'],
  9: ['.ww.', 'w..w', 'w..w', '.www', '...w', '.ww.'],
};
{
  const frames = [];
  for (let n = 0; n <= 9; n++) {
    // Chaque chiffre est posé dans une case de 6 × 8 avec un contour d'un pixel.
    const cell = Array.from({ length: 8 }, () => Array(6).fill('.'));
    DIGITS[n].forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'w') cell[y + 1][x + 1] = 'w';
    }));
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 6; x++) {
        if (cell[y][x] !== '.') continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => cell[y + oy]?.[x + ox] === 'w');
        if (near) cell[y][x] = 'k';
      }
    }
    frames.push(cell.map((r) => r.join('')));
  }
  hand('font-digits', frames);
}

// ───────────── La provenance ─────────────
const yaml = ['# Provenance des assets gardés (document 11 §9). Écrit par tools/process-assets.mjs.', `# Date des générations : ${today}`, ''];
for (const p of provenance) {
  yaml.push(`- file: ${p.file}`);
  yaml.push(`  tool: ${p.tool}`);
  if (p.id) {
    yaml.push(`  date: ${p.date ?? today}`);
    yaml.push(`  pixellab_id: ${p.id}`);
    yaml.push(`  prompt: ${JSON.stringify(p.prompt)}`);
    yaml.push(`  settings: ${JSON.stringify(p.settings)}`);
    yaml.push(`  edits: ${JSON.stringify(p.edits)}`);
  }
}
for (const list of [manifest.sounds ?? [], manifest.music ?? []]) {
  for (const a of list) {
    const music = a.name.startsWith('music-');
    yaml.push(`- file: public/audio/${a.name}.ogg`);
    yaml.push(`  tool: ${music ? 'create_music' : 'create_sound_effect'}`);
    yaml.push(`  date: ${a.date ?? today}`);
    yaml.push(`  pixellab_id: ${a.id}`);
    yaml.push(`  prompt: ${JSON.stringify(a.prompt)}`);
    yaml.push(`  edits: ${JSON.stringify(music ? 'converti en OGG Vorbis stéréo' : 'converti en OGG Vorbis mono, volume normalisé')}`);
  }
}
// Les sons d'interface synthétisés par assets/source/sons-interface/generer.py (sans PixelLab).
for (const name of JSON.parse(readFileSync(join(root, 'source', 'sons-interface', 'sons.json'), 'utf8'))) {
  yaml.push(`- file: public/audio/${name}.ogg`);
  yaml.push('  tool: assets/source/sons-interface/generer.py');
  yaml.push(`  edits: ${JSON.stringify('notes de lamelle synthétisées, passe-bas, converti en OGG Vorbis mono')}`);
}
writeFileSync(join(root, 'provenance.yaml'), `${yaml.join('\n')}\n`);

console.log(`${readdirSync(out).length} sprites écrits dans assets/sprites, ${provenance.length} entrées de provenance.`);
