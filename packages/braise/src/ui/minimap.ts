/**
 * La mini-carte : le terrain en fond, une petite icône par lieu découvert, un crâne par élite,
 * la flèche du héros et le cadre de l'écran. Chaque point du canevas est un point de l'interface.
 */
import type { Poi, Run } from '../core/types.ts';

/** Côté de la mini-carte, en points de l'interface. */
export const MINIMAP_SIZE = 80;

/** Une icône en points : `#` la couleur, `+` sa teinte claire, `.` vide. Un contour sombre l'entoure. */
export interface Glyph {
  rows: readonly string[];
  main: string;
  light: string;
}

const g = (main: string, light: string, ...rows: string[]): Glyph => ({ rows, main, light });

/** Une icône par sorte de lieu. */
export const POI_GLYPHS: Record<Poi['kind'], Glyph> = {
  // Une flamme dans sa vasque.
  brazier: g('#fb7a0c', '#ffd166',
    '...#...',
    '..#+#..',
    '..#+#..',
    '.#+++#.',
    '#######',
    '.#####.',
    '...#...'),
  // Une goutte.
  spring: g('#1f9e96', '#b8fff0',
    '...#...',
    '...#...',
    '..###..',
    '.#+###.',
    '.#+###.',
    '.#####.',
    '..###..'),
  // Un coffre.
  cache: g('#d9480f', '#ffb020',
    '.......',
    '.#####.',
    '#+++++#',
    '#######',
    '#++#++#',
    '#+++++#',
    '#######'),
  // Une arche qui luit.
  portal: g('#9aa3b5', '#fff1c2',
    '..###..',
    '.#+++#.',
    '#+++++#',
    '#++.++#',
    '#+...+#',
    '#+...+#',
    '#.....#'),
  // Une étoile à quatre branches.
  memory: g('#6fb8ff', '#eef2f6',
    '...#...',
    '...#...',
    '..#+#..',
    '###+###',
    '..#+#..',
    '...#...',
    '...#...'),
  // Une pierre levée marquée d'une rune.
  totem: g('#3f8fc4', '#b8e4ff',
    '..###..',
    '.#####.',
    '.##+##.',
    '.#+++#.',
    '.##+##.',
    '.#####.',
    '#######'),
  // Une enclume, sa pointe à gauche.
  smith: g('#9aa3b5', '#eef2f6',
    '.......',
    '+++++++',
    '.######',
    '...##..',
    '..####.',
    '.######',
    '.......'),
  // Une feuille.
  herbalist: g('#4c9a5a', '#9cc46a',
    '....###',
    '..####+',
    '.###+##',
    '.##+###',
    '.#+###.',
    '.+.##..',
    '+......'),
  // Une gemme taillée.
  treasure: g('#ffb020', '#fff1c2',
    '.......',
    '.#####.',
    '#+#+#+#',
    '#######',
    '.#####.',
    '..###..',
    '...#...'),
  // Une cloche.
  bell: g('#b39ddb', '#e8d8ff',
    '...#...',
    '..###..',
    '.##+##.',
    '.##+##.',
    '.#####.',
    '#######',
    '...#...'),
};

/** Un lieu déjà servi : la même icône, éteinte. */
const SPENT = { main: '#454a5c', light: '#6b7285' };
const OUTLINE = '#0b0f1a';

const ELITE = g('#ff3d81', '#0b0f1a',
  '.###.',
  '#+#+#',
  '#####',
  '.#.#.');
const BOSS = g('#ff3d81', '#0b0f1a',
  '.#####.',
  '#######',
  '#++#++#',
  '#++#++#',
  '###.###',
  '.#####.',
  '.#.#.#.');
const HERO = g('#fff1c2', '#ffffff',
  '..#..',
  '.#+#.',
  '#+++#',
  '.#+#.',
  '..#..');

/** Les couleurs du terrain, en [r, g, b]. */
const GROUND = [0x16, 0x1f, 0x33] as const;
const BLOCK = [0x2a, 0x37, 0x52] as const;
const PATH = [0x2e, 0x2b, 0x36] as const;
const WATER = [0x14, 0x45, 0x4c] as const;
const EDGE = [0x45, 0x4a, 0x5c] as const;
const OUTSIDE = [0x0b, 0x0f, 0x1a] as const;
const DANGER = [0x5a, 0x16, 0x34] as const;

