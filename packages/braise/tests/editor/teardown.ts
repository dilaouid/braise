import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

/** À la fin de `pnpm test:editor` : la copie temporaire du contenu est supprimée (jamais un autre dossier). */
export default function teardown(): void {
  const dir = process.env.BRAISE_CONTENT_DIR;
  if (!dir) return;
  const abs = resolve(dir);
  if (dirname(abs) !== resolve(tmpdir()) || !basename(abs).startsWith('braise-editeur-e2e-')) return;
  rmSync(abs, { recursive: true, force: true });
}
