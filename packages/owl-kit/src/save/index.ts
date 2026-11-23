import type { Host } from '../host/index.ts';

/** Une migration amène une sauvegarde de la version N à la version N + 1. */
export type Migration = (old: any) => any;

export interface SaveStoreOptions<T> {
  host: Host;
  /** Nom de base du fichier, sans extension (« save »). */
  name: string;
  /** Version courante du format. */
  version: number;
  /** `migrations[n]` transforme une sauvegarde de version n en version n + 1. */
  migrations: Record<number, Migration>;
  /** Vérifie la forme après migration. Lève une erreur si elle est fausse. */
  validate?: (data: unknown) => T;
}

export type LoadSource = 'main' | 'bak1' | 'bak2' | 'none';

export interface LoadResult<T> {
  data: T | null;
  /** Le fichier qui a servi. */
  source: LoadSource;
  /** « newer » : la sauvegarde vient d'une version plus récente du jeu ; rien n'est écrasé. */
  error: 'newer' | 'corrupt' | null;
}

export interface SaveStore<T> {
  load(): Promise<LoadResult<T>>;
  save(data: T): Promise<void>;
  erase(): Promise<void>;
  /** Le texte exportable de la sauvegarde. */
  exportText(data: T): string;
  /** Lit un texte importé, le migre et le valide. */
  importText(text: string): LoadResult<T>;
}

const BACKUP_EVERY_MS = 60_000;

/**
 * Sauvegarde versionnée, avec deux copies de secours tournantes.
 * L'écriture est atomique si celle de l'hôte l'est.
 */
export function createSaveStore<T extends { version: number }>(options: SaveStoreOptions<T>): SaveStore<T> {
  const { host, name, version, migrations } = options;
  const main = `${name}.json`;
  const bak1 = `${name}.bak1`;
  const bak2 = `${name}.bak2`;
  let lastBackupAt = -Infinity;
  let blockedByNewer = false;

  function parse(text: string): { data: T | null; error: 'newer' | 'corrupt' | null } {
    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch {
      return { data: null, error: 'corrupt' };
    }
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') return { data: null, error: 'corrupt' };
    if (raw.version > version) return { data: null, error: 'newer' };
    try {
      while (raw.version < version) {
        const migrate = migrations[raw.version];
        if (!migrate) return { data: null, error: 'corrupt' };
        const from = raw.version as number;
        raw = migrate(raw);
        raw.version = from + 1;
      }
      const data = options.validate ? options.validate(raw) : (raw as T);
      return { data, error: null };
    } catch {
      return { data: null, error: 'corrupt' };
    }
  }

  return {
    async load() {
      const order: Array<[string, LoadSource]> = [[main, 'main'], [bak1, 'bak1'], [bak2, 'bak2']];
      let sawCorrupt = false;
      for (const [file, source] of order) {
        const text = await host.read(file);
        if (text === null) continue;
        const res = parse(text);
        if (res.error === 'newer') {
          blockedByNewer = true;
          return { data: null, source, error: 'newer' };
        }
        if (res.data) return { data: res.data, source, error: null };
        sawCorrupt = true;
      }
      return { data: null, source: 'none', error: sawCorrupt ? 'corrupt' : null };
    },

    async save(data) {
      // Une sauvegarde plus récente que le jeu n'est jamais écrasée.
      if (blockedByNewer) return;
      const text = JSON.stringify(data);
      const now = Date.now();
      if (now - lastBackupAt >= BACKUP_EVERY_MS) {
        const current = await host.read(main);
        if (current !== null && parse(current).data) {
          const older = await host.read(bak1);
          if (older !== null) await host.write(bak2, older);
          await host.write(bak1, current);
        }
        lastBackupAt = now;
      }
      await host.write(main, text);
    },

    async erase() {
      blockedByNewer = false;
      await host.remove(main);
      await host.remove(bak1);
      await host.remove(bak2);
    },

    exportText(data) {
      return JSON.stringify(data, null, 2);
    },

    importText(text) {
      const res = parse(text);
      return { data: res.data, source: res.data ? 'main' : 'none', error: res.error };
    },
  };
}
