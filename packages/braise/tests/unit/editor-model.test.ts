import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import {
  addCampLine, addDialogue, editorErrors, insertLine, moveLine, nextKey, parseFiles, removeDialogue, removeLastCampLine, removeLine,
  renameDialogue, serialize, setText, setWho, toRaw, updateLine, usedDialogues, type EditorFiles, type EditorModel,
} from '../../src/editor/model.ts';

const CONTENT = join(__dirname, '..', '..', 'content');
const read = (p: string): string => readFileSync(join(CONTENT, p), 'utf8');
const FILES: EditorFiles = { dialogues: read('dialogues.json'), fr: read('i18n/fr.json') };
const TUTORIAL: unknown = JSON.parse(read('tutorial.json'));

const fresh = (): EditorModel => parseFiles(FILES);
const frOf = (m: EditorModel): Record<string, string> => Object.fromEntries(m.fr);
const dlg = (m: EditorModel, id: string) => m.dialogues.find((d) => d.id === id)!;
const validate = (m: EditorModel): string[] => compileContent({ ...RAW, ...toRaw(m) }).errors;

describe('éditeur : relire puis réécrire', () => {
  it('redonne exactement les octets des fichiers livrés', () => {
    const out = serialize(fresh());
    expect(out.dialogues).toBe(FILES.dialogues);
    expect(out.fr).toBe(FILES.fr);
  });

  it('lit les dialogues, leurs messages et leurs textes', () => {
    const m = fresh();
    expect(m.faces.moon).toContain('think');
    expect(m.poses.cream).toContain('groom');
    const opening = dlg(m, 'tuto.opening');
    expect(opening.lines).toHaveLength(19);
    expect(opening.lines[0]).toMatchObject({ key: 'dialog.tuto.opening.1', who: 'moon', face: 'think', poses: { moon: 'think', cream: '' } });
    expect(opening.lines[0]!.text).toBe(frOf(m)['dialog.tuto.opening.1']);
    expect(opening.lines[3]).toMatchObject({ key: null, who: null, seconds: 1.2, emotes: { moon: 'dots', cream: '' } });
    expect(opening.lines[4]!.sfx).toBe('sfx-surprise');
  });

  it('garde les échappements écrits à la main tant que la phrase ne change pas', () => {
    const fr = FILES.fr.replace('"tuto.death.2": "Encore."', '"tuto.death.2": "Enc\\u006fre\\u00a0!"');
    const m = parseFiles({ dialogues: FILES.dialogues, fr });
    expect(frOf(m)['tuto.death.2']).toBe('Encore\u00a0!');
    expect(serialize(m).fr).toBe(fr);
    const changed = serialize(setText(m, 'tuto.death.2', 'Encore !')).fr;
    expect(changed).toContain('"tuto.death.2": "Encore !"');
  });

  it('suit les fins de ligne du fichier lu', () => {
    const lf = { dialogues: FILES.dialogues.replace(/\r\n/g, '\n'), fr: FILES.fr.replace(/\r\n/g, '\n') };
    const out = serialize(parseFiles(lf));
    expect(out).toEqual(lf);
  });
});

describe('éditeur : une phrase difficile', () => {
  it('guillemets, retour à la ligne, espace insécable, apostrophe courbe et emoji font l\'aller-retour', () => {
    const hard = 'Il dit « non »\u00a0: "Jamais"\nPuis\u202fs’en va 🔥 \\o/';
    const m = setText(fresh(), 'dialog.tuto.opening.2', hard);
    const out = serialize(m);
    expect(() => JSON.parse(out.fr)).not.toThrow();
    expect(JSON.parse(out.fr)['dialog.tuto.opening.2']).toBe(hard);
    // Une clé par ligne : le retour à la ligne est échappé, pas écrit.
    expect(out.fr.split('\r\n').length).toBe(FILES.fr.split('\r\n').length);
    const back = parseFiles(out);
    expect(frOf(back)['dialog.tuto.opening.2']).toBe(hard);
    expect(dlg(back, 'tuto.opening').lines[1]!.text).toBe(hard);
    expect(serialize(back)).toEqual(out);
  });

  it('ne change que la ligne de la phrase modifiée', () => {
    const out = serialize(setText(fresh(), 'dialog.tuto.room3.2', 'À travers, vraiment ?!'));
    const a = FILES.fr.split('\r\n');
    const b = out.fr.split('\r\n');
    expect(b.length).toBe(a.length);
    const diff = a.map((line, i) => (line === b[i] ? -1 : i)).filter((i) => i >= 0);
    expect(diff).toHaveLength(1);
    expect(b[diff[0]!]).toBe('  "dialog.tuto.room3.2": "À travers, vraiment ?!",');
    expect(out.dialogues).toBe(FILES.dialogues);
  });
});

