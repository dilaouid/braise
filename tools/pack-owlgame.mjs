/**
 * Construit le paquet OwlLeaf (document 09 §3) : un zip renommé `.owlgame`, qui contient le site
 * construit et un manifeste `owlgame.json` à sa racine. Produit aussi la jaquette à déposer à côté.
 * À lancer après `pnpm build`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages', 'braise');
const dist = join(pkg, 'dist');
const out = join(root, 'release');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('packages/braise/dist/ est absent : lancer « pnpm build » d\'abord.');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
const manifest = { format: 1, id: 'braise', title: 'Braise', version, entry: 'index.html', orientation: 'landscape', saves: true };
if (!/^[a-z0-9-]{1,32}$/.test(manifest.id)) throw new Error('Identifiant de paquet invalide');

const files = { 'owlgame.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)) };
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files[relative(dist, path).replaceAll('\\', '/')] = new Uint8Array(readFileSync(path));
  }
}
walk(dist);
mkdirSync(join(out, 'covers'), { recursive: true });
// Les images et les sons sont déjà compressés : inutile de les compresser encore.
const zipped = zipSync(files, { level: 6 });
writeFileSync(join(out, 'Braise.owlgame'), zipped);

// La jaquette : le héros devant le boss, agrandis sans lissage sur un fond de nuit.
const atlasJson = JSON.parse(readFileSync(join(pkg, 'public', 'atlas', 'atlas.json'), 'utf8'));
const atlas = PNG.sync.read(readFileSync(join(pkg, 'public', 'atlas', 'atlas.png')));
const cover = new PNG({ width: 512, height: 512 });
for (let i = 0; i < cover.data.length; i += 4) {
  const y = Math.floor(i / 4 / 512);
  const night = y > 380 ? [0x13, 0x1c, 0x2e] : [0x0b, 0x0f, 0x1a];
  cover.data[i] = night[0]; cover.data[i + 1] = night[1]; cover.data[i + 2] = night[2]; cover.data[i + 3] = 255;
}
function blit(name, dx, dy, scale) {
  const f = atlasJson.frames[name];
  if (!f) return;
  for (let y = 0; y < f.h * scale; y++) {
    for (let x = 0; x < f.w * scale; x++) {
      const si = ((f.y + Math.floor(y / scale)) * atlas.width + f.x + Math.floor(x / scale)) * 4;
      if (atlas.data[si + 3] === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= 512 || ty >= 512) continue;
      const di = (ty * 512 + tx) * 4;
      cover.data[di] = atlas.data[si]; cover.data[di + 1] = atlas.data[si + 1]; cover.data[di + 2] = atlas.data[si + 2];
    }
  }
}
blit('boss-cerf#0', 64, 16, 3);
blit('hero-lame-cendre-rot-0', 160, 250, 4);
blit('fx-flame#0', 224, 440, 4);
writeFileSync(join(out, 'covers', 'Braise.png'), PNG.sync.write(cover));

const mb = (zipped.length / 1024 / 1024).toFixed(2);
console.log(`release/Braise.owlgame : ${Object.keys(files).length} fichiers, ${mb} Mo (version ${version}).`);
console.log('release/covers/Braise.png : la jaquette, à déposer dans /sdcard/Roms/owl/covers/.');
if (zipped.length > 40 * 1024 * 1024) console.warn('Attention : le paquet dépasse les 40 Mo visés.');
