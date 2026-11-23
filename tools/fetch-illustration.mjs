/**
 * Récupère une illustration de cinématique chez PixelLab et la range dans les sources.
 *
 * PixelLab rend parfois une image opaque entourée d'un liseré clair de quelques pixels : il est
 * remplacé par le miroir des colonnes (ou des lignes) voisines. Une copie agrandie trois fois est
 * écrite dans `ancre/`, pour juger.
 *
 * Usage : node tools/fetch-illustration.mjs <nom> <job PixelLab> [id de cinématique]
 * Exemple : node tools/fetch-illustration.mjs ill-03 546f8b13-…
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const [name, job, id = 'intro'] = process.argv.slice(2);
if (!name || !job) throw new Error('Usage : node tools/fetch-illustration.mjs <nom> <job> [id]');
const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise');
const dir = join(pkg, 'assets', 'source', `cinematique-${id}`);

const res = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download`);
if (!res.ok) throw new Error(`${name} : téléchargement refusé (${res.status})`);
const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
const { width: W, height: H, data } = png;

const FRAME = [0xee, 0xf2, 0xf6];
const isFrame = (x, y) => FRAME.every((v, k) => data[(y * W + x) * 4 + k] === v);
const share = (len, at) => {
  let n = 0;
  for (let i = 0; i < len; i++) n += at(i) ? 1 : 0;
  return n / len;
};
/** L'épaisseur du liseré sur un bord : les lignes presque entièrement claires, plus deux de marge. */
function border(len, line) {
  let n = 0;
  while (n < 24 && line(n) > 0.8) n++;
  return n === 0 ? 0 : n + 2;
}
const left = border(W, (x) => share(H, (y) => isFrame(x, y)));
const right = border(W, (x) => share(H, (y) => isFrame(W - 1 - x, y)));
const top = border(H, (y) => share(W, (x) => isFrame(x, y)));
const bottom = border(H, (y) => share(W, (x) => isFrame(x, H - 1 - y)));

const copy = (sx, sy, dx, dy) => data.copy(data, (dy * W + dx) * 4, (sy * W + sx) * 4, (sy * W + sx) * 4 + 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < left; x++) copy(2 * left - 1 - x, y, x, y);
  for (let x = 0; x < right; x++) copy(W - 2 * right + x, y, W - 1 - x, y);
}
for (let x = 0; x < W; x++) {
  for (let y = 0; y < top; y++) copy(x, 2 * top - 1 - y, x, y);
  for (let y = 0; y < bottom; y++) copy(x, H - 2 * bottom + y, x, H - 1 - y);
}

writeFileSync(join(dir, `${name}.png`), PNG.sync.write(png));
const S = 3;
const big = new PNG({ width: W * S, height: H * S });
for (let y = 0; y < H * S; y++) {
  for (let x = 0; x < W * S; x++) {
    const a = (Math.floor(y / S) * W + Math.floor(x / S)) * 4;
    data.copy(big.data, (y * W * S + x) * 4, a, a + 4);
  }
}
mkdirSync(join(dir, 'ancre'), { recursive: true });
writeFileSync(join(dir, 'ancre', `${name}-x3.png`), PNG.sync.write(big));
console.log(`${name} : ${W} × ${H}, liseré effacé (gauche ${left}, droite ${right}, haut ${top}, bas ${bottom})`);
