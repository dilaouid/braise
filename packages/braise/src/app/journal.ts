import type { JournalEntry } from '../core/journal.ts';

/**
 * Où vont les fiches du journal. Toujours dans le navigateur (les 300 dernières), et, en développement,
 * dans `docs/journal/parties.jsonl` par le serveur Vite. Une fiche que le serveur n'a pas reçue attend
 * la partie suivante ou le prochain lancement.
 */
const KEPT = 'braise:journal';
const PENDING = 'braise:journal.pending';
const MAX = 300;

function read(key: string): JournalEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, list: JournalEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(-MAX)));
  } catch {
    // Stockage plein ou refusé : le journal n'est pas une sauvegarde, on s'en passe.
  }
}

/** Les fiches gardées dans le navigateur. */
export function journalEntries(): JournalEntry[] {
  return read(KEPT);
}

/** Envoie au serveur de développement les fiches qu'il n'a pas encore. */
export async function flushJournal(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const pending = read(PENDING);
  if (pending.length === 0) return;
  try {
    const res = await fetch('/__journal/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: pending }) });
    if (!res.ok) return;
    // D'autres fiches ont pu arriver pendant l'envoi : on ne retire que celles qui sont parties.
    const sent = new Set(pending.map((e) => `${e.date}|${e.seed}`));
    write(PENDING, read(PENDING).filter((e) => !sent.has(`${e.date}|${e.seed}`)));
  } catch {
    // Serveur arrêté : la fiche attend.
  }
}

/** Garde une fiche, puis tente de l'envoyer. */
export function recordJournal(entry: JournalEntry): void {
  write(KEPT, [...read(KEPT), entry]);
  if (import.meta.env.DEV) {
    write(PENDING, [...read(PENDING), entry]);
    void flushJournal();
  }
}
