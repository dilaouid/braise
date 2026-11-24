import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorApi, editorMiddleware, makeValidator, type EditorApi } from '../../tools/vite-editor.ts';

const PACKAGE = join(__dirname, '..', '..');
const CONTENT = join(PACKAGE, 'content');

let dir = '';
let api: EditorApi;

/** Tous les fichiers d'un dossier et leur texte, pour voir ce qui a changé. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(root, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return out;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'braise-editeur-'));
  cpSync(CONTENT, dir, { recursive: true });
  api = createEditorApi({
    contentDir: dir,
    validate: makeValidator((path) => import(/* @vite-ignore */ join(PACKAGE, path)), dir, join(PACKAGE, 'public')),
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('greffon de l\'éditeur : écriture sans demi-mesure', () => {
  it('si le second renommage échoue, le premier fichier est remis comme avant et rien ne traîne', async () => {
    const { rename } = await import('node:fs/promises');
    const failing = createEditorApi({
      contentDir: dir,
      validate: async () => [],
      fs: {
        rename: async (from: string, to: string) => {
          if (to.endsWith('fr.json')) throw new Error('disque plein');
          await rename(from, to);
        },
      },
    });
    const c = await failing.readContent();
    const before = snapshot(dir);
    const res = await failing.save({
      files: {
        dialogues: c.files.dialogues.replace('{"seconds":1.2,', '{"seconds":2,'),
        fr: c.files.fr.replace('"Recommence encore !"', '"Encore !"'),
      },
      hashes: c.hashes,
    });
    expect(res.status).toBe(500);
    expect((res.body as { message: string }).message).toContain('disque plein');
    expect(snapshot(dir)).toEqual(before);
    // Les empreintes de départ restent bonnes : l'enregistrement suivant passe.
    const again = await api.save({ files: { ...c.files, fr: c.files.fr.replace('"Recommence encore !"', '"Encore !"') }, hashes: c.hashes });
    expect(again.status).toBe(200);
  });
});

describe('greffon de l\'éditeur : copie de contenu et page du jeu', () => {
  it('dit quel dossier il lit, et si c\'est une copie', async () => {
    const copied = createEditorApi({ contentDir: dir, validate: async () => [], override: true });
    const c = await copied.readContent();
    expect(c.override).toBe(true);
    expect(c.contentDir).toBe(dir);
    expect((await api.readContent()).override).toBe(false);
  });

  it('pose l\'écoute du rechargement dans index.html avant le jeu, et pas dans editor.html', async () => {
    const plugin = (await import('../../tools/vite-editor.ts')).default();
    const hook = plugin.transformIndexHtml as unknown as (html: string, ctx: { path: string }) => unknown;
    const game = JSON.stringify(hook('<html></html>', { path: '/index.html' }));
    expect(game).toContain('braise:content');
    expect(game).toContain('location.reload');
    expect(game).toContain('head-prepend');
    expect(hook('<html></html>', { path: '/editor.html' }) ?? []).toEqual([]);
  });
});

describe('greffon de l\'éditeur : lecture', () => {
  it('rend les deux fichiers, leurs empreintes, le tutoriel et les cinématiques', async () => {
    const c = await api.readContent();
    expect(c.files.dialogues).toBe(readFileSync(join(dir, 'dialogues.json'), 'utf8'));
    expect(c.files.fr).toBe(readFileSync(join(dir, 'i18n/fr.json'), 'utf8'));
    expect(c.hashes.dialogues).toMatch(/^[0-9a-f]{64}$/);
    expect(c.hashes.fr).not.toBe(c.hashes.dialogues);
    expect((c.tutorial as { steps: unknown[] }).steps.length).toBeGreaterThan(10);
    expect(Object.keys(c.cinematics).sort()).toEqual(['intro', 'memory-meeting', 'stag-ash', 'stag-call']);
  });
});

