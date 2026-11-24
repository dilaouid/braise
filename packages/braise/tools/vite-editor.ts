/**
 * Greffon de développement de l'éditeur de texte d'histoire (editor.html).
 *
 * - `GET /__editor/content` : `dialogues.json` et `i18n/fr.json` bruts, avec leurs empreintes,
 *   le tutoriel et les cinématiques.
 * - `POST /__editor/save` `{ files, hashes }` : refuse si un fichier a changé sur le disque (409),
 *   valide le contenu complet avec la validation du jeu (422), puis écrit les deux fichiers, chacun
 *   par un fichier temporaire renommé. Il n'écrit rien d'autre.
 * - Un changement d'un JSON de `content/` ne recharge plus toutes les pages : le greffon envoie
 *   l'événement `braise:content` ; le jeu se recharge, l'éditeur affiche un bandeau.
 *
 * Ce fichier est chargé avec vite.config.ts : il n'importe ni `src/` ni `content/` (sinon Vite
 * redémarrerait à chaque enregistrement). La validation du jeu est chargée à la demande, par Vite.
 * `apply: 'serve'` : rien de tout ça n'existe dans le jeu construit.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot, type Plugin, type ViteDevServer } from 'vite';

/** Les deux fichiers que l'éditeur écrit, et eux seuls. */
const FILES = { dialogues: 'dialogues.json', fr: 'i18n/fr.json' } as const;
type FileName = keyof typeof FILES;
const NAMES = Object.keys(FILES) as FileName[];

export const CONTENT_EVENT = 'braise:content';
const PREFIX = '/__editor/';
const MAX_BODY = 4 * 1024 * 1024;

export interface ContentPayload {
  files: Record<FileName, string>;
  hashes: Record<FileName, string>;
  tutorial: unknown;
  cinematics: Record<string, unknown>;
}

export interface SaveResult {
  status: number;
  body: unknown;
}

/** Valide le contenu complet avec ces deux fichiers à la place des livrés ; rend les erreurs. */
export type Validator = (raw: { dialogues: unknown; fr: Record<string, string> }) => Promise<string[]>;

export interface EditorApi {
  readContent(): Promise<ContentPayload>;
  save(body: unknown): Promise<SaveResult>;
  /** Vrai si le fichier a exactement le texte que l'éditeur vient d'y écrire. */
  wasWrittenByEditor(file: string): Promise<boolean>;
}

const hash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

/**
 * La validation du jeu, chargée par `load` (Vite en développement, `import` dans les tests) :
 * `compileContent` sur tout le contenu, et `compileCinematic` sur chaque cinématique du dossier.
 */
export function makeValidator(load: (path: string) => Promise<Record<string, unknown>>, contentDir: string, publicDir: string): Validator {
  return async (raw) => {
    const content = await load('src/content/index.ts') as {
      RAW: Record<string, unknown>;
      compileContent: (r: unknown) => { errors: string[] };
    };
    const cinematic = await load('src/content/cinematic.ts') as {
      compileCinematic: (r: unknown, fr: Record<string, string>, sounds?: Set<string>) => { errors: string[] };
    };
    const errors = [...content.compileContent({ ...content.RAW, dialogues: raw.dialogues, fr: raw.fr }).errors];
    let sounds: Set<string> | undefined;
    try {
      sounds = new Set(Object.keys(JSON.parse(await readText(join(publicDir, 'audio/index.json'))) as object));
    } catch {
      sounds = undefined;
    }
    for (const [id, cine] of Object.entries(await readCinematics(contentDir))) {
      for (const e of cinematic.compileCinematic(cine, raw.fr, sounds).errors) errors.push(`cinematics/${id}.json: ${e}`);
    }
    return errors;
  };
}

async function readCinematics(contentDir: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const dir = join(contentDir, 'cinematics');
  if (!existsSync(dir)) return out;
  for (const name of (await readdir(dir)).sort()) {
    if (name.endsWith('.json')) out[name.slice(0, -5)] = JSON.parse(await readText(join(dir, name)));
  }
  return out;
}

