/**
 * Le modèle de l'éditeur de texte d'histoire : `content/dialogues.json` et `content/i18n/fr.json`
 * lus, modifiés, puis réécrits au caractère près. Fonctions pures, sans navigateur ni fichier :
 * chacune rend un nouveau modèle et ne touche pas à celui qu'elle reçoit.
 *
 * Mise en forme gardée : fins de ligne du fichier lu, une ligne par message dans `dialogues.json`,
 * l'ordre des clés, les lignes vides et les phrases non modifiées de `fr.json` telles qu'écrites.
 */

export type Speaker = 'moon' | 'cream';
export const SPEAKER_IDS: readonly Speaker[] = ['moon', 'cream'];

/** Le texte brut des deux fichiers que l'éditeur écrit. */
export interface EditorFiles {
  dialogues: string;
  fr: string;
}

/** Un message d'un dialogue. Une réplique a un `who` et une clé ; un silence n'a ni l'un ni l'autre. */
export interface EditLine {
  /** Clé du texte dans fr.json ; nulle pour un silence. */
  key: string | null;
  who: Speaker | null;
  /** Portrait de celui qui parle ; vide pour un silence. */
  face: string;
  /** Le texte de la clé, recopié de `fr` (c'est `fr` qui fait foi à l'écriture). */
  text: string;
  /** Pose et bulle de chacun ; une chaîne vide n'en met pas. */
  poses: { moon: string; cream: string };
  emotes: { moon: string; cream: string };
  sfx: string;
  /** Durée d'un silence, en secondes ; 0 pour une réplique. */
  seconds: number;
}

/** Ce qu'il faut pour réécrire les fichiers comme ils étaient. */
export interface EditorLayout {
  eol: string;
  /** Les clés de fr.json suivies d'une ligne vide. */
  frBlankAfter: string[];
  /** La ligne d'origine de chaque clé de fr.json (sans la virgule), et la phrase qu'elle donnait. */
  frLines: Record<string, { value: string; line: string }>;
  /** Le plus grand numéro de clé jamais donné dans chaque dialogue : une clé supprimée n'est pas reprise. */
  counters: Record<string, number>;
}

export interface EditorModel {
  faces: Record<Speaker, string[]>;
  poses: Record<Speaker, string[]>;
  dialogues: Array<{ id: string; lines: EditLine[] }>;
  /** Les phrases de fr.json, dans l'ordre du fichier. */
  fr: Array<[string, string]>;
  layout: EditorLayout;
}

/** Un identifiant de dialogue : minuscules, chiffres, points, tirets. */
export const DIALOGUE_ID = /^[a-z0-9.\-]+$/;
/** Les phrases du refuge, numérotées à partir de 1 : le jeu les compte tant que la suivante existe. */
const CAMP_PREFIX = 'camp.cream.';
/** Une réplique ne dépasse pas 160 caractères (la même règle que le jeu, dans src/content/tutorial.ts). */
const MAX_CHARS = 160;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Une clé gérée par l'éditeur : `dialog.<id>.<n>`, et jamais un nom (`dialog.name.*`). */
function isManagedKey(key: string): boolean {
  return /^dialog\..+\.\d+$/.test(key) && !key.startsWith('dialog.name.');
}

