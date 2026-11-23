import {
  SPEAKERS, dialoguesSchema, tutorialSchema,
  type DialoguesRaw, type PlaceKind, type TutorialRaw, type WaitCondition,
} from './schema.ts';

/** Une réplique ne dépasse pas deux lignes de 80 caractères (document 06 §1). */
export const MAX_LINE_CHARS = 160;

/** Les caractères de la grille du tutoriel qui ne sont pas des repères. */
export const MAP_WALL = '#';
export const MAP_FLOOR = '.';
export const MAP_THICKET = '=';

export interface Point {
  x: number;
  y: number;
}

/** Une ligne de dialogue, prête à jouer. `who` : 0 Moon, 1 Cream, -1 ligne muette. */
export interface DialogueLine {
  who: number;
  face: string;
  /** Clé du texte, vide pour une ligne muette. */
  text: string;
  poseMoon: string;
  poseCream: string;
  emoteMoon: string;
  emoteCream: string;
  sfx: string;
  /** Durée d'une ligne muette, en secondes (0 pour une réplique). */
  seconds: number;
}

/** Une étape du script, repères résolus en pixels et ennemis en indices. */
export type TutorialStep =
  | { do: 'say'; dialogue: string }
  | { do: 'bark'; text: string }
  | { do: 'guide'; x: number; y: number }
  | { do: 'banner'; text: string | null; glyph: string | null }
  | { do: 'wait'; until: WaitCondition; hasAt: boolean; x: number; y: number; seconds: number }
  | { do: 'spawn'; kind: number; points: Point[]; count: number; boss: boolean }
  | { do: 'gate'; id: number }
  | { do: 'hurt'; share: number }
  | { do: 'gold'; amount: number; x: number; y: number }
  | { do: 'gem'; x: number; y: number }
  | { do: 'place'; kind: PlaceKind; x: number; y: number }
  | { do: 'checkpoint'; x: number; y: number }
  | { do: 'end' };

export interface TutorialDef {
  look: TutorialRaw['look'];
  tuning: TutorialRaw['tuning'];
  /** Indice de la trouvaille du trésor dans `data.finds`. */
  find: number;
  /** Clés des répliques de Cream après une mort. */
  deathBarks: string[];
  /** Côté de la carte, en tuiles. */
  size: number;
  rows: string[];
  markers: Record<string, Point>;
  start: Point;
  guideStart: Point;
  steps: TutorialStep[];
}

export interface TutorialContext {
  tile: number;
  fr: Record<string, string>;
  enemyIndex: Map<string, number>;
  findIds: string[];
  smithPrice: number;
}

function isGate(ch: string): boolean {
  return ch >= '1' && ch <= '9';
}

/**
 * Valide et indexe les dialogues et le tutoriel. Les erreurs sont ajoutées à `errors` ;
 * le résultat est nul si une donnée est fausse.
 */
