/**
 * Télécharge les générations PixelLab listées dans assets/pixellab.json vers assets/source/.
 * Chaque asset a son propre dossier. Les fichiers déjà présents ne sont pas retéléchargés
 * (passer --force pour tout reprendre).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise', 'assets');
const manifest = JSON.parse(readFileSync(join(root, 'pixellab.json'), 'utf8'));
const force = process.argv.includes('--force');
const API = 'https://api.pixellab.ai/mcp';

async function download(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.status === 423 || res.status === 503) {
      // L'asset est encore en cours de génération, ou le stockage est occupé.
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error(`Toujours indisponible : ${url}`);
}

function save(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function isZip(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Extrait une archive dans un dossier, en refusant tout chemin qui en sortirait. */
function extract(bytes, dir) {
  const files = unzipSync(bytes);
  let n = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/') || name.includes('..') || name.startsWith('/') || !/\.(png|json|txt)$/i.test(name)) continue;
    save(join(dir, name), data);
    n++;
  }
  return n;
}

let fetched = 0;
let skipped = 0;

async function fetchArchive(kind, entry) {
  const dir = join(root, 'source', entry.name);
  if (existsSync(dir) && !force) {
    skipped++;
    return;
  }
  const bytes = await download(`${API}/${kind}/${entry.id}/download`);
  if (isZip(bytes)) console.log(`${entry.name} : ${extract(bytes, dir)} fichiers`);
  else {
    save(join(dir, 'rotations', 'unknown.png'), bytes);
    console.log(`${entry.name} : 1 image`);
  }
  fetched++;
}

for (const c of manifest.characters) await fetchArchive('characters', c);
for (const o of manifest.objects) await fetchArchive('objects', o);

for (const t of manifest.tilesets) {
  const dir = join(root, 'source', t.name);
  if (existsSync(dir) && !force) {
    skipped++;
    continue;
  }
  save(join(dir, 'tileset.png'), await download(`${API}/tilesets/${t.id}/image?inline=true`));
  save(join(dir, 'metadata.json'), await download(`${API}/tilesets/${t.id}/metadata`));
  console.log(`${t.name} : jeu de tuiles`);
  fetched++;
}

for (const img of manifest.images) {
  const file = join(root, 'source', 'images', `${img.name}.png`);
  if (existsSync(file) && !force) {
    skipped++;
    continue;
  }
  save(file, await download(`${API}/images/${img.id}/download`));
  console.log(`${img.name} : image`);
  fetched++;
}

// Les adresses des sons portent l'identifiant du compte PixelLab : elles restent dans un fichier local.
const audioUrlsFile = join(root, '..', '..', '..', '.pixellab', 'audio-urls.json');
const audioUrls = existsSync(audioUrlsFile) ? JSON.parse(readFileSync(audioUrlsFile, 'utf8')) : {};
for (const list of [manifest.sounds ?? [], manifest.music ?? []]) {
  for (const a of list) {
    a.url = audioUrls[a.name];
    if (!a.url) continue;
    const ext = a.url.split('?')[0].split('.').pop();
    const file = join(root, 'source', 'audio', `${a.name}.${ext}`);
    if (existsSync(file) && !force) {
      skipped++;
      continue;
    }
    save(file, await download(a.url));
    console.log(`${a.name} : son`);
    fetched++;
  }
}

console.log(`\n${fetched} téléchargés, ${skipped} déjà présents.`);
