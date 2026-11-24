import { computed, signal } from '@preact/signals';
import { editorErrors, parseFiles, serialize, usedDialogues, type EditorFiles, type EditorModel } from './model.ts';

/**
 * L'état de la page de l'éditeur. Rien n'est écrit sur le disque avant « Enregistrer » ; les
 * changements non enregistrés sont aussi gardés dans le navigateur (brouillon local).
 */

export interface Hashes {
  dialogues: string;
  fr: string;
}

interface ContentPayload {
  files: EditorFiles;
  hashes: Hashes;
  tutorial: unknown;
  cinematics: Record<string, unknown>;
}

export type Tab = 'dialogues' | 'phrases';

/** Le modèle en cours d'édition. */
export const model = signal<EditorModel | null>(null);
/** Les fichiers tels que sur le disque au dernier chargement ou enregistrement, et leurs empreintes. */
export const base = signal<EditorFiles | null>(null);
export const hashes = signal<Hashes | null>(null);
export const tutorial = signal<unknown>(null);
export const cinematics = signal<Record<string, unknown>>({});
export const sounds = signal<string[]>([]);

export const tab = signal<Tab>('dialogues');
export const selectedDialogue = signal<string>('');
export const selectedLine = signal(0);

/** Les erreurs de la dernière tentative d'enregistrement. */
export const saveErrors = signal<string[]>([]);
/** « Fichiers changés sur le disque » : vrai quand un fichier de content/ a changé sans venir de l'éditeur. */
export const diskChanged = signal(false);
/** Un enregistrement refusé parce qu'un fichier a changé depuis le chargement. */
export const conflict = signal(false);
export const saving = signal(false);
export const status = signal<{ text: string; kind: 'ok' | 'error' | 'info' } | null>(null);
export const loadError = signal<string | null>(null);
/** Un brouillon local trouvé au chargement, qu'on peut reprendre. */
export const draftOffer = signal<Draft | null>(null);

export const used = computed(() => usedDialogues(tutorial.value));
export const current = computed<EditorFiles | null>(() => (model.value ? serialize(model.value) : null));
export const dirty = computed(() => {
  const c = current.value;
  const b = base.value;
  return !!c && !!b && (c.dialogues !== b.dialogues || c.fr !== b.fr);
});

/** Le nombre de changements non enregistrés : phrases ajoutées, retirées ou changées, et dialogues changés. */
export const changeCount = computed(() => {
  const m = model.value;
  const b = base.value;
  if (!m || !b || !dirty.value) return 0;
  const before = parseFiles(b);
  let n = 0;
  const frBefore = new Map(before.fr);
  const frNow = new Map(m.fr);
  for (const [k, v] of frNow) if (frBefore.get(k) !== v) n++;
  for (const k of frBefore.keys()) if (!frNow.has(k)) n++;
  const shape = (d: EditorModel['dialogues'][number]): string => JSON.stringify(d.lines.map((l) => ({ ...l, text: '' })));
  const dBefore = new Map(before.dialogues.map((d) => [d.id, shape(d)]));
  const dNow = new Map(m.dialogues.map((d) => [d.id, shape(d)]));
  for (const [id, s] of dNow) if (dBefore.get(id) !== s) n++;
  for (const id of dBefore.keys()) if (!dNow.has(id)) n++;
  return Math.max(n, 1);
});

// --- Brouillon local ---

const DRAFT_KEY = 'braise-editeur:brouillon';

interface Draft {
  model: EditorModel;
  base: EditorFiles;
  hashes: Hashes;
  at: number;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(): void {
  try {
    if (!dirty.value || !model.value || !base.value || !hashes.value) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const d: Draft = { model: model.value, base: base.value, hashes: hashes.value, at: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Pas de stockage : le brouillon n'est qu'une commodité.
  }
}

export function dropDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Rien à faire.
  }
  draftOffer.value = null;
}

/** Reprend le brouillon : ses changements, sur les fichiers qu'il avait lus (un fichier changé depuis fera refuser l'enregistrement). */
export function resumeDraft(): void {
  const d = draftOffer.value;
  if (!d) return;
  model.value = d.model;
  base.value = d.base;
  hashes.value = d.hashes;
  draftOffer.value = null;
  ensureSelection();
  status.value = { text: 'Brouillon repris.', kind: 'info' };
}

// --- Chargement et enregistrement ---

function ensureSelection(): void {
  const m = model.value;
  if (!m) return;
  if (!m.dialogues.some((d) => d.id === selectedDialogue.value)) {
    selectedDialogue.value = m.dialogues[0]?.id ?? '';
    selectedLine.value = 0;
  }
}

