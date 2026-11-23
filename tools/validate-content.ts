/**
 * Valide toutes les données de `content/` contre leurs schémas et leurs références croisées.
 * Une donnée fausse fait échouer la construction, pas le jeu.
 */
import { compileContent } from '../packages/braise/src/content/index.ts';

const { data, errors } = compileContent();
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