function isStringMap(v: unknown): v is Record<string, string> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');
}

/** Ce que le greffon sait faire, sans serveur : lire, et enregistrer avec ses garde-fous. */
export function createEditorApi(opts: { contentDir: string; validate: Validator }): EditorApi {
  const dir = resolve(opts.contentDir);
  const pathOf = (name: FileName): string => join(dir, FILES[name]);
  /** Les empreintes de ce que l'éditeur a écrit en dernier, par chemin. */
  const written = new Map<string, string>();
  /** Un enregistrement à la fois : le second voit les fichiers écrits par le premier. */
  let queue: Promise<unknown> = Promise.resolve();

  async function readContent(): Promise<ContentPayload> {
    const files = { dialogues: await readText(pathOf('dialogues')), fr: await readText(pathOf('fr')) };
    return {
      files,
      hashes: { dialogues: hash(files.dialogues), fr: hash(files.fr) },
      tutorial: JSON.parse(await readText(join(dir, 'tutorial.json'))),
      cinematics: await readCinematics(dir),
    };
  }

  async function saveNow(body: unknown): Promise<SaveResult> {
    const b = (body ?? {}) as { files?: Record<string, unknown>; hashes?: Record<string, unknown> };
    const files = {} as Record<FileName, string>;
    const hashes = {} as Record<FileName, string>;
    for (const name of NAMES) {
      const text = b.files?.[name];
      const h = b.hashes?.[name];
      if (typeof text !== 'string' || typeof h !== 'string') {
        return { status: 400, body: { error: 'bad-request', message: `Il manque « files.${name} » ou « hashes.${name} ».` } };
      }
      files[name] = text;
      hashes[name] = h;
    }

    // Un fichier changé sur le disque depuis le chargement : rien n'est écrit.
    const disk = {} as Record<FileName, string>;
    for (const name of NAMES) disk[name] = hash(await readText(pathOf(name)));
    const changed = NAMES.filter((name) => disk[name] !== hashes[name]);
    if (changed.length > 0) {
      return { status: 409, body: { error: 'changed', files: changed.map((n) => FILES[n]), hashes: disk } };
    }

    // La validation du jeu, sur le contenu complet.
    const errors: string[] = [];
    let dialogues: unknown = null;
    let fr: unknown = null;
    try {
      dialogues = JSON.parse(files.dialogues);
    } catch (e) {
      errors.push(`dialogues.json: JSON invalide — ${(e as Error).message}`);
    }
    try {
      fr = JSON.parse(files.fr);
      if (!isStringMap(fr)) errors.push('i18n/fr.json: chaque valeur doit être une phrase');
    } catch (e) {
      errors.push(`i18n/fr.json: JSON invalide — ${(e as Error).message}`);
    }
    if (errors.length === 0) errors.push(...await opts.validate({ dialogues, fr: fr as Record<string, string> }));
    if (errors.length > 0) return { status: 422, body: { error: 'invalid', errors } };

    // Écriture : chaque fichier dans un temporaire du même dossier, puis renommé par-dessus.
    const todo = NAMES.filter((name) => hash(files[name]) !== disk[name]);
    const temps: Array<{ name: FileName; tmp: string }> = [];
    try {
      for (const name of todo) {
        const target = pathOf(name);
        const tmp = join(dirname(target), `.${FILES[name].replace(/^.*\//, '')}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
        await writeFile(tmp, files[name], 'utf8');
        temps.push({ name, tmp });
      }
      for (const { name, tmp } of temps) {
        written.set(pathOf(name), hash(files[name]));
        await rename(tmp, pathOf(name));
      }
    } catch (e) {
      for (const { tmp } of temps) await unlink(tmp).catch(() => undefined);
      return { status: 500, body: { error: 'write', message: (e as Error).message } };
    }
    return { status: 200, body: { hashes: { dialogues: hash(files.dialogues), fr: hash(files.fr) }, written: todo.map((n) => FILES[n]) } };
  }

  return {
    readContent,
    save(body) {
      const run = queue.then(() => saveNow(body));
      queue = run.catch(() => undefined);
      return run;
    },
    async wasWrittenByEditor(file) {
      const want = written.get(resolve(file));
      if (!want) return false;
      try {
        return hash(await readText(file)) === want;
      } catch {
        return false;
      }
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY) throw new Error('trop gros');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Une page d'une autre origine ne peut pas enregistrer. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Les deux adresses de l'éditeur, en intergiciel Connect. */
export function editorMiddleware(api: EditorApi) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const url = (req.url ?? '').split('?')[0]!;
    if (!url.startsWith(PREFIX)) {
      next();
      return;
    }
    try {
      if (req.method === 'GET' && url === `${PREFIX}content`) {
        send(res, 200, await api.readContent());
      } else if (req.method === 'POST' && url === `${PREFIX}save`) {
        if (!sameOrigin(req) || !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          send(res, 403, { error: 'forbidden' });
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          send(res, 400, { error: 'bad-request', message: 'Corps illisible.' });
          return;
        }
        const r = await api.save(body);
        send(res, r.status, r.body);
      } else {
        send(res, 404, { error: 'not-found' });
      }
    } catch (e) {
      send(res, 500, { error: 'server', message: (e as Error).message });
    }
  };
}

const norm = (p: string): string => resolve(p).replace(/\\/g, '/').toLowerCase();

function inside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Le greffon. Le dossier de contenu est `content/`, ou `BRAISE_CONTENT_DIR` (pour les tests :
 * tout le serveur de développement lit alors cette copie).
 */
export default function braiseEditor(): Plugin {
  const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const shipped = join(packageDir, 'content');
  const contentDir = resolve(process.env.BRAISE_CONTENT_DIR || shipped);
  const redirected = norm(contentDir) !== norm(shipped);
  const isContentJson = (file: string): boolean => file.endsWith('.json') && (inside(contentDir, resolve(file)) || inside(shipped, resolve(file)));
  let api: EditorApi | null = null;

  return {
    name: 'braise-editor',
    apply: 'serve',

    config(user) {
      if (!redirected) return;
      // La copie de contenu est hors du dossier du projet : Vite doit avoir le droit de la servir.
      return { server: { fs: { allow: [searchForWorkspaceRoot(user.root ?? process.cwd()), contentDir] } } };
    },

    resolveId: {
      order: 'pre',
      handler(source, importer) {
        if (!redirected || !importer || !source.startsWith('.')) return null;
        const abs = resolve(dirname(importer.split('?')[0]!), source);
        return inside(shipped, abs) ? join(contentDir, relative(shipped, abs)) : null;
      },
    },

    configureServer(server: ViteDevServer) {
      api = createEditorApi({
        contentDir,
        validate: makeValidator((path) => server.ssrLoadModule(`/${path}`), contentDir, join(packageDir, 'public')),
      });
      server.middlewares.use(editorMiddleware(api));
      if (redirected) server.watcher.add(contentDir);

      // Un événement par fichier, une fois les écritures finies (un renommage en fait parfois deux).
      const pending = new Map<string, ReturnType<typeof setTimeout>>();
      const onFs = (file: string): void => {
        if (!inside(contentDir, resolve(file)) || !file.endsWith('.json')) return;
        const key = resolve(file);
        clearTimeout(pending.get(key));
        pending.set(key, setTimeout(() => {
          pending.delete(key);
          void (async () => {
            const fromEditor = await api!.wasWrittenByEditor(key);
            server.ws.send({ type: 'custom', event: CONTENT_EVENT, data: { file: relative(contentDir, key).replace(/\\/g, '/'), fromEditor } });
          })();
        }, 80));
      };
      server.watcher.on('change', onFs);
      server.watcher.on('add', onFs);
      server.watcher.on('unlink', onFs);
    },

    // Vite rechargerait toutes les pages : l'événement ci-dessus s'en charge, page par page.
    hotUpdate(options) {
      if (isContentJson(options.file)) return [];
    },
  };
}
