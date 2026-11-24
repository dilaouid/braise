import { createMemoryHost } from '@owl/kit/host';
import { createSaveStore } from '@owl/kit/save';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS, SAVE_VERSION, migrateV1toV2, newHero, newSave, validateSave, type RunSnapshot, type Save,
} from '../../src/meta/save.ts';
import { CLASS } from './helpers.ts';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/saves');
const fixture = (name: string): any => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function snapshot(): RunSnapshot {
  return {
    format: 1, savedAt: 1795424400000, classId: CLASS, regionId: 'region.ash-woods', vigil: 1, seed: 42,
    seconds: 312.5, runLevel: 9, state: { hero: { hp: 55 }, rng: [1, 2, 3, 4] },
  };
}

describe('format de sauvegarde v2 (document 08 §7)', () => {
  it('la version courante est 2, et chaque version passée a sa migration', () => {
    expect(SAVE_VERSION).toBe(2);
    for (let v = 1; v < SAVE_VERSION; v++) expect(typeof MIGRATIONS[v], `migration v${v}`).toBe('function');
    expect(MIGRATIONS[1]).toBe(migrateV1toV2);
  });

  it('une sauvegarde neuve est en v2 : un héros neuf n\'a ni talent, ni disposition, ni équipement', () => {
    const save = newSave(123);
    expect(save.version).toBe(2);
    expect(save.run).toBeNull();
    expect(newHero()).toMatchObject({ talents: {}, loadouts: [], equipment: {} });
  });

  it('une sauvegarde v2 complète se relit telle quelle', () => {
    const save = newSave(123);
    const hero = newHero();
    hero.level = 34;
    hero.talents = { 'talent.ash-blade.blade.edge': 5, 'talent.ash-blade.blade.gash': 2 };
    hero.loadouts = [{ 'talent.ash-blade.blade.edge': 5 }, { 'talent.ash-blade.pyre.embers': 3 }];
    hero.equipment = { weapon: null, lantern: { base: 'item.old-lantern', itemLevel: 3 } };
    save.heroes[CLASS] = hero;
    save.activeHero = CLASS;
    save.run = snapshot();
    expect(validateSave(clone(save))).toEqual(save);
  });

  it('les champs manquants d\'un héros sont complétés, les rangs faux retirés', () => {
    const loaded = validateSave({
      version: 2, account: {},
      heroes: {
        [CLASS]: {
          level: 12,
          talents: { good: 3, zero: 0, negative: -2, text: 'x', fraction: 2.7 },
          loadouts: [{ good: 1, bad: null }, 'nope', null],
          equipment: { weapon: null, ring: 7, lantern: { base: 'item.old-lantern' } },
        },
        'class.other': {},
      },
    });
    const hero = loaded.heroes[CLASS]!;
    expect(hero.talents).toEqual({ good: 3, fraction: 2 });
    expect(hero.loadouts).toEqual([{ good: 1 }]);
    expect(hero.equipment).toEqual({ weapon: null, lantern: { base: 'item.old-lantern' } });
    expect(loaded.heroes['class.other']).toEqual(newHero());
  });

  it('un instantané de partie est gardé s\'il est entier, abandonné s\'il est abîmé', () => {
    const base = { version: 2, account: {} };
    expect(validateSave({ ...base, run: snapshot() }).run).toEqual(snapshot());
    expect(validateSave({ ...base, run: null }).run).toBeNull();
    expect(validateSave({ ...base }).run).toBeNull();
    expect(validateSave({ ...base, run: 'oui' }).run).toBeNull();
    expect(validateSave({ ...base, run: { ...snapshot(), classId: 7 } }).run).toBeNull();
    expect(validateSave({ ...base, run: { ...snapshot(), seconds: Number.NaN } }).run).toBeNull();
    const { state: _state, ...withoutState } = snapshot();
    expect(validateSave({ ...base, run: withoutState }).run).toBeNull();
  });

  it('seule la version courante est validée : une v1 doit d\'abord être migrée', () => {
    expect(() => validateSave(null)).toThrow();
    expect(() => validateSave({ version: 2 })).toThrow();
    expect(() => validateSave({ version: 1, account: {} })).toThrow();
    expect(() => validateSave({ version: 3, account: {} })).toThrow();
    expect(() => validateSave(fixture('v1-m1-played'))).toThrow();
  });
});

