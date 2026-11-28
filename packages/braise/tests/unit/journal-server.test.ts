import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { journalMiddleware } from '../../tools/vite-journal.ts';

const dir = mkdtempSync(join(tmpdir(), 'braise-journal-'));
const file = join(dir, 'sous', 'parties.jsonl');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const entry = (seed: number): Record<string, unknown> => ({ v: 1, source: 'joueur', date: '2026-11-28T10:00:00.000Z', seed, outcome: 'death', minutes: [] });

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; nexted: boolean }> {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as Readable & Record<string, unknown>;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:5183', 'content-type': 'application/json', ...headers };
  let status = 200;
  let nexted = false;
  await new Promise<void>((done) => {
    const res = {
      set statusCode(v: number) { status = v; },
      get statusCode() { return status; },
      setHeader: () => undefined,
      end: () => done(),
    };
    journalMiddleware(file)(req as never, res as never, () => { nexted = true; done(); });
  });
  return { status, nexted };
}

describe('journal des parties : le serveur de développement', () => {
  it('ajoute une ligne par fiche, et crée le dossier', async () => {
    expect((await call('POST', '/__journal/add', { entries: [entry(1), entry(2)] })).status).toBe(200);
    expect((await call('POST', '/__journal/add', { entries: [entry(3)] })).status).toBe(200);
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { seed: number });
    expect(lines.map((l) => l.seed)).toEqual([1, 2, 3]);
  });

  it('refuse une fiche illisible, une autre origine et une autre méthode, sans rien écrire', async () => {
    const before = readFileSync(file, 'utf8');
    expect((await call('POST', '/__journal/add', { entries: [{ v: 2 }] })).status).toBe(400);
    expect((await call('POST', '/__journal/add', { entries: [entry(4)] }, { origin: 'http://ailleurs.example' })).status).toBe(403);
    expect((await call('GET', '/__journal/add')).status).toBe(403);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('laisse passer les autres adresses', async () => {
    expect((await call('GET', '/index.html')).nexted).toBe(true);
  });
});
