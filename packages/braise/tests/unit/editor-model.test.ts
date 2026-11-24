import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAW, compileContent } from '../../src/content/index.ts';
import { SCENES_RAW } from '../../src/content/scene.ts';
import {
  addCampLine, addDialogue, editorErrors, insertLine, moveLine, nextKey, parseFiles, rebase, removeDialogue, removeLastCampLine, removeLine,
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
/** Les clés de tuto.room8 dans l'ordre des messages (le silence n'en a pas). */
const ROOM8 = dlg(fresh(), 'tuto.room8').lines.map((l) => l.key);

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
    expect(opening.lines).toHaveLength(23);
    expect(opening.lines[0]).toMatchObject({ key: 'dialog.tuto.opening.1', who: 'moon', face: 'think', poses: { moon: 'think', cream: '' } });
    expect(opening.lines[0]!.text).toBe(frOf(m)['dialog.tuto.opening.1']);
    expect(opening.lines[4]).toMatchObject({ key: null, who: null, seconds: 1.2, emotes: { moon: 'dots', cream: 'dots' } });
    expect(opening.lines[5]!.sfx).toBe('sfx-surprise');
  });

  it('garde les échappements écrits à la main tant que la phrase ne change pas', () => {
    const fr = FILES.fr.replace('"tuto.death.2": "Recommence encore !"', '"tuto.death.2": "Rec\\u006fmmence encore\\u00a0!"');
    const m = parseFiles({ dialogues: FILES.dialogues, fr });
    expect(frOf(m)['tuto.death.2']).toBe('Recommence encore\u00a0!');
    expect(serialize(m).fr).toBe(fr);
    const changed = serialize(setText(m, 'tuto.death.2', 'Recommence encore !')).fr;
    expect(changed).toContain('"tuto.death.2": "Recommence encore !"');
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
    expect(dlg(back, 'tuto.opening').lines[2]!.text).toBe(hard);
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
    expect(lines).toHaveLength(4);
    expect(lines[1]!.key).toBe('dialog.tuto.room1.b.4');
    expect(lines[1]!.who).toBe('cream');
    const keys = m.fr.map(([k]) => k);
    expect(keys.indexOf('dialog.tuto.room1.b.4')).toBe(keys.indexOf('dialog.tuto.room1.b.3') + 1);
    const out = serialize(setText(m, 'dialog.tuto.room1.b.4', 'Et alors ?'));
    expect(out.dialogues).toContain('      {"who":"moon","face":"surprised","text":"dialog.tuto.room1.b.1","emotes":{"moon":"question"}},\r\n'
      + '      {"who":"cream","face":"neutral","text":"dialog.tuto.room1.b.4"},\r\n'
      + '      {"who":"cream","face":"smug","text":"dialog.tuto.room1.b.2"},\r\n');
    expect(out.fr).toContain('  "dialog.tuto.room1.b.3": "Regarde, les souvenirs vont vers la Lanterne. Ces souvenirs te rendront plus fort !",\r\n'
      + '  "dialog.tuto.room1.b.4": "Et alors ?",\r\n');
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
    expect(dlg(m, 'tuto.room8').lines.map((l) => l.key)).toEqual([...ROOM8.slice(1, 3), ROOM8[0], ...ROOM8.slice(3)]);
    expect(serialize(m).fr).toBe(FILES.fr);
  });

  it('supprime un message et sa clé, qui n\'est jamais reprise', () => {
    let m = removeLine(fresh(), 'tuto.room8', 8);
    expect(dlg(m, 'tuto.room8').lines).toHaveLength(8);
    expect(frOf(m)['dialog.tuto.room8.8']).toBeUndefined();
    expect(nextKey(m, 'tuto.room8')).toBe('dialog.tuto.room8.9');
    // Supprimer au milieu, puis ajouter : la clé d'un message encore là n'est pas reprise.
    m = removeLine(fresh(), 'tuto.room8', 0);
    m = insertLine(m, 'tuto.room8', 2, 'speech');
    const keys = dlg(m, 'tuto.room8').lines.map((l) => l.key);
    expect(keys).toEqual([ROOM8[1], ROOM8[2], 'dialog.tuto.room8.9', ...ROOM8.slice(3)]);
    const spoken = keys.filter((k) => k !== null);
    expect(new Set(spoken).size).toBe(spoken.length);
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
    let m = setWho(fresh(), 'tuto.opening', 4, 'cream');
    const line = dlg(m, 'tuto.opening').lines[4]!;
    expect(line.key).toBe('dialog.tuto.opening.23');
    expect(m.faces.cream).toContain(line.face);
    m = setWho(m, 'tuto.opening', 4, null);
    expect(dlg(m, 'tuto.opening').lines[4]!.key).toBeNull();
    expect(frOf(m)['dialog.tuto.opening.23']).toBeUndefined();
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
    const used = usedDialogues(TUTORIAL, Object.values(SCENES_RAW));
    expect(used.has('tuto.opening')).toBe(true);
    expect(used.has('tuto.room8')).toBe(true);
    expect(used.has('scene.after-tutorial.1')).toBe(true);
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
    expect(validate(insertLine(fresh(), 'tuto.room3', 0, 'speech')).join('\n')).toContain('dialog.tuto.room3.6');
  });
});

