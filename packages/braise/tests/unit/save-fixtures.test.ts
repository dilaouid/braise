import { createMemoryHost } from '@owl/kit/host';
import { createSaveStore } from '@owl/kit/save';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SAVE_VERSION, validateSave } from '../../src/meta/save.ts';
import { CLASS } from './helpers.ts';

/**
 * Les sauvegardes d'exemple de chaque version passée (document 08 §7.2 et §14).
 * Elles ont été écrites par le jeu de leur époque et ne sont jamais réécrites :
 * chaque version du jeu doit savoir les charger.
 */
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/saves');
const read = (name: string): string => readFileSync(resolve(DIR, name), 'utf8');

/** Charge un texte de sauvegarde comme le fait le jeu : par le magasin, ses migrations et sa validation. */
async function load(text: string) {
  const host = createMemoryHost({ 'save.json': text });
  const store = createSaveStore({ host, name: 'save', version: SAVE_VERSION, migrations: MIGRATIONS, validate: validateSave });
  return store.load();
}

describe('sauvegardes d\'exemple', () => {
  it('chaque fichier porte la version que dit son nom', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const version = Number(/^v(\d+)-/.exec(file)?.[1]);
      expect(JSON.parse(read(file)).version, file).toBe(version);
    }
  });

  it('toutes se chargent dans la version courante', async () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
      const res = await load(read(file));
      expect(res.error, file).toBeNull();
      expect(res.source, file).toBe('main');
      expect(res.data?.version, file).toBe(SAVE_VERSION);
    }
  });

  it('v1 (jalon M1), partie neuve : un héros de niveau 1, rien d\'acheté', async () => {
    const { data } = await load(read('v1-m1-new.json'));
    expect(data!.activeHero).toBe(CLASS);
    expect(data!.heroes[CLASS]).toMatchObject({ level: 1, xp: 0, talents: {} });
    expect(data!.account).toMatchObject({ gold: 0, ashes: 0, altar: {}, regions: {} });
    expect(data!.createdAt).toBe(1795424400000);
  });

  it('v1 (jalon M1), partie jouée : rien de ce que le joueur a gagné n\'est perdu', async () => {
    const m1 = JSON.parse(read('v1-m1-played.json'));
    const { data } = await load(read('v1-m1-played.json'));
    const save = data!;
    expect(save.createdAt).toBe(m1.createdAt);
    expect(save.updatedAt).toBe(m1.updatedAt);
    expect(save.playSeconds).toBe(24234);
    expect(save.account.gold).toBe(14222);
    expect(save.account.ashes).toBe(628);
    expect(save.account.shards).toBe(0);
    expect(save.account.altar).toEqual({ 'altar.ardor': 10, 'altar.endurance': 10, 'altar.glow': 5, 'altar.wisdom': 5 });
    expect(save.account.altarDisabled).toEqual(['altar.wisdom']);
    expect(save.account.regions).toEqual({ 'region.ash-woods': { lit: true, bestVigil: 1, bossKills: 2 } });
    expect(save.account.codex.kills).toEqual(m1.account.codex.kills);
    expect(save.account.stats).toEqual({ runs: 24, victories: 2, kills: 104996, bestSeconds: 1499, bestRunLevel: 26 });
    expect(save.activeHero).toBe(CLASS);
    expect(save.heroes[CLASS]).toMatchObject({
      level: 21, xp: 3151, shardLevel: 0, bestDepth: 0, talents: {},
      freeAttributes: { str: 10, agi: 5, spi: 0, vig: 5, luck: 0 },
    });
    expect(save.settings).toMatchObject(m1.settings);
  });
});