describe('éditeur : messages', () => {
  it('insère une réplique avec la prochaine clé libre, rangée après la dernière clé du dialogue', () => {
    const m = insertLine(fresh(), 'tuto.room1.b', 1, 'speech');
    const lines = dlg(m, 'tuto.room1.b').lines;
    expect(lines).toHaveLength(3);
    expect(lines[1]!.key).toBe('dialog.tuto.room1.b.3');
    expect(lines[1]!.who).toBe('cream');
    const keys = m.fr.map(([k]) => k);
    expect(keys.indexOf('dialog.tuto.room1.b.3')).toBe(keys.indexOf('dialog.tuto.room1.b.2') + 1);
    const out = serialize(setText(m, 'dialog.tuto.room1.b.3', 'Et alors ?'));
    expect(out.dialogues).toContain('      {"who":"moon","face":"surprised","text":"dialog.tuto.room1.b.1","emotes":{"moon":"question"}},\r\n'
      + '      {"who":"cream","face":"neutral","text":"dialog.tuto.room1.b.3"},\r\n'
      + '      {"who":"cream","face":"smug","text":"dialog.tuto.room1.b.2"}\r\n');
    expect(out.fr).toContain('  "dialog.tuto.room1.b.2": "Depuis que tu espères. Ramasse les éclats bleus. Ce sont des souvenirs.",\r\n'
      + '  "dialog.tuto.room1.b.3": "Et alors ?",\r\n');
  });

  it('insère un silence sans clé', () => {
    const m = insertLine(fresh(), 'tuto.room3', 2, 'silence');
    const line = dlg(m, 'tuto.room3').lines[2]!;
    expect(line.key).toBeNull();
    expect(line.who).toBeNull();
    expect(line.seconds).toBeGreaterThan(0);
    expect(m.fr).toHaveLength(fresh().fr.length);
    expect(serialize(m).dialogues).toContain('{"seconds":1}');
  });

  it('déplace un message sans renuméroter les clés', () => {
    const m = moveLine(fresh(), 'tuto.room8', 0, 2);
    expect(dlg(m, 'tuto.room8').lines.map((l) => l.key)).toEqual(['dialog.tuto.room8.2', 'dialog.tuto.room8.3', 'dialog.tuto.room8.1']);
    expect(serialize(m).fr).toBe(FILES.fr);
  });

  it('supprime un message et sa clé, qui n\'est jamais reprise', () => {
    let m = removeLine(fresh(), 'tuto.room8', 2);
    expect(dlg(m, 'tuto.room8').lines).toHaveLength(2);
    expect(frOf(m)['dialog.tuto.room8.3']).toBeUndefined();
    expect(nextKey(m, 'tuto.room8')).toBe('dialog.tuto.room8.4');
    // Supprimer au milieu, puis ajouter : la clé d'un message encore là n'est pas reprise.
    m = removeLine(fresh(), 'tuto.room8', 0);
    m = insertLine(m, 'tuto.room8', 2, 'speech');
    const keys = dlg(m, 'tuto.room8').lines.map((l) => l.key);
    expect(keys).toEqual(['dialog.tuto.room8.2', 'dialog.tuto.room8.3', 'dialog.tuto.room8.4']);
    expect(new Set(keys).size).toBe(3);
  });

  it('garde une clé encore citée, et ne retire jamais un nom', () => {
    let m = fresh();
    // Deux messages citent la même clé : en retirer un la garde.
    m = { ...m, dialogues: m.dialogues.map((d) => (d.id === 'tuto.room3' ? { ...d, lines: [...d.lines, { ...d.lines[0]! }] } : d)) };
    m = removeLine(m, 'tuto.room3', 2);
    expect(frOf(m)['dialog.tuto.room3.1']).toBeDefined();
    m = { ...m, dialogues: m.dialogues.map((d) => (d.id === 'tuto.room3' ? { ...d, lines: [...d.lines, { ...d.lines[0]!, key: 'dialog.name.moon' }] } : d)) };
    m = removeLine(m, 'tuto.room3', 2);
    expect(frOf(m)['dialog.name.moon']).toBe('Moon');
  });

  it('change qui parle : une clé pour une réplique, aucune pour un silence', () => {
    let m = setWho(fresh(), 'tuto.opening', 3, 'cream');
    const line = dlg(m, 'tuto.opening').lines[3]!;
    expect(line.key).toBe('dialog.tuto.opening.19');
    expect(m.faces.cream).toContain(line.face);
    m = setWho(m, 'tuto.opening', 3, null);
    expect(dlg(m, 'tuto.opening').lines[3]!.key).toBeNull();
    expect(frOf(m)['dialog.tuto.opening.19']).toBeUndefined();
    m = updateLine(m, 'tuto.opening', 0, { face: 'sad', poses: { moon: '', cream: 'scratch' }, sfx: 'sfx-gem' });
    expect(serialize(m).dialogues).toContain('{"who":"moon","face":"sad","text":"dialog.tuto.opening.1","poses":{"cream":"scratch"},"sfx":"sfx-gem"}');
  });
});