describe('éditeur : un silence garde le texte qu\'il remplace', () => {
  it('repasser à Moon ou Cream avant d\'enregistrer rend la même clé et le même texte', () => {
    const before = dlg(fresh(), 'tuto.room3').lines[1]!;
    let m = setWho(fresh(), 'tuto.room3', 1, null);
    // Tant que c'est un silence, la clé n'est pas dans fr.json : ni phrase, ni clé vide.
    expect(frOf(m)['dialog.tuto.room3.2']).toBeUndefined();
    expect(serialize(m).fr).not.toContain('dialog.tuto.room3.2');
    expect(serialize(m).fr).not.toContain('""');
    m = setWho(m, 'tuto.room3', 1, 'cream');
    const back = dlg(m, 'tuto.room3').lines[1]!;
    expect(back.key).toBe('dialog.tuto.room3.2');
    expect(back.text).toBe(before.text);
    expect(frOf(m)['dialog.tuto.room3.2']).toBe(before.text);
    // Revenu directement à Moon, le message retrouve son portrait et sa place dans fr.json : rien n'a changé.
    expect(serialize(setWho(setWho(fresh(), 'tuto.room3', 1, null), 'tuto.room3', 1, 'moon'))).toEqual(FILES);
  });
});

describe('éditeur : identifiants stables des messages', () => {
  it('chaque message a un identifiant qui le suit quand il bouge ou change', () => {
    const m = fresh();
    const silence = dlg(m, 'tuto.opening').lines[4]!;
    expect(silence.uid).toBeTruthy();
    const ids = m.dialogues.flatMap((d) => d.lines.map((l) => l.uid));
    expect(new Set(ids).size).toBe(ids.length);
    const moved = moveLine(m, 'tuto.opening', 4, 5);
    expect(dlg(moved, 'tuto.opening').lines[5]!.uid).toBe(silence.uid);
    const changed = updateLine(moved, 'tuto.opening', 5, { seconds: 2 });
    expect(dlg(changed, 'tuto.opening').lines[5]!.uid).toBe(silence.uid);
    expect(dlg(setWho(changed, 'tuto.opening', 5, 'moon'), 'tuto.opening').lines[5]!.uid).toBe(silence.uid);
    const added = insertLine(m, 'tuto.opening', 0, 'silence');
    expect(ids).not.toContain(dlg(added, 'tuto.opening').lines[0]!.uid);
  });
});

describe('éditeur : reprendre ses changements sur des fichiers plus récents', () => {
  const disk = (fn: (m: EditorModel) => EditorModel): EditorModel => parseFiles(serialize(fn(fresh())));

  it('réapplique les phrases changées et les messages ajoutés, et garde ce qui a changé sur le disque', () => {
    let mine = setText(fresh(), 'dialog.tuto.room8.1', 'Les cinq vrais sont ailleurs.');
    mine = insertLine(mine, 'tuto.room8', ROOM8.length, 'speech');
    mine = setText(mine, 'dialog.tuto.room8.9', 'Une réplique de plus.');
    mine = setText(mine, 'tuto.death.1', 'Lève-toi.');
    // Sur le disque, entre-temps : une autre phrase, et un autre dialogue changé.
    const theirs = disk((m) => insertLine(setText(m, 'tuto.death.3', 'Rien vu.'), 'tuto.room3', 2, 'silence'));
    const { model, conflicts } = rebase(mine, fresh(), theirs);
    expect(conflicts).toEqual([]);
    const fr = frOf(model);
    expect(fr['dialog.tuto.room8.1']).toBe('Les cinq vrais sont ailleurs.');
    expect(fr['dialog.tuto.room8.9']).toBe('Une réplique de plus.');
    expect(fr['tuto.death.1']).toBe('Lève-toi.');
    expect(fr['tuto.death.3']).toBe('Rien vu.');
    expect(dlg(model, 'tuto.room8').lines.map((l) => l.key)).toEqual([...ROOM8, 'dialog.tuto.room8.9']);
    expect(dlg(model, 'tuto.room8').lines[ROOM8.length]!.text).toBe('Une réplique de plus.');
    expect(dlg(model, 'tuto.room3').lines).toHaveLength(6);
    // La clé ajoutée garde sa place, après la dernière du dialogue.
    const keys = model.fr.map(([k]) => k);
    expect(keys.indexOf('dialog.tuto.room8.9')).toBe(keys.indexOf('dialog.tuto.room8.8') + 1);
    expect(nextKey(model, 'tuto.room8')).toBe('dialog.tuto.room8.10');
  });

  it('un même dialogue changé des deux côtés : la version du disque, plus mes messages ajoutés, et un avertissement', () => {
    let mine = insertLine(fresh(), 'tuto.room8', ROOM8.length, 'speech');
    mine = setText(mine, 'dialog.tuto.room8.9', 'Moi aussi.');
    mine = setText(mine, 'dialog.tuto.room8.2', 'Alors allons-y.');
    const theirs = disk((m) => setText(removeLine(m, 'tuto.room8', 0), 'dialog.tuto.room8.2', 'On y va.'));
    const { model, conflicts } = rebase(mine, fresh(), theirs);
    expect(dlg(model, 'tuto.room8').lines.map((l) => l.key)).toEqual([...ROOM8.slice(1), 'dialog.tuto.room8.9']);
    expect(frOf(model)['dialog.tuto.room8.9']).toBe('Moi aussi.');
    expect(frOf(model)['dialog.tuto.room8.2']).toBe('Alors allons-y.');
    expect(frOf(model)['dialog.tuto.room8.1']).toBeUndefined();
    expect(conflicts.join('\n')).toContain('tuto.room8');
    expect(conflicts.join('\n')).toContain('dialog.tuto.room8.2');
  });

  it('sans changement des deux côtés, rien ne bouge', () => {
    expect(serialize(rebase(fresh(), fresh(), fresh()).model)).toEqual(FILES);
    const theirs = disk((m) => setText(m, 'tuto.death.2', 'Encore une fois.'));
    expect(serialize(rebase(fresh(), fresh(), theirs).model)).toEqual(serialize(theirs));
  });
});