function keyNumber(key: string, id: string): number {
  const m = new RegExp(`^dialog\\.${escapeRe(id)}\\.(\\d+)$`).exec(key);
  return m ? Number(m[1]) : 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function readPair(v: unknown): { moon: string; cream: string } {
  const r = asRecord(v);
  return { moon: str(r.moon), cream: str(r.cream) };
}

function readLine(raw: unknown, fr: Map<string, string>): EditLine {
  const r = asRecord(raw);
  const who = r.who === 'moon' || r.who === 'cream' ? r.who : null;
  const key = who ? str(r.text) || null : null;
  return {
    key,
    who,
    face: who ? str(r.face) : '',
    text: key ? (fr.get(key) ?? '') : '',
    poses: readPair(r.poses),
    emotes: readPair(r.emotes),
    sfx: str(r.sfx),
    seconds: who ? 0 : typeof r.seconds === 'number' ? r.seconds : 0,
  };
}

/** Une ligne de fr.json : `  "clé": "phrase",`. */
const FR_LINE = /^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")\s*(,?)\s*$/;

/** Lit les deux fichiers. Lève une erreur si l'un n'est pas du JSON. */
export function parseFiles(files: EditorFiles): EditorModel {
  const eol = files.fr.includes('\r\n') || (!files.fr.includes('\n') && files.dialogues.includes('\r\n')) ? '\r\n' : files.fr.includes('\n') ? '\n' : '\r\n';
  const frObj = asRecord(JSON.parse(files.fr));
  const dRaw = asRecord(JSON.parse(files.dialogues));

  // L'ordre et la forme des lignes de fr.json, si le fichier a une clé par ligne.
  const order: string[] = [];
  const frLines: EditorLayout['frLines'] = {};
  const blank: string[] = [];
  let scanned = true;
  const textLines = files.fr.split(/\r?\n/);
  for (let i = 1; i < textLines.length; i++) {
    const line = textLines[i]!;
    if (line.trim() === '') {
      if (order.length > 0 && i < textLines.length - 2) blank.push(order[order.length - 1]!);
      continue;
    }
    if (line.trim() === '}') break;
    const m = FR_LINE.exec(line);
    if (!m) {
      scanned = false;
      break;
    }
    const key = JSON.parse(m[1]!) as string;
    const value = JSON.parse(m[2]!) as string;
    order.push(key);
    frLines[key] = { value, line: line.replace(/\s*,?\s*$/, '') };
  }
  const objKeys = Object.keys(frObj);
  if (!scanned || order.length !== objKeys.length || order.some((k) => frObj[k] !== frLines[k]!.value)) {
    // Une autre mise en forme : l'ordre de l'objet, et une écriture canonique.
    order.length = 0;
    order.push(...objKeys);
    for (const k of Object.keys(frLines)) delete frLines[k];
    blank.length = 0;
  }
  const fr: Array<[string, string]> = order.map((k) => [k, str(frObj[k])]);
  const frMap = new Map(fr);

  const faces = asRecord(dRaw.faces);
  const poses = asRecord(dRaw.poses);
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const dialogues = Object.entries(asRecord(dRaw.dialogues)).map(([id, lines]) => ({
    id,
    lines: (Array.isArray(lines) ? lines : []).map((l) => readLine(l, frMap)),
  }));

  const counters: Record<string, number> = {};
  for (const d of dialogues) {
    let n = 0;
    for (const [k] of fr) n = Math.max(n, keyNumber(k, d.id));
    for (const l of d.lines) if (l.key) n = Math.max(n, keyNumber(l.key, d.id));
    counters[d.id] = n;
  }

  return {
    faces: { moon: list(faces.moon), cream: list(faces.cream) },
    poses: { moon: list(poses.moon), cream: list(poses.cream) },
    dialogues,
    fr,
    layout: { eol, frBlankAfter: blank, frLines, counters },
  };
}

function lineObject(l: EditLine): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (l.who) {
    o.who = l.who;
    o.face = l.face;
    if (l.key) o.text = l.key;
  } else {
    o.seconds = l.seconds;
  }
  const pair = (p: { moon: string; cream: string }): Record<string, string> | null => {
    const r: Record<string, string> = {};
    if (p.moon) r.moon = p.moon;
    if (p.cream) r.cream = p.cream;
    return Object.keys(r).length > 0 ? r : null;
  };
  const poses = pair(l.poses);
  if (poses) o.poses = poses;
  const emotes = pair(l.emotes);
  if (emotes) o.emotes = emotes;
  if (l.sfx) o.sfx = l.sfx;
  return o;
}

function indentJson(value: unknown, indent: string, eol: string): string {
  return JSON.stringify(value, null, 2).split('\n').join(eol + indent);
}

