/**
 * Le journal des parties côté serveur de développement : `POST /__journal/add` `{ entries }` ajoute chaque
 * fiche, une par ligne, à `docs/journal/parties.jsonl` à la racine du dépôt (dossier non suivi par git).
 * `BRAISE_JOURNAL_FILE` écrit ailleurs (le serveur d'essai, pour ne pas mêler ses parties à celles du joueur).
 * `apply: 'serve'` : rien de tout ça n'existe dans le jeu construit.
 */
import { execSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const JOURNAL_FILE = join(packageDir, '..', '..', 'docs', 'journal', 'parties.jsonl');
const LIMIT = 2 * 1024 * 1024;

/** Le commit en cours, suivi de « + » si la copie de travail a des changements ; « ? » sans git. */
export function buildId(cwd = packageDir): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return dirty ? `${sha}+` : sha;
  } catch {
    return '?';
  }
}

/** Une fiche lisible : on ne vérifie que l'essentiel, le reste est écrit tel quel. */
export function isEntry(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return e.v === 1 && typeof e.source === 'string' && typeof e.date === 'string' && typeof e.seed === 'number'
    && (e.outcome === 'victory' || e.outcome === 'death' || e.outcome === 'abandon') && Array.isArray(e.minutes);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** L'adresse du journal, en intergiciel Connect. `file` : où écrire (le journal du dépôt par défaut). */
export function journalMiddleware(file = JOURNAL_FILE) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if ((req.url ?? '').split('?')[0] !== '/__journal/add') {
      next();
      return;
    }
    if (req.method !== 'POST' || !sameOrigin(req) || !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= LIMIT) chunks.push(c);
    });
    req.on('end', () => {
      void (async () => {
        if (size > LIMIT) return send(res, 413, { error: 'too large' });
        let entries: unknown;
        try {
          entries = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { entries?: unknown }).entries;
        } catch {
          return send(res, 400, { error: 'json' });
        }
        if (!Array.isArray(entries) || !entries.every(isEntry)) return send(res, 400, { error: 'entries' });
        await mkdir(dirname(file), { recursive: true });
        if (entries.length > 0) await appendFile(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
        send(res, 200, { written: entries.length });
      })().catch((err: unknown) => send(res, 500, { error: String(err) }));
    });
  };
}

export default function braiseJournal(): Plugin {
  return {
    name: 'braise-journal',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const file = process.env.BRAISE_JOURNAL_FILE ? resolve(process.env.BRAISE_JOURNAL_FILE) : JOURNAL_FILE;
      if (file !== JOURNAL_FILE) server.config.logger.warn(`\n  [braise-journal] les fiches vont dans ${file}\n`);
      server.middlewares.use(journalMiddleware(file));
    },
  };
}