describe('migration v1 → v2', () => {
  it('est une fonction pure : la sauvegarde v1 reçue n\'est pas modifiée', () => {
    const v1 = fixture('v1-m1-played');
    const before = clone(v1);
    const out = migrateV1toV2(v1);
    expect(v1).toEqual(before);
    // Rien de partagé entre l'entrée et la sortie.
    out.account.altar['altar.ardor'] = 0;
    out.heroes[CLASS].freeAttributes.str = 0;
    expect(v1).toEqual(before);
  });

  it('ajoute aux héros les dispositions et l\'équipement, vides, et garde tout le reste', () => {
    const v1 = fixture('v1-m1-played');
    const v2 = validateSave({ ...migrateV1toV2(v1), version: 2 });
    expect(v2.version).toBe(2);
    expect(v2.run).toBeNull();
    expect(v2.heroes[CLASS]).toEqual({ ...v1.heroes[CLASS], loadouts: [], equipment: {} });
    // Le compte, les réglages et les dates sont ceux de M1, au champ près.
    // La Lanterne, plus récente, y est ajoutée neuve.
    expect(v2.account).toEqual({ ...v1.account, lantern: newSave(0).account.lantern });
    expect(v2.settings).toEqual(v1.settings);
    expect(v2.activeHero).toBe(v1.activeHero);
    expect({ createdAt: v2.createdAt, updatedAt: v2.updatedAt, playSeconds: v2.playSeconds })
      .toEqual({ createdAt: v1.createdAt, updatedAt: v1.updatedAt, playSeconds: v1.playSeconds });
  });

  it('les points libres répartis d\'office en M1 restent placés', () => {
    const v2 = validateSave({ ...migrateV1toV2(fixture('v1-m1-played')), version: 2 });
    expect(v2.heroes[CLASS]!.freeAttributes).toEqual({ str: 10, agi: 5, spi: 0, vig: 5, luck: 0 });
  });

  it('une partie v1 tout juste commencée devient une partie v2 tout juste commencée', () => {
    const v1 = fixture('v1-m1-new');
    const v2 = validateSave({ ...migrateV1toV2(v1), version: 2 });
    const fresh = newSave(v1.createdAt);
    fresh.heroes[CLASS] = newHero();
    fresh.activeHero = CLASS;
    expect(v2).toEqual(fresh);
  });

  it('tolère une v1 abîmée : héros sans champs, pas de héros du tout', () => {
    expect(() => migrateV1toV2({ version: 1, account: {} } as any)).not.toThrow();
    const out = migrateV1toV2({ version: 1, account: {}, heroes: { [CLASS]: { level: 4 } } } as any);
    expect(validateSave({ ...out, version: 2 }).heroes[CLASS]).toMatchObject({ level: 4, talents: {}, loadouts: [], equipment: {} });
  });
});

describe('une sauvegarde de M1 dans le magasin de M2', () => {
  const store = (host: ReturnType<typeof createMemoryHost>) =>
    createSaveStore<Save>({ host, name: 'save', version: SAVE_VERSION, migrations: MIGRATIONS, validate: validateSave });
  const text = readFileSync(resolve(DIR, 'v1-m1-played.json'), 'utf8');

  it('se charge en v2', async () => {
    const res = await store(createMemoryHost({ 'save.json': text })).load();
    expect(res.error).toBeNull();
    expect(res.data!.version).toBe(2);
    expect(res.data!.heroes[CLASS]!.level).toBe(21);
  });

  it('à la première écriture, le fichier passe en v2 et l\'original v1 est gardé dans save.bak1', async () => {
    const host = createMemoryHost({ 'save.json': text });
    const s = store(host);
    const { data } = await s.load();
    data!.account.ashes += 1;
    await s.save(data!);
    expect(JSON.parse(host.files.get('save.json')!).version).toBe(2);
    expect(JSON.parse(host.files.get('save.json')!).account.ashes).toBe(629);
    expect(host.files.get('save.bak1')).toBe(text);
  });

  it('si le fichier principal est illisible, une copie de secours v1 est migrée elle aussi', async () => {
    const res = await store(createMemoryHost({ 'save.json': '{ abîmé', 'save.bak1': text })).load();
    expect(res.source).toBe('bak1');
    expect(res.data!.version).toBe(2);
    expect(res.data!.account.ashes).toBe(628);
  });

  it('l\'export puis l\'import d\'une v1 donnent une v2', () => {
    const s = store(createMemoryHost());
    const res = s.importText(text);
    expect(res.error).toBeNull();
    expect(res.data!.version).toBe(2);
    expect(s.importText(s.exportText(res.data!)).data).toEqual(res.data);
  });

  it('reste loin de la limite de 200 Ko', () => {
    const v2 = validateSave({ ...migrateV1toV2(JSON.parse(text)), version: 2 });
    expect(JSON.stringify(v2).length).toBeLessThan(200_000);
  });
});
