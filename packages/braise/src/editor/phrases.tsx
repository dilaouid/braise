import type { ComponentChildren, JSX } from 'preact';
import { MAX_LINE_CHARS } from '../content/tutorial.ts';
import { Counter } from './dialogues.tsx';
import { addCampLine, campCount, removeLastCampLine, setText, type EditorModel } from './model.ts';
import { cinematics, edit, keyErrors, model, saveErrors } from './state.ts';

interface Shot {
  id: string;
  caption?: string;
  card?: string;
  layers?: Array<{ type: string; asset?: string }>;
}

/** Une phrase : sa clé, sa vignette éventuelle, le texte et son compteur. */
function Phrase({ m, k, limit, thumb, note }: { m: EditorModel; k: string; limit: number | null; thumb?: ComponentChildren; note?: string }): JSX.Element {
  const text = m.fr.find(([x]) => x === k)?.[1];
  const errors = keyErrors(saveErrors.value, k);
  return (
    <div class={`ed-phrase${errors.length > 0 ? ' has-error' : ''}`} data-key={k}>
      {thumb ? <div class="ed-phrase-thumb">{thumb}</div> : null}
      <div class="ed-phrase-body">
        <label for={`phrase-${k}`} class="ed-phrase-key">{k}{note ? <span class="ed-dim"> · {note}</span> : null}</label>
        <div class="ed-text">
          <textarea
            id={`phrase-${k}`}
            rows={2}
            value={text ?? ''}
            placeholder={text === undefined ? '(absente de fr.json)' : ''}
            onInput={(e) => edit((x) => setText(x, k, (e.target as HTMLTextAreaElement).value))}
          />
          <Counter text={text ?? ''} limit={limit} />
        </div>
        {errors.length > 0 ? <ul class="ed-errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      </div>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ComponentChildren }): JSX.Element {
  return (
    <section class="ed-group" aria-label={title}>
      <h2>{title}</h2>
      {note ? <p class="ed-dim ed-small">{note}</p> : null}
      {children}
    </section>
  );
}

const keysLike = (m: EditorModel, re: RegExp): string[] => m.fr.map(([k]) => k).filter((k) => re.test(k));

function cinematicTitle(m: EditorModel, id: string): string {
  if (id === 'intro') return 'Cinématique d\'intro';
  const memory = /^memory-(.+)$/.exec(id);
  const name = memory ? m.fr.find(([k]) => k === `memory.${memory[1]}.name`)?.[1] : undefined;
  return name ?? `Cinématique « ${id} »`;
}

function CinematicGroup({ m, id, raw }: { m: EditorModel; id: string; raw: unknown }): JSX.Element {
  const shots = ((raw as { shots?: Shot[] }).shots ?? []);
  return (
    <Group title={cinematicTitle(m, id)} note={`content/cinematics/${id}.json · dans l'ordre des plans. Les plans eux-mêmes (images, durées, sons) ne s'éditent pas ici.`}>
      {shots.flatMap((shot) => {
        const image = shot.layers?.find((l) => l.type === 'image' && l.asset)?.asset;
        const thumb = image ? <img src={`/cinematics/${id}/${image}.png`} alt={`Plan ${shot.id}`} loading="lazy" /> : <span class="ed-thumb-empty ed-shot-empty">{shot.id}</span>;
        const out: JSX.Element[] = [];
        if (shot.card) out.push(<Phrase key={`${shot.id}-card`} m={m} k={shot.card} limit={null} thumb={<span class="ed-thumb-empty ed-shot-empty">carton</span>} note={`plan ${shot.id}, carton`} />);
        if (shot.caption) out.push(<Phrase key={shot.id} m={m} k={shot.caption} limit={null} thumb={thumb} note={`plan ${shot.id}`} />);
        return out;
      })}
    </Group>
  );
}

export function PhrasesTab(): JSX.Element | null {
  const m = model.value;
  if (!m) return null;
  const camp = campCount(m);
  const lastText = m.fr.find(([k]) => k === `camp.cream.${camp}`)?.[1] ?? '';
  return (
    <main class="ed-phrases">
      {Object.entries(cinematics.value).map(([id, raw]) => <CinematicGroup key={id} m={m} id={id} raw={raw} />)}

      <Group title="Cream au refuge" note="Une au hasard quand on parle à Cream. Le jeu les compte par leur numéro : on en ajoute à la fin, on retire la dernière.">
        {Array.from({ length: camp }, (_, i) => <Phrase key={i} m={m} k={`camp.cream.${i + 1}`} limit={MAX_LINE_CHARS} />)}
        <div class="ed-row">
          <button type="button" class="ed-btn" onClick={() => {
            if (edit(addCampLine)) requestAnimationFrame(() => document.getElementById(`phrase-camp.cream.${camp + 1}`)?.focus());
          }}>+ Ajouter une réplique</button>
          <button type="button" class="ed-btn ed-btn-danger" disabled={camp <= 1} onClick={() => {
            if (lastText && !confirm(`Retirer camp.cream.${camp} ?\n« ${lastText} »`)) return;
            edit(removeLastCampLine);
          }}>Retirer la dernière</button>
        </div>
      </Group>

      <Group title="Tutoriel, bandeaux" note="Le bandeau de leçon en haut de l'écran.">
        {keysLike(m, /^tuto\.banner\./).map((k) => <Phrase key={k} m={m} k={k} limit={null} />)}
      </Group>

      <Group title="Tutoriel, remarques de Cream" note="Une réplique courte de Cream, et celles qu'il dit après une mort.">
        {keysLike(m, /^tuto\.(bark|death)\./).map((k) => <Phrase key={k} m={m} k={k} limit={MAX_LINE_CHARS} />)}
      </Group>

      <Group title="Noms">
        {keysLike(m, /^(dialog\.name\.|memory\.[^.]+\.name$)/).map((k) => <Phrase key={k} m={m} k={k} limit={null} />)}
      </Group>
    </main>
  );
}
