/**
 * Convertit les sons de assets/source/audio/ en OGG Vorbis dans public/audio/
 * (mono pour les effets, stéréo pour la musique) et écrit public/audio/index.json.
 * Demande ffmpeg dans le PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'braise');
const src = join(pkg, 'assets', 'source', 'audio');
const out = join(pkg, 'public', 'audio');
mkdirSync(out, { recursive: true });
const index = {};
let total = 0;
if (existsSync(src)) {
  for (const file of readdirSync(src).sort()) {
    const name = file.replace(/\.(wav|mp3)$/i, '');
    if (name === file) continue;
    const music = name.startsWith('music-');
    const target = join(out, `${name}.ogg`);
    const args = ['-y', '-loglevel', 'error', '-i', join(src, file), '-ac', music ? '2' : '1', '-c:a', 'libvorbis', '-q:a', music ? '4' : '3'];
    // Les effets sont normalisés : ils sont joués des milliers de fois, à des volumes réglés par le code.
    if (!music) args.push('-af', 'loudnorm=I=-18:TP=-2:LRA=11');
    args.push(target);
    execFileSync('ffmpeg', args, { stdio: 'inherit' });
    index[name] = `${name}.ogg`;
    total += statSync(target).size;
  }
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${Object.keys(index).length} sons convertis, ${(total / 1024 / 1024).toFixed(2)} Mo.`);
