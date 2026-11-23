/**
 * Prépare une cinématique pour le jeu (document 15).
 *
 * Images : lit la liste `assets` de content/cinematics/<id>.json, prend chaque fichier dans
 * assets/source/cinematique-<id>/, rogne les marges transparentes (une bande d'animation est rognée
 * sur l'union de ses images, pour que les pieds restent en place) et écrit public/cinematics/<id>/<nom>.png.
 * Une animation devient une bande horizontale d'images de même taille.
 *
 * Sons : copie la musique et les effets gardés dans assets/source/audio/, sous les noms que le jeu
 * attend (music-<id>-a…, sfx-<id>-…). `node tools/build-audio.mjs` les convertit ensuite.
 *
 * Usage : node tools/build-cinematic.mjs [id]   (par défaut : intro)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const id = process.argv[2] ?? 'intro';
const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise');
const def = JSON.parse(readFileSync(join(pkg, 'content', 'cinematics', `${id}.json`), 'utf8'));
const src = join(pkg, 'assets', 'source', id === 'intro' ? 'cinematique-intro' : `cinematique-${id}`);
const out = join(pkg, 'public', 'cinematics', id);
mkdirSync(out, { recursive: true });

function read(file) {
  const path = join(src, file);
  if (!existsSync(path)) throw new Error(`${id} : fichier source manquant ${file}`);
  return PNG.sync.read(readFileSync(path));
}

/** Le plus petit rectangle qui contient tous les pixels visibles des images, ou null si une image est opaque. */
function unionBox(pngs) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const png of pngs) {
    let transparent = false;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] === 0) {
          transparent = true;
          continue;
        }
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (!transparent) return null;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

let count = 0;
for (const [name, asset] of Object.entries(def.assets)) {
  const files = asset.frames
    ? Array.from({ length: asset.frames[1] - asset.frames[0] + 1 }, (_, k) => asset.src.replace('{i}', String(asset.frames[0] + k)))
    : [asset.src];
  const pngs = files.map(read);
  const { width, height } = pngs[0];
  for (const p of pngs) if (p.width !== width || p.height !== height) throw new Error(`${name} : images de tailles différentes`);
  const box = unionBox(pngs) ?? { x: 0, y: 0, w: width, h: height };
  const strip = new PNG({ width: box.w * pngs.length, height: box.h });
  pngs.forEach((p, i) => PNG.bitblt(p, strip, box.x, box.y, box.w, box.h, i * box.w, 0));
  writeFileSync(join(out, `${name}.png`), PNG.sync.write(strip));
  console.log(`${name} : ${pngs.length} image(s) de ${box.w} × ${box.h}${box.w !== width || box.h !== height ? ` (rognée depuis ${width} × ${height}, décalage ${box.x}, ${box.y})` : ''}`);
  count++;
}

// Les sons gardés, sous les noms du jeu.
const audioDir = join(pkg, 'assets', 'source', 'audio');
mkdirSync(audioDir, { recursive: true });
let sounds = 0;
for (const part of ['a', 'b', 'c']) {
  const file = join(src, `theme-${part}.mp3`);
  if (existsSync(file)) {
    copyFileSync(file, join(audioDir, `music-${id}-${part}.mp3`));
    sounds++;
  }
}
const sfxDir = join(src, 'sons');
if (existsSync(sfxDir)) {
  for (const file of readdirSync(sfxDir).filter((f) => f.endsWith('.wav'))) {
    copyFileSync(join(sfxDir, file), join(audioDir, `sfx-${file}`));
    sounds++;
  }
}
console.log(`${count} images écrites dans public/cinematics/${id}/, ${sounds} sons copiés dans assets/source/audio/.`);