describe('éditeur : dialogues', () => {
  it('crée un dialogue d\'un message vide de Moon, et refuse un doublon ou un identifiant invalide', () => {
    const m = addDialogue(fresh(), 'essai-1.a');
    const d = dlg(m, 'essai-1.a');
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({ who: 'moon', key: 'dialog.essai-1.a.1', text: '' });
    expect(m.fr[m.fr.length - 1]).toEqual(['dialog.essai-1.a.1', '']);
    expect(() => addDialogue(m, 'essai-1.a')).toThrow();
    expect(() => addDialogue(m, 'tuto.opening')).toThrow();
    expect(() => addDialogue(m, 'Essai')).toThrow();
    expect(() => addDialogue(m, 'un essai')).toThrow();
    expect(() => addDialogue(m, '')).toThrow();
  });

  it('renomme un dialogue avec ses clés, et en supprime un avec ses clés', () => {
    let m = setText(addDialogue(fresh(), 'essai'), 'dialog.essai.1', 'Bonjour.');
    m = renameDialogue(m, 'essai', 'essai.deux');
    expect(dlg(m, 'essai.deux').lines[0]!.key).toBe('dialog.essai.deux.1');
    expect(frOf(m)['dialog.essai.deux.1']).toBe('Bonjour.');
    expect(frOf(m)['dialog.essai.1']).toBeUndefined();
    expect(() => renameDialogue(m, 'essai.deux', 'tuto.opening')).toThrow();
    m = removeDialogue(m, 'essai.deux');
    expect(serialize(m)).toEqual(FILES);
  });

  it('dit quels dialogues le script du tutoriel appelle', () => {
    const used = usedDialogues(TUTORIAL);
    expect(used.has('tuto.opening')).toBe(true);
    expect(used.has('tuto.room8')).toBe(true);
    expect(used.size).toBe(fresh().dialogues.length);
    expect(usedDialogues(null).size).toBe(0);
  });
});

describe('éditeur : Cream au refuge', () => {
  it('ajoute camp.cream.7 après la sixième, et retire la dernière', () => {
    const m = addCampLine(fresh());
    const keys = m.fr.map(([k]) => k);
    expect(keys.indexOf('camp.cream.7')).toBe(keys.indexOf('camp.cream.6') + 1);
    expect(editorErrors(m).join('\n')).toContain('camp.cream.7');
    const back = removeLastCampLine(m);
    expect(serialize(back)).toEqual(FILES);
    expect(frOf(removeLastCampLine(fresh()))['camp.cream.6']).toBeUndefined();
  });
});

describe('éditeur : validation du jeu', () => {
  it('le contenu livré passe compileContent', () => {
    expect(validate(fresh())).toEqual([]);
    expect(editorErrors(fresh())).toEqual([]);
  });

  it('une réplique de 161 caractères est refusée', () => {
    const errors = validate(setText(fresh(), 'dialog.tuto.room3.1', 'a'.repeat(161)));
    expect(errors.join('\n')).toContain('dialog.tuto.room3.1');
    expect(validate(setText(fresh(), 'dialog.tuto.room3.1', 'a'.repeat(160)))).toEqual([]);
  });

  it('un message ajouté sans texte est refusé', () => {
    expect(validate(insertLine(fresh(), 'tuto.room3', 0, 'speech')).join('\n')).toContain('dialog.tuto.room3.3');
  });
});
