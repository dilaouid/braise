/**
 * Construit le paquet OwlLeaf (document 09 §3) : un zip renommé `.owlgame`, qui contient le site
 * construit et un manifeste `owlgame.json` à sa racine. Produit aussi la jaquette et la bannière.
 * À lancer après `pnpm build`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';
import { buildId } from '../packages/braise/tools/vite-journal.ts';
import { assertPublishable, commitTime, latestJson, owlManifest, packageBuiltAt } from './owlgame-release.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages', 'braise');
const dist = join(pkg, 'dist');
const out = join(root, 'release');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('packages/braise/dist/ est absent : lancer « pnpm build » d\'abord.');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
const build = buildId(pkg);
const site = process.argv.includes('--site');
const builtAt = packageBuiltAt({ commitTime: commitTime(root), now: Math.floor(Date.now() / 1000), site });
if (site) assertPublishable({ build, builtAt });
const manifest = owlManifest({ version, build, builtAt });
if (!/^[a-z0-9-]{1,32}$/.test(manifest.id)) throw new Error('Identifiant de paquet invalide');

const files = { 'owlgame.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)) };
// `dist/owl/` est le paquet publié avec le site (`--site`) : il ne doit jamais s'emballer lui-même.
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (dir === dist && name === 'owl') continue;
    if (statSync(path).isDirectory()) walk(path);
    else files[relative(dist, path).replaceAll('\\', '/')] = new Uint8Array(readFileSync(path));
  }
}
walk(dist);
// Les images et les sons sont déjà compressés : inutile de les compresser encore.
const zipped = zipSync(files, { level: 6 });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'Braise.owlgame'), zipped);
writeFileSync(join(out, 'latest.json'), JSON.stringify(latestJson({ build, builtAt, bytes: zipped }), null, 2));

// Avec `--site` (la CI) : le paquet et latest.json sont publiés avec le site, sous /owl/.
if (site) {
  const site = join(dist, 'owl');
  mkdirSync(site, { recursive: true });
  for (const name of ['Braise.owlgame', 'latest.json']) copyFileSync(join(out, name), join(site, name));
  console.log('dist/owl/ : Braise.owlgame et latest.json, publiés avec le site.');
}

// La jaquette : le héros devant le boss, agrandis sans lissage sur un fond de nuit.
const atlasJson = JSON.parse(readFileSync(join(pkg, 'public', 'atlas', 'atlas.json'), 'utf8'));
const atlas = PNG.sync.read(readFileSync(join(pkg, 'public', 'atlas', 'atlas.png')));
function nightScene(width, height, horizon) {
  const image = new PNG({ width, height });
  const sky = Buffer.from([0x0b, 0x0f, 0x1a, 255]);
  const ground = Buffer.from([0x13, 0x1c, 0x2e, 255]);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    image.data.fill(y > horizon ? ground : sky, rowStart, rowStart + width * 4);
  }
  return image;
}
function blit(image, name, dx, dy, scale) {
  const f = atlasJson.frames[name];
  if (!f) return;
  for (let y = 0; y < f.h * scale; y++) {
    for (let x = 0; x < f.w * scale; x++) {
      const si = ((f.y + Math.floor(y / scale)) * atlas.width + f.x + Math.floor(x / scale)) * 4;
      if (atlas.data[si + 3] === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= image.width || ty >= image.height) continue;
      const di = (ty * image.width + tx) * 4;
      atlas.data.copy(image.data, di, si, si + 3);
    }
  }
}
function writeArt(folder, image) {
  mkdirSync(join(out, folder), { recursive: true });
  writeFileSync(join(out, folder, 'Braise.png'), PNG.sync.write(image));
  console.log(`release/${folder}/Braise.png : à déposer dans /sdcard/Roms/owl/${folder}/.`);
}

// Les images peintes (assets/source/launcher/) passent avant le montage de repli, agrandies sans lissage.
function paintedArt(name, factor) {
  const file = join(pkg, 'assets', 'source', 'launcher', name);
  if (!existsSync(file)) return null;
  const src = PNG.sync.read(readFileSync(file));
  const image = new PNG({ width: src.width * factor, height: src.height * factor });
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const si = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4;
      src.data.copy(image.data, (y * image.width + x) * 4, si, si + 4);
      image.data[(y * image.width + x) * 4 + 3] = 255;
    }
  }
  return image;
}

const cover = paintedArt('cover.png', 2) ?? nightScene(512, 512, 380);
if (cover.width === 512 && !existsSync(join(pkg, 'assets', 'source', 'launcher', 'cover.png'))) {
  blit(cover, 'boss-cerf#0', 64, 16, 3);
  blit(cover, 'hero-lame-cendre-rot-0', 160, 250, 4);
  blit(cover, 'fx-flame#0', 224, 440, 4);
}
writeArt('covers', cover);

// Owl Leaf superpose les titres et les boutons à gauche de l'image plein écran.
const painted = paintedArt('banner.png', 2);
const banner = painted ?? nightScene(1280, 720, 520);
if (!painted) {
  blit(banner, 'boss-cerf#0', 728, 28, 4);
  blit(banner, 'hero-lame-cendre-rot-0', 610, 330, 5);
  blit(banner, 'fx-flame#0', 812, 510, 5);
}
writeArt('banners', banner);

const mb = (zipped.length / 1024 / 1024).toFixed(2);
console.log(`release/Braise.owlgame : ${Object.keys(files).length} fichiers, ${mb} Mo (version ${version}, build ${build}).`);
if (zipped.length > 40 * 1024 * 1024) console.warn('Attention : le paquet dépasse les 40 Mo visés.');
