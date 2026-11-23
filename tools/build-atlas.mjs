/**
 * Assemble assets/sprites/*.png en un atlas : public/atlas/atlas.png et atlas.json.
 * Un fichier « nom@N.png » est une bande de N images : elle donne les images « nom#0 » à « nom#N-1 ».
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise');
const spritesDir = join(pkg, 'assets', 'sprites');
const outDir = join(pkg, 'public', 'atlas');
const WIDTH = 1024;
const PAD = 1;

const items = readdirSync(spritesDir)
  .filter((f) => f.endsWith('.png'))
  .map((file) => {
    const png = PNG.sync.read(readFileSync(join(spritesDir, file)));
    const name = file.replace(/\.png$/, '');
    const m = /^(.*)@(\d+)$/.exec(name);
    return { name: m ? m[1] : name, frames: m ? Number(m[2]) : 1, png };
  })
  // Les plus hauts d'abord : le rangement par étagères perd moins de place.
  .sort((a, b) => b.png.height - a.png.height || a.name.localeCompare(b.name));

const placed = [];
let x = PAD;
let y = PAD;
let shelf = 0;
for (const item of items) {
  const w = item.png.width;
  const h = item.png.height;
  if (w + PAD * 2 > WIDTH) throw new Error(`${item.name} est plus large que l'atlas`);
  if (x + w + PAD > WIDTH) {
    x = PAD;
    y += shelf + PAD;
    shelf = 0;
  }
  placed.push({ item, x, y });
  x += w + PAD;
  shelf = Math.max(shelf, h);
}
const height = y + shelf + PAD;
const atlas = new PNG({ width: WIDTH, height });
const frames = {};
const anims = {};
for (const { item, x: px, y: py } of placed) {
  PNG.bitblt(item.png, atlas, 0, 0, item.png.width, item.png.height, px, py);
  if (item.frames > 1) {
    const fw = item.png.width / item.frames;
    if (!Number.isInteger(fw)) throw new Error(`${item.name} : largeur non divisible par ${item.frames}`);
    anims[item.name] = item.frames;
    for (let i = 0; i < item.frames; i++) frames[`${item.name}#${i}`] = { x: px + i * fw, y: py, w: fw, h: item.png.height };
  } else {
    frames[item.name] = { x: px, y: py, w: item.png.width, h: item.png.height };
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'atlas.png'), PNG.sync.write(atlas));
writeFileSync(join(outDir, 'atlas.json'), JSON.stringify({ width: WIDTH, height, frames, anims }));
console.log(`Atlas ${WIDTH} × ${height} : ${Object.keys(frames).length} images, ${Object.keys(anims).length} animations.`);
