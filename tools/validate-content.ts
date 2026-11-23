/**
 * Valide toutes les données de `content/` contre leurs schémas et leurs références croisées.
 * Une donnée fausse fait échouer la construction, pas le jeu.
 */
import { readFileSync } from 'node:fs';
import { compileCinematic, INTRO_RAW } from '../packages/braise/src/content/cinematic.ts';
import { RAW, compileContent } from '../packages/braise/src/content/index.ts';

const { data, errors } = compileContent();
const audioIndex = JSON.parse(readFileSync(new URL('../packages/braise/public/audio/index.json', import.meta.url), 'utf8')) as Record<string, string>;
const intro = compileCinematic(INTRO_RAW, RAW.fr, new Set(Object.keys(audioIndex)));
if (!intro.cinematic) {
  console.error(`Cinématique d'intro invalide (${intro.errors.length}) :`);
  for (const e of intro.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (!data) {
  console.error(`Données invalides (${errors.length}) :`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Données valides : ${data.weapons.filter((w) => !w.evolved).length} armes, ${data.weapons.filter((w) => w.evolved).length} évolutions, `
  + `${data.relics.length} reliques, ${data.enemies.length} ennemis, ${Object.keys(data.regions).length} région(s), `
  + `${Object.keys(data.classes).length} classe(s), ${data.altar.length} boosts.`,
);
