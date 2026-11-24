import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { EMOTES } from '../content/schema.ts';
import { MAX_LINE_CHARS } from '../content/tutorial.ts';
import { emoteLabel, faceLabel, poseLabel, whoLabel } from './labels.ts';
import {
  DIALOGUE_ID, addDialogue, insertLine, moveLine, removeDialogue, removeLine, renameDialogue, setText, setWho, updateLine,
  type EditLine, type EditorModel, type Speaker,
} from './model.ts';
import { ImagePicker, type PickerOption } from './picker.tsx';
import { Preview } from './preview.tsx';
import { dialogueHasError, edit, lineErrors, model, saveErrors, selectedDialogue, selectedLine, sounds, status, used } from './state.ts';
import { poseSprite } from './atlas.tsx';

/** Le compteur « 48/160 », rouge au-delà de la limite (sans limite : gris, jamais bloquant). */
export function Counter({ text, limit }: { text: string; limit: number | null }): JSX.Element {
  const over = limit !== null && text.length > limit;
  return <span class={`ed-counter${over ? ' over' : ''}`} aria-label={`${text.length} caractères${limit !== null ? ` sur ${limit}` : ''}`}>{text.length}{limit !== null ? `/${limit}` : ''}</span>;
}

function DialogueList({ m }: { m: EditorModel }): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  const create = (e: Event): void => {
    e.preventDefault();
    const id = name.trim();
    if (!DIALOGUE_ID.test(id)) return setError('Minuscules, chiffres, points et tirets seulement.');
    if (m.dialogues.some((d) => d.id === id)) return setError(`« ${id} » existe déjà.`);
    if (edit((x) => addDialogue(x, id))) {
      selectedDialogue.value = id;
      selectedLine.value = 0;
      setAdding(false);
      setName('');
      setError('');
    }
  };

  return (
    <nav class="ed-list" aria-label="Dialogues">
      <h2>Dialogues</h2>
      <ul>
        {m.dialogues.map((d) => {
          const isUsed = used.value.has(d.id);
          const hasError = dialogueHasError(saveErrors.value, m, d.id);
          return (
            <li key={d.id}>
              <button
                type="button"
                class={`ed-list-item${selectedDialogue.value === d.id ? ' selected' : ''}${hasError ? ' has-error' : ''}`}
                aria-current={selectedDialogue.value === d.id ? 'true' : undefined}
                onClick={() => {
                  selectedDialogue.value = d.id;
                  selectedLine.value = 0;
                }}
              >
                <span class="ed-list-name">{isUsed ? null : <span class="ed-tag">non joué</span>}{d.id}</span>
                <span class="ed-list-count">{d.lines.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form class="ed-new" onSubmit={create}>
          <label for="ed-new-id">Identifiant du dialogue</label>
          <input
            id="ed-new-id"
            ref={input}
            value={name}
            placeholder="ex. camp.retour"
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          {error ? <p class="ed-error" role="alert">{error}</p> : null}
          <div class="ed-row">
            <button type="submit" class="ed-btn ed-btn-primary">Créer</button>
            <button type="button" class="ed-btn" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button type="button" class="ed-btn ed-btn-wide" onClick={() => setAdding(true)}>+ Nouveau dialogue</button>
      )}
    </nav>
  );
}

function DialogueHeader({ m, id }: { m: EditorModel; id: string }): JSX.Element {
  const isUsed = used.value.has(id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(id);
  const [error, setError] = useState('');
  useEffect(() => {
    setRenaming(false);
    setName(id);
    setError('');
  }, [id]);
  const reason = 'Le script du tutoriel l\'appelle (content/tutorial.json) : il ne peut être ni renommé ni supprimé.';

  return (
    <header class="ed-dialogue-head">
      {renaming ? (
        <form
          class="ed-row"
          onSubmit={(e) => {
            e.preventDefault();
            const to = name.trim();
            if (!DIALOGUE_ID.test(to)) return setError('Minuscules, chiffres, points et tirets seulement.');
            if (to !== id && edit((x) => renameDialogue(x, id, to))) {
              selectedDialogue.value = to;
              setRenaming(false);
            } else if (to === id) setRenaming(false);
          }}
        >
          <label class="ed-sr" for="ed-rename">Nouvel identifiant</label>
          <input id="ed-rename" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <button type="submit" class="ed-btn ed-btn-primary">Renommer</button>
          <button type="button" class="ed-btn" onClick={() => setRenaming(false)}>Annuler</button>
          {error ? <span class="ed-error" role="alert">{error}</span> : null}
        </form>
      ) : (
        <h2>
          {id} <span class={isUsed ? 'ed-dim' : 'ed-warn'}>· {isUsed ? 'joué par le tutoriel' : 'non joué : le script du tutoriel ne l\'appelle pas encore'}</span>
        </h2>
      )}
      {renaming ? null : (
        <div class="ed-row">
          <button type="button" class="ed-btn" disabled={isUsed} title={isUsed ? reason : 'Renommer ce dialogue et ses clés'} onClick={() => setRenaming(true)}>Renommer</button>
          <button
            type="button"
            class="ed-btn ed-btn-danger"
            disabled={isUsed}
            title={isUsed ? reason : 'Supprimer ce dialogue et ses phrases'}
            onClick={() => {
              if (!confirm(`Supprimer le dialogue « ${id} » et ses ${m.dialogues.find((d) => d.id === id)?.lines.length ?? 0} message(s) ?`)) return;
              if (edit((x) => removeDialogue(x, id))) {
                selectedDialogue.value = model.value?.dialogues[0]?.id ?? '';
                selectedLine.value = 0;
              }
            }}
          >
            Supprimer
          </button>
          {isUsed ? <span class="ed-dim ed-small">{reason}</span> : null}
        </div>
      )}
    </header>
  );
}

function Insert({ id, index }: { id: string; index: number }): JSX.Element {
  const add = (kind: 'speech' | 'silence'): void => {
    if (edit((x) => insertLine(x, id, index, kind))) {
      selectedLine.value = index;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-line="${index}"] textarea, [data-line="${index}"] input`)?.focus());
    }
  };
  return (
    <div class="ed-insert">
      <button type="button" class="ed-link" onClick={() => add('speech')} aria-label={`Insérer un message à la place ${index + 1}`}>+ message</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="ed-link" onClick={() => add('silence')} aria-label={`Insérer un silence à la place ${index + 1}`}>+ silence</button>
    </div>
  );
}

function faceOptions(m: EditorModel, who: Speaker): PickerOption[] {
  return m.faces[who].map((f) => ({ value: f, label: faceLabel(f), image: `face-${who}-${f}` }));
}

function poseOptions(m: EditorModel, who: Speaker): PickerOption[] {
  return [{ value: '', label: 'aucune', image: poseSprite(who, '') }, ...m.poses[who].map((p) => ({ value: p, label: poseLabel(p), image: poseSprite(who, p) }))];
}

const EMOTE_OPTIONS: PickerOption[] = [{ value: '', label: 'aucune', image: null }, ...EMOTES.map((e) => ({ value: e, label: emoteLabel(e), image: `emote-${e}` }))];

function LineCard({ m, id, line, index, count }: { m: EditorModel; id: string; line: EditLine; index: number; count: number }): JSX.Element {
  const errors = lineErrors(saveErrors.value, id, index, line.key);
  const extras = !!(line.poses.moon || line.poses.cream || line.emotes.moon || line.emotes.cream || line.sfx);
  const [open, setOpen] = useState(extras);
  const selected = selectedLine.value === index;
  const n = index + 1;
  const up = (patch: Parameters<typeof updateLine>[3]): void => {
    edit((x) => updateLine(x, id, index, patch));
  };

  return (
    <article
      class={`ed-line${selected ? ' selected' : ''}${errors.length > 0 ? ' has-error' : ''}${line.who ? ` ed-line-${line.who}` : ' ed-line-silence'}`}
      data-line={index}
      aria-label={`Message ${n}`}
      onFocusCapture={() => {
        selectedLine.value = index;
      }}
      onClick={() => {
        selectedLine.value = index;
      }}
    >
      <div class="ed-line-top">
        <span class="ed-line-n">{n}</span>
        <label class="ed-sr" for={`who-${index}`}>Qui parle, message {n}</label>
        <select
          id={`who-${index}`}
          class="ed-select"
          value={line.who ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            edit((x) => setWho(x, id, index, v === '' ? null : (v as Speaker)));
          }}
        >
          <option value="moon">Moon</option>
          <option value="cream">Cream</option>
          <option value="">Silence</option>
        </select>
        {line.who ? (
          <ImagePicker label={`Portrait, message ${n}`} value={line.face} options={faceOptions(m, line.who)} onChange={(face) => up({ face })} />
        ) : (
          <label class="ed-seconds">
            Durée
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={line.seconds}
              aria-label={`Durée du silence, message ${n}`}
              onInput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (v > 0) up({ seconds: Math.round(v * 100) / 100 });
              }}
            />
            s
          </label>
        )}
        <span class="ed-grow" />
        <button type="button" class="ed-icon" aria-label={`Monter le message ${n}`} title="Monter" disabled={index === 0} onClick={() => {
          edit((x) => moveLine(x, id, index, index - 1));
          selectedLine.value = index - 1;
        }}>↑</button>
        <button type="button" class="ed-icon" aria-label={`Descendre le message ${n}`} title="Descendre" disabled={index === count - 1} onClick={() => {
          edit((x) => moveLine(x, id, index, index + 1));
          selectedLine.value = index + 1;
        }}>↓</button>
        <button
          type="button"
          class="ed-icon ed-icon-danger"
          aria-label={`Supprimer le message ${n}`}
          title={count === 1 ? 'Le dernier message : supprime plutôt le dialogue' : 'Supprimer'}
          disabled={count === 1}
          onClick={() => {
            if (line.text && !confirm(`Supprimer le message ${n} ?\n« ${line.text} »`)) return;
            edit((x) => removeLine(x, id, index));
            selectedLine.value = Math.max(0, Math.min(index, count - 2));
          }}
        >
          ✕
        </button>
      </div>
      {line.who ? (
        <div class="ed-text">
          <label class="ed-sr" for={`text-${index}`}>Texte, message {n}</label>
          <textarea
            id={`text-${index}`}
            rows={2}
            value={line.text}
            placeholder={`Ce que dit ${whoLabel(line.who)}…`}
            onInput={(e) => {
              const text = (e.target as HTMLTextAreaElement).value;
              if (line.key) edit((x) => setText(x, line.key!, text));
            }}
          />
          <Counter text={line.text} limit={MAX_LINE_CHARS} />
        </div>
      ) : null}
      <details class="ed-extras" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          Pose, bulle, son
          {extras ? (
            <span class="ed-dim">
              {' · '}
              {[
                line.poses.moon && `Moon ${poseLabel(line.poses.moon)}`,
                line.poses.cream && `Cream ${poseLabel(line.poses.cream)}`,
                line.emotes.moon && `bulle Moon ${emoteLabel(line.emotes.moon)}`,
                line.emotes.cream && `bulle Cream ${emoteLabel(line.emotes.cream)}`,
                line.sfx,
              ].filter(Boolean).join(', ')}
            </span>
          ) : <span class="ed-dim"> · aucun</span>}
        </summary>
        {open ? (
          <div class="ed-extras-grid">
            <span>Pose de Moon</span>
            <ImagePicker label={`Pose de Moon, message ${n}`} value={line.poses.moon} options={poseOptions(m, 'moon')} onChange={(v) => up({ poses: { ...line.poses, moon: v } })} />
            <span>Pose de Cream</span>
            <ImagePicker label={`Pose de Cream, message ${n}`} value={line.poses.cream} options={poseOptions(m, 'cream')} onChange={(v) => up({ poses: { ...line.poses, cream: v } })} />
            <span>Bulle de Moon</span>
            <ImagePicker label={`Bulle de Moon, message ${n}`} size={20} value={line.emotes.moon} options={EMOTE_OPTIONS} onChange={(v) => up({ emotes: { ...line.emotes, moon: v } })} />
            <span>Bulle de Cream</span>
            <ImagePicker label={`Bulle de Cream, message ${n}`} size={20} value={line.emotes.cream} options={EMOTE_OPTIONS} onChange={(v) => up({ emotes: { ...line.emotes, cream: v } })} />
            <label for={`sfx-${index}`}>Son</label>
            <select id={`sfx-${index}`} class="ed-select" value={line.sfx} onChange={(e) => up({ sfx: (e.target as HTMLSelectElement).value })}>
              <option value="">aucun</option>
              {(sounds.value.includes(line.sfx) || !line.sfx ? sounds.value : [line.sfx, ...sounds.value]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ) : null}
      </details>
      {errors.length > 0 ? <ul class="ed-errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </article>
  );
}

export function DialoguesTab(): JSX.Element | null {
  const m = model.value;
  if (!m) return null;
  const id = selectedDialogue.value;
  const d = m.dialogues.find((x) => x.id === id);
  const index = Math.min(selectedLine.value, Math.max(0, (d?.lines.length ?? 1) - 1));
  return (
    <div class="ed-dialogues">
      <DialogueList m={m} />
      {d ? (
        <main class="ed-main">
          <DialogueHeader m={m} id={d.id} />
          <div class="ed-lines">
            <Insert id={d.id} index={0} />
            {d.lines.map((line, i) => (
              <div key={line.key ?? `silence-${i}`}>
                <LineCard m={m} id={d.id} line={line} index={i} count={d.lines.length} />
                <Insert id={d.id} index={i + 1} />
              </div>
            ))}
          </div>
          <Preview m={m} lines={d.lines} index={index} onSelect={(i) => { selectedLine.value = i; }} />
        </main>
      ) : (
        <main class="ed-main"><p class="ed-dim">{status.value?.text ?? 'Choisis un dialogue.'}</p></main>
      )}
    </div>
  );
}
