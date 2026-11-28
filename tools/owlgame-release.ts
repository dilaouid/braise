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
  const sha256 = createHash('sha256').update(o.bytes).digest('hex');
  return {
    format: 1 as const,
    id: ID,
    build: o.build,
    builtAt: o.builtAt,
    size: o.bytes.length,
    sha256,
    // Pages garde les fichiers en cache quelques minutes : l'adresse change avec le contenu, même pour un
    // commit réemballé (le zip porte l'heure de fabrication).
    url: `${PACKAGE}?h=${sha256.slice(0, 16)}`,
  };
}

/**
 * La date que le lecteur compare. Le site (CI) prend celle du commit. Un paquet local, poussé par adb pour
 * essayer quelque chose, prend aussi l'heure de sa fabrication : seul un commit plus récent le remplace.
 */
export function packageBuiltAt(o: { commitTime: number; now: number; site: boolean }): number {
  return o.site ? o.commitTime : Math.max(o.commitTime, o.now);
}

/** Sans commit ni date, un paquet publié ne déclencherait jamais de mise à jour : la CI s'arrête plutôt. */
export function assertPublishable(o: { build: string; builtAt: number }): void {
  if (o.build === '?' || o.builtAt <= 0) {
    throw new Error(`Paquet impubliable : build « ${o.build} », builtAt ${o.builtAt}. Git est-il disponible ?`);
  }
}

/** La date du commit `HEAD`, en secondes ; 0 sans git. */
export function commitTime(cwd: string): number {
  try {
    return Number(execSync('git log -1 --format=%ct', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) || 0;
  } catch {
    return 0;
  }
}