/** Charge (ou recharge) tout depuis le disque, par le greffon. Les changements non enregistrés sont perdus. */
export async function load(): Promise<void> {
  try {
    const res = await fetch('/__editor/content', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Le greffon de l'éditeur ne répond pas (${res.status}). La page ne marche qu'avec « pnpm dev ».`);
    const c = (await res.json()) as ContentPayload;
    model.value = parseFiles(c.files);
    base.value = c.files;
    hashes.value = c.hashes;
    tutorial.value = c.tutorial;
    cinematics.value = c.cinematics;
    diskChanged.value = false;
    conflict.value = false;
    saveErrors.value = [];
    loadError.value = null;
    ensureSelection();
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}

/** Au premier chargement : propose de reprendre un brouillon qui diffère du disque. */
export function offerDraft(): void {
  const d = readDraft();
  const b = base.value;
  if (!d || !b) return;
  const files = serialize(d.model);
  if (files.dialogues === b.dialogues && files.fr === b.fr) {
    dropDraft();
    return;
  }
  draftOffer.value = d;
}

export async function loadSounds(): Promise<void> {
  try {
    const index = (await (await fetch('/audio/index.json')).json()) as Record<string, string>;
    sounds.value = Object.keys(index).filter((k) => k.startsWith('sfx-')).sort();
  } catch {
    sounds.value = [];
  }
}

/** Enregistre : vérifie, envoie, et dit ce qui s'est passé. */
export async function save(): Promise<void> {
  const m = model.value;
  const h = hashes.value;
  const files = current.value;
  if (!m || !h || !files || saving.value) return;
  if (!dirty.value) {
    status.value = { text: 'Rien à enregistrer.', kind: 'info' };
    return;
  }
  const local = editorErrors(m);
  if (local.length > 0) {
    saveErrors.value = local;
    status.value = { text: 'Rien n\'a été écrit : corrige les erreurs.', kind: 'error' };
    return;
  }
  saving.value = true;
  status.value = { text: 'Enregistrement…', kind: 'info' };
  try {
    const res = await fetch('/__editor/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files, hashes: h }),
    });
    const body = (await res.json()) as { hashes?: Hashes; errors?: string[]; message?: string; files?: string[] };
    if (res.status === 200 && body.hashes) {
      hashes.value = body.hashes;
      base.value = files;
      saveErrors.value = [];
      conflict.value = false;
      dropDraft();
      status.value = { text: 'Enregistré. Le jeu ouvert se recharge.', kind: 'ok' };
    } else if (res.status === 409) {
      conflict.value = true;
      status.value = { text: `Rien n'a été écrit : ${(body.files ?? []).join(' et ') || 'un fichier'} a changé sur le disque depuis le chargement.`, kind: 'error' };
    } else if (res.status === 422) {
      saveErrors.value = body.errors ?? [];
      status.value = { text: 'Rien n\'a été écrit : la validation du jeu refuse ce contenu.', kind: 'error' };
    } else {
      status.value = { text: `Rien n'a été écrit : ${body.message ?? `erreur ${res.status}`}.`, kind: 'error' };
    }
  } catch (e) {
    status.value = { text: `Rien n'a été écrit : ${(e as Error).message}`, kind: 'error' };
  } finally {
    saving.value = false;
  }
}

/** Change le modèle, et garde le brouillon à jour. */
export function edit(fn: (m: EditorModel) => EditorModel): boolean {
  const m = model.value;
  if (!m) return false;
  try {
    model.value = fn(m);
  } catch (e) {
    status.value = { text: (e as Error).message, kind: 'error' };
    return false;
  }
  writeDraft();
  return true;
}

// --- Les erreurs, rapportées à ce qu'elles concernent ---

/** Les erreurs qui touchent un message : par « id[n] », ou par la clé de son texte. */
export function lineErrors(errors: string[], dialogueId: string, index: number, key: string | null): string[] {
  const at = `${dialogueId}[${index}]`;
  return errors.filter((e) => e.includes(`dialogues.json: ${at}`) || (key !== null && e.includes(`« ${key} »`)));
}

/** Les erreurs qui touchent une phrase, par sa clé. */
export function keyErrors(errors: string[], key: string): string[] {
  return errors.filter((e) => e.includes(`« ${key} »`));
}

/** Les dialogues qui ont au moins une erreur. */
export function dialogueHasError(errors: string[], m: EditorModel, id: string): boolean {
  const d = m.dialogues.find((x) => x.id === id);
  if (!d) return false;
  return d.lines.some((l, i) => lineErrors(errors, id, i, l.key).length > 0);
}