export function compileTutorial(
  rawDialogues: unknown, rawTutorial: unknown, ctx: TutorialContext, errors: string[],
): { dialogues: Record<string, DialogueLine[]>; tutorial: TutorialDef } | null {
  const before = errors.length;
  const dRes = dialoguesSchema.safeParse(rawDialogues);
  const tRes = tutorialSchema.safeParse(rawTutorial);
  if (!dRes.success) for (const i of dRes.error.issues) errors.push(`dialogues.json: ${i.path.join('.')} — ${i.message}`);
  if (!tRes.success) for (const i of tRes.error.issues) errors.push(`tutorial.json: ${i.path.join('.')} — ${i.message}`);
  if (!dRes.success || !tRes.success) return null;
  const d: DialoguesRaw = dRes.data;
  const t: TutorialRaw = tRes.data;

  const needText = (key: string, where: string, limit = false): void => {
    const text = ctx.fr[key];
    if (typeof text !== 'string' || text === '') errors.push(`i18n/fr.json: texte manquant « ${key} » (${where})`);
    else if (limit && text.length > MAX_LINE_CHARS) errors.push(`${where}: « ${key} » dépasse ${MAX_LINE_CHARS} caractères`);
  };

  // Dialogues.
  const dialogues: Record<string, DialogueLine[]> = {};
  for (const [id, lines] of Object.entries(d.dialogues)) {
    dialogues[id] = lines.map((line, n) => {
      const where = `dialogues.json: ${id}[${n}]`;
      const spoken = line.who !== undefined;
      if (spoken) {
        if (!line.text) errors.push(`${where}: une réplique sans texte`);
        else needText(line.text, where, true);
        if (!line.face) errors.push(`${where}: une réplique sans portrait`);
        else if (!d.faces[line.who!].includes(line.face)) errors.push(`${where}: portrait inconnu « ${line.face} »`);
      } else if (line.seconds === undefined) {
        errors.push(`${where}: une ligne muette sans durée`);
      }
      for (const who of SPEAKERS) {
        const pose = line.poses?.[who];
        if (pose !== undefined && !d.poses[who].includes(pose)) errors.push(`${where}: pose inconnue « ${pose} »`);
      }
      return {
        who: spoken ? SPEAKERS.indexOf(line.who!) : -1,
        face: line.face ?? '',
        text: spoken ? (line.text ?? '') : '',
        poseMoon: line.poses?.moon ?? '',
        poseCream: line.poses?.cream ?? '',
        emoteMoon: line.emotes?.moon ?? '',
        emoteCream: line.emotes?.cream ?? '',
        sfx: line.sfx ?? '',
        seconds: spoken ? 0 : (line.seconds ?? 0),
      };
    });
  }
  for (const who of SPEAKERS) needText(`dialog.name.${who}`, 'dialogues.json');

  // Carte : carrée, et chaque repère sur une tuile de sol qui lui est propre.
  const rows = t.map.rows;
  const size = rows.length;
  if (rows.some((r) => r.length !== size)) errors.push(`tutorial.json: la carte doit être carrée (${size} lignes)`);
  const where = new Map<string, Point>();
  const gates = new Set<number>();
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (isGate(ch)) gates.add(Number(ch));
      else if (ch !== MAP_WALL && ch !== MAP_FLOOR && ch !== MAP_THICKET) {
        if (where.has(ch)) errors.push(`tutorial.json: le caractère « ${ch} » est deux fois dans la carte`);
        where.set(ch, { x: (x + 0.5) * ctx.tile, y: (y + 0.5) * ctx.tile });
      }
    }
  }
  const markers: Record<string, Point> = {};
  const named = new Set<string>();
  for (const [name, ch] of Object.entries(t.map.markers)) {
    const p = where.get(ch);
    if (!p) errors.push(`tutorial.json: le repère « ${name} » (« ${ch} ») n'est pas dans la carte`);
    else markers[name] = p;
    named.add(ch);
  }
  for (const ch of where.keys()) if (!named.has(ch)) errors.push(`tutorial.json: le caractère « ${ch} » de la carte n'a pas de nom`);

  const at = (name: string, stepIndex: number): Point => {
    const p = markers[name];
    if (!p) {
      errors.push(`tutorial.json: étape ${stepIndex}, repère inconnu « ${name} »`);
      return { x: 0, y: 0 };
    }
    return p;
  };

  // Script.
  let gold = 0;
  let firstSpawn = -1;
  let firstCheckpoint = -1;
  const steps: TutorialStep[] = t.steps.map((s, i): TutorialStep => {
    switch (s.do) {
      case 'say':
        if (!dialogues[s.dialogue]) errors.push(`tutorial.json: étape ${i}, dialogue inconnu « ${s.dialogue} »`);
        return { do: 'say', dialogue: s.dialogue };
      case 'bark':
        needText(s.text, `tutorial.json: étape ${i}`, true);
        return { do: 'bark', text: s.text };
      case 'guide':
        return { do: 'guide', ...at(s.to, i) };
      case 'banner':
        if (s.text !== null) needText(s.text, `tutorial.json: étape ${i}`);
        return { do: 'banner', text: s.text, glyph: s.glyph ?? null };
      case 'wait': {
        if (s.until === 'reach' && s.at === undefined) errors.push(`tutorial.json: étape ${i}, « reach » sans repère`);
        if (s.until === 'time' && s.seconds === undefined) errors.push(`tutorial.json: étape ${i}, « time » sans durée`);
        const p = s.at !== undefined ? at(s.at, i) : { x: 0, y: 0 };
        return { do: 'wait', until: s.until, hasAt: s.at !== undefined, x: p.x, y: p.y, seconds: s.seconds ?? 0 };
      }
      case 'spawn': {
        if (firstSpawn < 0) firstSpawn = i;
        const kind = ctx.enemyIndex.get(s.enemy);
        if (kind === undefined) errors.push(`tutorial.json: étape ${i}, ennemi inconnu « ${s.enemy} »`);
        return { do: 'spawn', kind: kind ?? 0, points: s.at.map((name) => at(name, i)), count: s.count ?? 1, boss: s.boss ?? false };
      }
      case 'gate':
        if (!gates.has(s.id)) errors.push(`tutorial.json: étape ${i}, la barrière ${s.id} n'a aucune tuile dans la carte`);
        return { do: 'gate', id: s.id };
      case 'hurt':
        return { do: 'hurt', share: s.share };
      case 'gold':
        gold += s.amount;
        return { do: 'gold', amount: s.amount, ...at(s.at, i) };
      case 'gem':
        return { do: 'gem', ...at(s.at, i) };
      case 'place':
        return { do: 'place', kind: s.kind, ...at(s.at, i) };
      case 'checkpoint':
        if (firstCheckpoint < 0) firstCheckpoint = i;
        return { do: 'checkpoint', ...at(s.at, i) };
      case 'end':
        return { do: 'end' };
    }
  });
  if (firstCheckpoint !== 0) errors.push('tutorial.json: le script doit commencer par un point de reprise');
  if (t.steps[t.steps.length - 1]!.do !== 'end') errors.push('tutorial.json: le script doit finir par « end »');
  const opened = new Set(t.steps.flatMap((s) => (s.do === 'gate' ? [s.id] : [])));
  for (const id of gates) if (!opened.has(id)) errors.push(`tutorial.json: la barrière ${id} n'est jamais ouverte`);
  if (t.steps.some((s) => s.do === 'place' && s.kind === 'smith') && gold < ctx.smithPrice) {
    errors.push(`tutorial.json: ${gold} d'or donné, moins que le prix du Ferrailleur (${ctx.smithPrice})`);
  }
  for (const key of t.deathBarks) needText(key, 'tutorial.json: deathBarks', true);

  const find = ctx.findIds.indexOf(t.find);
  if (find < 0) errors.push(`tutorial.json: trouvaille inconnue « ${t.find} »`);
  const start = at(t.start, -1);
  const guideStart = at(t.guideStart, -1);

  // Barrières ouvertes, tout repère doit pouvoir être atteint depuis le départ (la rangée se franchit en ruée).
  if (rows.every((r) => r.length === size) && markers[t.start]) {
    const seen = new Uint8Array(size * size);
    const sx = Math.floor(start.x / ctx.tile);
    const sy = Math.floor(start.y / ctx.tile);
    const queue = [sy * size + sx];
    seen[queue[0]!] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!;
      const cx = cur % size;
      const cy = Math.floor(cur / size);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const idx = ny * size + nx;
        if (seen[idx] || rows[ny]![nx] === MAP_WALL) continue;
        seen[idx] = 1;
        queue.push(idx);
      }
    }
    for (const [name, p] of Object.entries(markers)) {
      const idx = Math.floor(p.y / ctx.tile) * size + Math.floor(p.x / ctx.tile);
      if (!seen[idx]) errors.push(`tutorial.json: impossible d'atteindre le repère « ${name} » depuis le départ`);
    }
  }

  if (errors.length > before) return null;
  return {
    dialogues,
    tutorial: { look: t.look, tuning: t.tuning, find, deathBarks: t.deathBarks, size, rows, markers, start, guideStart, steps },
  };
}