describe('greffon de l\'éditeur : enregistrement', () => {
  it('un enregistrement valide écrit les deux fichiers et rien d\'autre', async () => {
    const before = snapshot(dir);
    const c = await api.readContent();
    const fr = c.files.fr.replace('"dialog.tuto.room3.2": "On est coincé ici ?"', '"dialog.tuto.room3.2": "On est coincé ici ? Vraiment ?"');
    const dialogues = c.files.dialogues.replace('{"seconds":1.2,', '{"seconds":2,');
    const res = await api.save({ files: { dialogues, fr }, hashes: c.hashes });
    expect(res.status).toBe(200);
    const after = snapshot(dir);
    expect(after['i18n/fr.json']).toBe(fr);
    expect(after['dialogues.json']).toBe(dialogues);
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]).sort();
    expect(changed).toEqual(['dialogues.json', 'i18n/fr.json']);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    // Les nouvelles empreintes permettent l'enregistrement suivant.
    const next = await api.save({ files: { dialogues, fr: c.files.fr }, hashes: (res.body as { hashes: typeof c.hashes }).hashes });
    expect(next.status).toBe(200);
    expect(await api.wasWrittenByEditor(join(dir, 'i18n/fr.json'))).toBe(true);
  });

  it('une empreinte périmée est refusée (409) sans rien écrire', async () => {
    const c = await api.readContent();
    // Changé à la main entre le chargement et l'enregistrement.
    const hand = c.files.fr.replace('"Vraiment ? Tu t\'es endormi ?"', '"Debout !"');
    writeFileSync(join(dir, 'i18n/fr.json'), hand);
    const before = snapshot(dir);
    const res = await api.save({ files: { dialogues: c.files.dialogues, fr: c.files.fr.replace('"Recommence encore !"', '"Encore !"') }, hashes: c.hashes });
    expect(res.status).toBe(409);
    expect(snapshot(dir)).toEqual(before);
    expect(await api.wasWrittenByEditor(join(dir, 'i18n/fr.json'))).toBe(false);
  });

  it('deux enregistrements rapides avec les mêmes empreintes : le second est refusé', async () => {
    const c = await api.readContent();
    const a = c.files.fr.replace('"Recommence encore !"', '"Encore une fois."');
    const b = c.files.fr.replace('"Recommence encore !"', '"Et encore."');
    const [ra, rb] = await Promise.all([
      api.save({ files: { dialogues: c.files.dialogues, fr: a }, hashes: c.hashes }),
      api.save({ files: { dialogues: c.files.dialogues, fr: b }, hashes: c.hashes }),
    ]);
    expect([ra.status, rb.status]).toEqual([200, 409]);
    expect(readFileSync(join(dir, 'i18n/fr.json'), 'utf8')).toBe(a);
  });

  it('un contenu invalide est refusé (422) avec ses erreurs, sans rien écrire', async () => {
    const c = await api.readContent();
    const before = snapshot(dir);
    const long = c.files.fr.replace('"Vraiment ? Tu t\'es endormi ?"', JSON.stringify('a'.repeat(161)));
    const res = await api.save({ files: { dialogues: c.files.dialogues, fr: long }, hashes: c.hashes });
    expect(res.status).toBe(422);
    expect((res.body as { errors: string[] }).errors.join('\n')).toContain('tuto.death.1');
    // Une phrase de cinématique manquante est vue aussi.
    const noCaption = c.files.fr.replace(/\r?\n {2}"cine\.memory-meeting\.t2": "[^"]*",/, '');
    const res2 = await api.save({ files: { dialogues: c.files.dialogues, fr: noCaption }, hashes: c.hashes });
    expect(res2.status).toBe(422);
    expect((res2.body as { errors: string[] }).errors.join('\n')).toContain('cine.memory-meeting.t2');
    // Du JSON cassé.
    const res3 = await api.save({ files: { dialogues: c.files.dialogues.slice(0, -10), fr: c.files.fr }, hashes: c.hashes });
    expect(res3.status).toBe(422);
    expect(snapshot(dir)).toEqual(before);
  });

  it('un autre chemin ne peut pas être écrit', async () => {
    const c = await api.readContent();
    const before = snapshot(dir);
    const res = await api.save({
      files: { dialogues: c.files.dialogues, fr: c.files.fr, tutorial: '{}', '../evil.json': '{}', 'i18n/en.json': '{}' },
      hashes: c.hashes,
    });
    expect(res.status).toBe(200);
    expect(snapshot(dir)).toEqual(before);
    const bad = await api.save({ files: { dialogues: 1, fr: c.files.fr }, hashes: c.hashes });
    expect(bad.status).toBe(400);
    expect(snapshot(dir)).toEqual(before);
  });
});

/** Une requête et une réponse simulées, sans serveur. */
async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown; nexted: boolean }> {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as Readable & Record<string, unknown>;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:5183', 'content-type': 'application/json', ...headers };
  let status = 200;
  let text = '';
  let nexted = false;
  await new Promise<void>((done) => {
    const res = {
      set statusCode(v: number) { status = v; },
      get statusCode() { return status; },
      setHeader: () => undefined,
      end: (t?: string) => { text = t ?? ''; done(); },
    };
    void editorMiddleware(api)(req as never, res as never, () => { nexted = true; done(); });
  });
  return { status, json: text ? JSON.parse(text) : null, nexted };
}

describe('greffon de l\'éditeur : adresses', () => {
  it('sert le contenu et enregistre par HTTP', async () => {
    const got = await call('GET', '/__editor/content');
    expect(got.status).toBe(200);
    const c = got.json as Awaited<ReturnType<EditorApi['readContent']>>;
    const saved = await call('POST', '/__editor/save', { files: c.files, hashes: c.hashes });
    expect(saved.status).toBe(200);
  });

  it('laisse passer les autres adresses et refuse une autre origine', async () => {
    expect((await call('GET', '/index.html')).nexted).toBe(true);
    const c = (await call('GET', '/__editor/content')).json as Awaited<ReturnType<EditorApi['readContent']>>;
    const before = snapshot(dir);
    const foreign = await call('POST', '/__editor/save', { files: { ...c.files, fr: c.files.fr.replace('"Recommence encore !"', '"Non."') }, hashes: c.hashes }, { origin: 'http://ailleurs.example' });
    expect(foreign.status).toBe(403);
    expect(snapshot(dir)).toEqual(before);
  });
});
