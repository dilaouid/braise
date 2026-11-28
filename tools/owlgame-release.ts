/**
 * Ce qui décrit une version du paquet OwlLeaf (spec 2026-11-28, mise à jour sur la console) :
 * le manifeste `owlgame.json` rangé dans le paquet, et `latest.json` publié à côté sur Pages.
 * Owl Player compare `builtAt` des deux et télécharge le paquet si celui en ligne est plus récent.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const OWL_UPDATE_URL = 'https://braise.dilaouid.fr/owl/latest.json';

const ID = 'braise';
const PACKAGE = 'Braise.owlgame';

export function owlManifest(o: { version: string; build: string; builtAt: number }): Record<string, unknown> {
  return {
    format: 1, id: ID, title: 'Braise', version: o.version, entry: 'index.html', orientation: 'landscape', saves: true,
    build: o.build, builtAt: o.builtAt, update: OWL_UPDATE_URL,
  };
}

export function latestJson(o: { build: string; builtAt: number; bytes: Uint8Array }) {
  return {
    format: 1 as const,
    id: ID,
    build: o.build,
    builtAt: o.builtAt,
    size: o.bytes.length,
    sha256: createHash('sha256').update(o.bytes).digest('hex'),
    // Pages garde les fichiers en cache quelques minutes : l'adresse change à chaque version.
    url: `${PACKAGE}?b=${encodeURIComponent(o.build)}`,
  };
}

/** La date du commit `HEAD`, en secondes ; 0 sans git. */
export function commitTime(cwd: string): number {
  try {
    return Number(execSync('git log -1 --format=%ct', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) || 0;
  } catch {
    return 0;
  }
}