/** Dessine une icône centrée sur (cx, cy), contour compris. */
export function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number, main = glyph.main, light = glyph.light): void {
  const h = glyph.rows.length;
  const w = glyph.rows[0]!.length;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  ctx.fillStyle = OUTLINE;
  for (let y = 0; y < h; y++) {
    const row = glyph.rows[y]!;
    for (let x = 0; x < w; x++) {
      if (row[x] === '.') continue;
      ctx.fillRect(x0 + x - 1, y0 + y, 3, 1);
      ctx.fillRect(x0 + x, y0 + y - 1, 1, 3);
    }
  }
  for (let y = 0; y < h; y++) {
    const row = glyph.rows[y]!;
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.') continue;
      ctx.fillStyle = c === '+' ? light : main;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

/** Le terrain : un point par case de mini-carte, pris au centre de la case. */
function drawTerrain(ctx: CanvasRenderingContext2D, r: Run): void {
  const n = MINIMAP_SIZE;
  const map = r.map;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const cs = map.size + 1;
  const tileAt = (px: number, py: number): number => {
    const tx = Math.min(map.size - 1, Math.max(0, Math.floor(((px + 0.5) / n) * map.size)));
    const ty = Math.min(map.size - 1, Math.max(0, Math.floor(((py + 0.5) / n) * map.size)));
    return map.solid[ty * map.size + tx]!;
  };
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const s = tileAt(px, py);
      let c: readonly number[];
      if (s === 2) {
        // La lisière : un trait clair là où la bordure touche l'intérieur.
        const inside = (px > 0 && tileAt(px - 1, py) !== 2) || (px < n - 1 && tileAt(px + 1, py) !== 2)
          || (py > 0 && tileAt(px, py - 1) !== 2) || (py < n - 1 && tileAt(px, py + 1) !== 2);
        c = inside ? EDGE : OUTSIDE;
      } else if (s === 4) c = DANGER;
      else if (s !== 0) c = BLOCK;
      else {
        const cx = Math.round(((px + 0.5) / n) * map.size);
        const cy = Math.round(((py + 0.5) / n) * map.size);
        const path = map.corners[cy * cs + cx] === 1;
        c = path ? (map.waterSlow > 0 ? WATER : PATH) : GROUND;
      }
      const o = (py * n + px) * 4;
      d[o] = c[0]!; d[o + 1] = c[1]!; d[o + 2] = c[2]!; d[o + 3] = 235;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** La flèche du héros : un losange, et un point clair du côté où il va. */
function drawHero(ctx: CanvasRenderingContext2D, r: Run, k: number, pulse: boolean): void {
  const hx = r.hero.x * k;
  const hy = r.hero.y * k;
  // Un halo qui bat, pour le retrouver d'un coup d'œil parmi les icônes.
  ctx.strokeStyle = pulse ? 'rgba(255, 176, 32, 0.85)' : 'rgba(255, 176, 32, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(Math.round(hx) - 0.5, Math.round(hy) - 0.5, pulse ? 6 : 5, 0, Math.PI * 2);
  ctx.stroke();
  drawGlyph(ctx, HERO, hx, hy);
  const len = Math.hypot(r.hero.faceX, r.hero.faceY);
  if (len > 0) {
    const fx = Math.round(hx - 0.5 + (r.hero.faceX / len) * 3.6);
    const fy = Math.round(hy - 0.5 + (r.hero.faceY / len) * 3.6);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(fx - 1, fy - 1, 3, 3);
    ctx.fillStyle = '#fff1c2';
    ctx.fillRect(fx, fy, 1, 1);
  }
}

/**
 * Redessine la mini-carte. `now` (en ms) fait clignoter ce qui attend le héros :
 * un braséro allumé, une cloche prête à sonner.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, r: Run, now: number, viewW: number, viewH: number): void {
  const n = MINIMAP_SIZE;
  const mapPx = r.map.size * r.map.tile;
  const k = n / mapPx;
  const blink = Math.floor(now / 400) % 2 === 0;
  ctx.clearRect(0, 0, n, n);
  drawTerrain(ctx, r);

  // Ce que l'écran montre, à peu près : la caméra suit le héros sans sortir de la carte.
  const camX = Math.min(mapPx - viewW, Math.max(0, r.hero.x - viewW / 2));
  const camY = Math.min(mapPx - viewH, Math.max(0, r.hero.y - viewH / 2));
  ctx.strokeStyle = 'rgba(201, 209, 220, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(camX * k) + 0.5, Math.round(camY * k) + 0.5, Math.round(viewW * k) - 1, Math.round(viewH * k) - 1);

  for (const b of r.map.beacons) {
    if (b.life <= 0) continue;
    const bx = Math.round(b.x * k);
    const by = Math.round(b.y * k);
    ctx.fillStyle = 'rgba(184, 255, 240, 0.35)';
    ctx.fillRect(bx - 1, by - 1, 3, 3);
    ctx.fillStyle = '#b8fff0';
    ctx.fillRect(bx, by, 1, 1);
  }

  for (const poi of r.map.pois) {
    if (!poi.discovered) continue;
    const glyph = POI_GLYPHS[poi.kind];
    const waiting = (poi.kind === 'brazier' && poi.state === 3) || (poi.kind === 'bell' && poi.state === 1);
    const spent = poi.state === 2;
    const main = spent ? SPENT.main : waiting && blink ? glyph.light : glyph.main;
    const light = spent ? SPENT.light : waiting && blink ? '#fff1c2' : glyph.light;
    drawGlyph(ctx, glyph, poi.x * k, poi.y * k, main, light);
  }

  if (r.director.bossSpawned && !r.director.bossDead) {
    ctx.strokeStyle = blink ? '#ff3d81' : '#c2185b';
    ctx.beginPath();
    ctx.arc(r.director.arenaX * k, r.director.arenaY * k, r.director.arenaR * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  const e = r.enemies;
  for (let i = 0; i < e.count; i++) {
    const rank = r.data.enemies[e.kind[i]!]!.rank;
    if (rank === 'normal') continue;
    drawGlyph(ctx, rank === 'boss' ? BOSS : ELITE, e.x[i]! * k, e.y[i]! * k);
  }

  drawHero(ctx, r, k, blink);
}