/** Le texte exact des deux fichiers. */
export function serialize(model: EditorModel): EditorFiles {
  const { eol } = model.layout;

  const head = [
    '{',
    `  "faces": ${indentJson(model.faces, '  ', eol)},`,
    `  "poses": ${indentJson(model.poses, '  ', eol)},`,
  ];
  const blocks = model.dialogues.map((d) => {
    const lines = d.lines.map((l) => `      ${JSON.stringify(lineObject(l))}`);
    return [`    ${JSON.stringify(d.id)}: [`, ...(lines.length > 0 ? [lines.join(`,${eol}`)] : []), '    ]'].join(eol);
  });
  const body = blocks.length > 0 ? ['  "dialogues": {', blocks.join(`,${eol}`), '  }'] : ['  "dialogues": {}'];
  const dialogues = [...head, ...body, '}', ''].join(eol);

  const blank = new Set(model.layout.frBlankAfter);
  const out: string[] = ['{'];
  model.fr.forEach(([key, value], i) => {
    const kept = model.layout.frLines[key];
    const line = kept && kept.value === value ? kept.line : `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    const last = i === model.fr.length - 1;
    out.push(last ? line : `${line},`);
    if (!last && blank.has(key)) out.push('');
  });
  out.push('}', '');
  return { dialogues, fr: out.join(eol) };
}

/** Les données brutes, telles que `compileContent` les attend. */
export function toRaw(model: EditorModel): { dialogues: unknown; fr: Record<string, string> } {
  const dialogues: Record<string, unknown[]> = {};
  for (const d of model.dialogues) dialogues[d.id] = d.lines.map(lineObject);
  return {
    dialogues: { faces: model.faces, poses: model.poses, dialogues },
    fr: Object.fromEntries(model.fr),
  };
}

// --- Petits outils internes ---

function findDialogue(model: EditorModel, id: string): { id: string; lines: EditLine[] } {
  const d = model.dialogues.find((x) => x.id === id);
  if (!d) throw new Error(`Dialogue inconnu : ${id}`);
  return d;
}

function withLines(model: EditorModel, id: string, lines: EditLine[]): EditorModel {
  findDialogue(model, id);
  return { ...model, dialogues: model.dialogues.map((d) => (d.id === id ? { id, lines } : d)) };
}

/** Insère une phrase dans fr juste après `after` (ou à la fin), en reprenant sa ligne vide. */
function insertFr(model: EditorModel, key: string, value: string, after: string | null): EditorModel {
  const fr = model.fr.filter(([k]) => k !== key);
  let at = after === null ? -1 : fr.findIndex(([k]) => k === after);
  let blank = model.layout.frBlankAfter;
  if (at < 0) at = fr.length - 1;
  else if (blank.includes(after!)) blank = [...blank.filter((k) => k !== after), key];
  fr.splice(at + 1, 0, [key, value]);
  return { ...model, fr, layout: { ...model.layout, frBlankAfter: blank } };
}

/** Retire une phrase de fr ; sa ligne vide passe à la phrase d'avant. */
function deleteFr(model: EditorModel, key: string): EditorModel {
  const i = model.fr.findIndex(([k]) => k === key);
  if (i < 0) return model;
  let blank = model.layout.frBlankAfter;
  if (blank.includes(key)) {
    blank = blank.filter((k) => k !== key);
    const prev = model.fr[i - 1]?.[0];
    if (prev && !blank.includes(prev)) blank = [...blank, prev];
  }
  const frLines = { ...model.layout.frLines };
  delete frLines[key];
  return { ...model, fr: model.fr.filter(([k]) => k !== key), layout: { ...model.layout, frBlankAfter: blank, frLines } };
}

function isCited(model: EditorModel, key: string): boolean {
  return model.dialogues.some((d) => d.lines.some((l) => l.key === key));
}

/** Retire la clé d'un message disparu, si l'éditeur la gère et que plus rien ne la cite. */
function dropKeyIfUnused(model: EditorModel, key: string | null): EditorModel {
  if (!key || !isManagedKey(key) || isCited(model, key)) return model;
  return deleteFr(model, key);
}

/** La dernière clé de fr qui appartient à ce dialogue (citée par un de ses messages, ou à son nom). */
function lastKeyOf(model: EditorModel, id: string): string | null {
  const d = model.dialogues.find((x) => x.id === id);
  const cited = new Set(d ? d.lines.map((l) => l.key).filter((k): k is string => k !== null) : []);
  let last: string | null = null;
  for (const [k] of model.fr) if (cited.has(k) || keyNumber(k, id) > 0) last = k;
  return last;
}

/** Donne une nouvelle clé de ce dialogue, rangée dans fr, et la rend. */
function claimKey(model: EditorModel, id: string, value: string): { model: EditorModel; key: string } {
  const key = nextKey(model, id);
  const after = lastKeyOf(model, id);
  let m = insertFr(model, key, value, after);
  m = { ...m, layout: { ...m.layout, counters: { ...m.layout.counters, [id]: keyNumber(key, id) } } };
  return { model: m, key };
}

function blankLine(who: Speaker | null, faces: Record<Speaker, string[]>): EditLine {
  return {
    key: null,
    who,
    face: who ? (faces[who].includes('neutral') ? 'neutral' : (faces[who][0] ?? '')) : '',
    text: '',
    poses: { moon: '', cream: '' },
    emotes: { moon: '', cream: '' },
    sfx: '',
    seconds: who ? 0 : 1,
  };
}

// --- Ce que l'éditeur fait ---

/** La prochaine clé libre d'un dialogue : `dialog.<id>.<n>`, jamais une clé déjà donnée dans ce modèle. */
export function nextKey(model: EditorModel, dialogueId: string): string {
  let n = model.layout.counters[dialogueId] ?? 0;
  for (const [k] of model.fr) n = Math.max(n, keyNumber(k, dialogueId));
  for (const d of model.dialogues) for (const l of d.lines) if (l.key) n = Math.max(n, keyNumber(l.key, dialogueId));
  return `dialog.${dialogueId}.${n + 1}`;
}

/** Insère un message à la place `index` : une réplique (de l'autre que celui d'avant) ou un silence d'une seconde. */
export function insertLine(model: EditorModel, dialogueId: string, index: number, kind: 'speech' | 'silence'): EditorModel {
  const d = findDialogue(model, dialogueId);
  const at = Math.max(0, Math.min(index, d.lines.length));
  if (kind === 'silence') {
    const lines = [...d.lines];
    lines.splice(at, 0, blankLine(null, model.faces));
    return withLines(model, dialogueId, lines);
  }
  let prev: Speaker | null = null;
  for (let i = at - 1; i >= 0 && !prev; i--) prev = d.lines[i]!.who;
  const who: Speaker = prev === 'moon' ? 'cream' : 'moon';
  const claimed = claimKey(model, dialogueId, '');
  const lines = [...d.lines];
  lines.splice(at, 0, { ...blankLine(who, model.faces), key: claimed.key });
  return withLines(claimed.model, dialogueId, lines);
}

/** Déplace un message ; les clés ne sont pas renumérotées. */
export function moveLine(model: EditorModel, dialogueId: string, from: number, to: number): EditorModel {
  const d = findDialogue(model, dialogueId);
  if (from < 0 || from >= d.lines.length) return model;
  const target = Math.max(0, Math.min(to, d.lines.length - 1));
  if (target === from) return model;
  const lines = [...d.lines];
  const [line] = lines.splice(from, 1);
  lines.splice(target, 0, line!);
  return withLines(model, dialogueId, lines);
}

/** Supprime un message ; sa clé quitte fr si plus rien ne la cite (jamais `dialog.name.*`). */
export function removeLine(model: EditorModel, dialogueId: string, index: number): EditorModel {
  const d = findDialogue(model, dialogueId);
  const line = d.lines[index];
  if (!line) return model;
  const m = withLines(model, dialogueId, d.lines.filter((_, i) => i !== index));
  return dropKeyIfUnused(m, line.key);
}

/** Change une phrase de fr, et le texte des messages qui la citent. */
export function setText(model: EditorModel, key: string, text: string): EditorModel {
  const has = model.fr.some(([k]) => k === key);
  const base = has ? { ...model, fr: model.fr.map(([k, v]): [string, string] => [k, k === key ? text : v]) } : insertFr(model, key, text, null);
  return {
    ...base,
    dialogues: base.dialogues.map((d) => (d.lines.some((l) => l.key === key)
      ? { id: d.id, lines: d.lines.map((l) => (l.key === key ? { ...l, text } : l)) }
      : d)),
  };
}

/** Change qui parle : Moon, Cream, ou personne (un silence). Une réplique reçoit une clé, un silence perd la sienne. */
export function setWho(model: EditorModel, dialogueId: string, index: number, who: Speaker | null): EditorModel {
  const d = findDialogue(model, dialogueId);
  const line = d.lines[index];
  if (!line || line.who === who) return model;
  const lines = [...d.lines];
  if (who === null) {
    lines[index] = { ...line, who: null, key: null, face: '', text: '', seconds: line.seconds > 0 ? line.seconds : 1 };
    return dropKeyIfUnused(withLines(model, dialogueId, lines), line.key);
  }
  const face = model.faces[who].includes(line.face) ? line.face : blankLine(who, model.faces).face;
  if (line.who !== null) {
    lines[index] = { ...line, who, face };
    return withLines(model, dialogueId, lines);
  }
  const claimed = claimKey(model, dialogueId, '');
  lines[index] = { ...line, who, face, key: claimed.key, text: '', seconds: 0 };
  return withLines(claimed.model, dialogueId, lines);
}

/** Change les réglages d'un message : portrait, poses, bulles, son, durée d'un silence. */
export function updateLine(
  model: EditorModel, dialogueId: string, index: number,
  patch: Partial<Pick<EditLine, 'face' | 'poses' | 'emotes' | 'sfx' | 'seconds'>>,
): EditorModel {
  const d = findDialogue(model, dialogueId);
  const line = d.lines[index];
  if (!line) return model;
  const lines = [...d.lines];
  lines[index] = { ...line, ...patch };
  return withLines(model, dialogueId, lines);
}

function checkNewId(model: EditorModel, id: string): void {
  if (!DIALOGUE_ID.test(id)) throw new Error('Identifiant invalide : minuscules, chiffres, points et tirets seulement.');
  if (model.dialogues.some((d) => d.id === id)) throw new Error(`Le dialogue « ${id} » existe déjà.`);
}

/** Crée un dialogue d'un message vide de Moon. Refuse un doublon ou un identifiant invalide. */
export function addDialogue(model: EditorModel, id: string): EditorModel {
  checkNewId(model, id);
  const m: EditorModel = { ...model, dialogues: [...model.dialogues, { id, lines: [] }] };
  return insertLine(m, id, 0, 'speech');
}

/** Renomme un dialogue, et les clés de ses messages avec lui (à la même place dans fr). */
export function renameDialogue(model: EditorModel, from: string, to: string): EditorModel {
  const d = findDialogue(model, from);
  checkNewId(model, to);
  const rename = new Map<string, string>();
  for (const l of d.lines) {
    const n = l.key ? keyNumber(l.key, from) : 0;
    if (n > 0) rename.set(l.key!, `dialog.${to}.${n}`);
  }
  for (const k of rename.values()) if (model.fr.some(([x]) => x === k)) throw new Error(`La clé « ${k} » existe déjà.`);
  const blank = model.layout.frBlankAfter.map((k) => rename.get(k) ?? k);
  const { [from]: count, ...counters } = model.layout.counters;
  return {
    ...model,
    dialogues: model.dialogues.map((x) => (x.id === from
      ? { id: to, lines: x.lines.map((l) => (l.key && rename.has(l.key) ? { ...l, key: rename.get(l.key)! } : l)) }
      : x)),
    fr: model.fr.map(([k, v]) => [rename.get(k) ?? k, v]),
    layout: { ...model.layout, frBlankAfter: blank, counters: { ...counters, [to]: count ?? 0 } },
  };
}

/** Supprime un dialogue, et les clés de ses messages que rien d'autre ne cite. */
export function removeDialogue(model: EditorModel, id: string): EditorModel {
  const d = findDialogue(model, id);
  let m: EditorModel = { ...model, dialogues: model.dialogues.filter((x) => x.id !== id) };
  for (const l of d.lines) m = dropKeyIfUnused(m, l.key);
  const { [id]: _gone, ...counters } = m.layout.counters;
  return { ...m, layout: { ...m.layout, counters } };
}

/** Les dialogues que le script du tutoriel appelle (étapes `say`). */
export function usedDialogues(tutorialRaw: unknown): Set<string> {
  const used = new Set<string>();
  const steps = asRecord(tutorialRaw).steps;
  if (!Array.isArray(steps)) return used;
  for (const s of steps) {
    const r = asRecord(s);
    if (r.do === 'say' && typeof r.dialogue === 'string') used.add(r.dialogue);
  }
  return used;
}

/** Le nombre de répliques de Cream au refuge, comptées comme le jeu : 1, 2, 3… tant que la suivante existe. */
export function campCount(model: EditorModel): number {
  const keys = new Set(model.fr.map(([k]) => k));
  let n = 0;
  while (keys.has(`${CAMP_PREFIX}${n + 1}`)) n++;
  return n;
}

/** Ajoute une réplique de Cream au refuge, vide, après la dernière. */
export function addCampLine(model: EditorModel): EditorModel {
  const n = campCount(model);
  return insertFr(model, `${CAMP_PREFIX}${n + 1}`, '', n > 0 ? `${CAMP_PREFIX}${n}` : null);
}

/** Retire la dernière réplique de Cream au refuge. */
export function removeLastCampLine(model: EditorModel): EditorModel {
  const n = campCount(model);
  return n > 0 ? deleteFr(model, `${CAMP_PREFIX}${n}`) : model;
}

/**
 * Ce que la validation du jeu ne vérifie pas, mais que l'éditeur refuse : une réplique de Cream au
 * refuge vide ou trop longue (le jeu la montrerait telle quelle).
 */
export function editorErrors(model: EditorModel): string[] {
  const errors: string[] = [];
  const fr = new Map(model.fr);
  const n = campCount(model);
  for (let i = 1; i <= n; i++) {
    const key = `${CAMP_PREFIX}${i}`;
    const text = fr.get(key) ?? '';
    if (text.trim() === '') errors.push(`i18n/fr.json: texte manquant « ${key} »`);
    else if (text.length > MAX_CHARS) errors.push(`i18n/fr.json: « ${key} » dépasse ${MAX_CHARS} caractères`);
  }
  return errors;
}
