/**
 * L'hôte : là où le jeu tourne (navigateur ou lecteur OwlLeaf).
 * Le jeu ne sait pas où il est ; il parle à cette interface.
 */
export interface Host {
  readonly id: 'browser' | 'owl' | 'memory';
  read(name: string): Promise<string | null>;
  /** Écriture atomique. */
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Ferme le jeu, si l'hôte le permet. */
  quit(): void;
  onPause(listener: () => void): void;
  onResume(listener: () => void): void;
  readonly canQuit: boolean;
  /** Le profil OwlLeaf actif, s'il est connu. */
  readonly profileName: string | null;
}

/** Le pont injecté par le lecteur OwlLeaf (document 09 §5). */
interface OwlHostBridge {
  info(): string;
  read(name: string): string | null | undefined;
  write(name: string, text: string): boolean;
  remove(name: string): boolean;
  quit(): void;
}

/** Hôte en mémoire, pour les tests. */
export function createMemoryHost(initial: Record<string, string> = {}): Host & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    id: 'memory',
    files,
    async read(name) {
      return files.has(name) ? (files.get(name) as string) : null;
    },
    async write(name, text) {
      files.set(name, text);
    },
    async remove(name) {
      files.delete(name);
    },
    quit() {},
    onPause() {},
    onResume() {},
    canQuit: false,
    profileName: null,
  };
}

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = run(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Hôte du navigateur : IndexedDB, avec une copie dans localStorage si elle tient. */
export function createBrowserHost(gameId: string): Host {
  const prefix = `${gameId}:`;
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = (): Promise<IDBDatabase | null> => {
    if (!dbPromise) {
      dbPromise = typeof indexedDB === 'undefined' ? Promise.resolve(null) : openDb(`owl-${gameId}`).catch(() => null);
    }
    return dbPromise;
  };
  const local = {
    get(name: string): string | null {
      try {
        return localStorage.getItem(prefix + name);
      } catch {
        return null;
      }
    },
    set(name: string, text: string): void {
      try {
        localStorage.setItem(prefix + name, text);
      } catch {
        /* trop gros ou indisponible : IndexedDB fait foi */
      }
    },
    del(name: string): void {
      try {
        localStorage.removeItem(prefix + name);
      } catch {
        /* rien */
      }
    },
  };
  return {
    id: 'browser',
    async read(name) {
      const d = await db();
      if (d) {
        try {
          const v = await idb<string | undefined>(d, 'readonly', (s) => s.get(name));
          if (typeof v === 'string') return v;
        } catch {
          /* on retombe sur localStorage */
        }
      }
      return local.get(name);
    },
    async write(name, text) {
      const d = await db();
      // Une transaction IndexedDB est atomique : elle est validée en entier ou pas du tout.
      if (d) await idb(d, 'readwrite', (s) => s.put(text, name));
      local.set(name, text);
    },
    async remove(name) {
      const d = await db();
      if (d) await idb(d, 'readwrite', (s) => s.delete(name));
      local.del(name);
    },
    quit() {},
    onPause(listener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) listener();
      });
      window.addEventListener('pagehide', listener);
    },
    onResume(listener) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) listener();
      });
    },
    canQuit: false,
    profileName: null,
  };
}

/** Hôte OwlLeaf : enveloppe le pont synchrone `window.OwlHost`. */
export function createOwlHost(bridge: OwlHostBridge): Host {
  let profile: string | null = null;
  try {
    const info = JSON.parse(bridge.info()) as { profile?: string | null };
    profile = info.profile ?? null;
  } catch {
    profile = null;
  }
  return {
    id: 'owl',
    async read(name) {
      return bridge.read(name) ?? null;
    },
    async write(name, text) {
      if (!bridge.write(name, text)) throw new Error(`OwlHost: écriture refusée (${name})`);
    },
    async remove(name) {
      bridge.remove(name);
    },
    quit() {
      bridge.quit();
    },
    onPause(listener) {
      window.addEventListener('owl:pause', listener);
    },
    onResume(listener) {
      window.addEventListener('owl:resume', listener);
    },
    canQuit: true,
    profileName: profile,
  };
}

/** Choisit l'hôte au démarrage : OwlLeaf si le pont existe, sinon le navigateur. */
export function detectHost(gameId: string): Host {
  const bridge = (globalThis as { OwlHost?: OwlHostBridge }).OwlHost;
  return bridge ? createOwlHost(bridge) : createBrowserHost(gameId);
}
