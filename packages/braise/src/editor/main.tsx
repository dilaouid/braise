import '@fontsource/jersey-10/latin.css';
import '@fontsource/jersey-15/latin.css';
import '../ui/style.css';
import './editor.css';
import type { JSX } from 'preact';
import { render } from 'preact';
import { loadAtlas } from './atlas.tsx';
import { DialoguesTab } from './dialogues.tsx';
import { PhrasesTab } from './phrases.tsx';
import {
  changeCount, conflict, dirty, diskChanged, draftOffer, dropDraft, load, loadError, loadSounds, offerDraft, resumeDraft, save,
  saveErrors, saving, status, tab, type Tab,
} from './state.ts';

/**
 * L'éditeur de texte d'histoire : une page de développement (`pnpm dev`, /editor.html) qui écrit
 * content/dialogues.json et content/i18n/fr.json par le greffon tools/vite-editor.ts.
 */

/** Recharge depuis le disque, après confirmation s'il y a des changements non enregistrés. */
async function reloadFromDisk(): Promise<void> {
  if (dirty.value && !confirm('Recharger depuis le disque ? Les changements non enregistrés seront perdus.')) return;
  dropDraft();
  await load();
  status.value = { text: 'Rechargé depuis le disque.', kind: 'info' };
}

function Tabs(): JSX.Element {
  const tabs: Array<[Tab, string]> = [['dialogues', 'Dialogues'], ['phrases', 'Phrases']];
  return (
    <div class="ed-tabs" role="tablist" aria-label="Onglets">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab.value === id}
          class={`ed-tab${tab.value === id ? ' selected' : ''}`}
          onClick={() => {
            tab.value = id;
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              tab.value = tab.value === 'dialogues' ? 'phrases' : 'dialogues';
              requestAnimationFrame(() => document.querySelector<HTMLElement>('.ed-tab.selected')?.focus());
            }
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Header(): JSX.Element {
  const n = changeCount.value;
  return (
    <header class="ed-header">
      <h1>Braise <span class="ed-dim">· texte d'histoire</span></h1>
      <Tabs />
      <span class="ed-grow" />
      <span class={`ed-changes${n > 0 ? ' on' : ''}`} aria-live="polite">
        {n > 0 ? <><span class="ed-dot" aria-hidden="true">●</span> {n} changement{n > 1 ? 's' : ''}</> : 'Tout est enregistré'}
      </span>
      <button type="button" class="ed-btn" disabled={!dirty.value || saving.value} onClick={() => void reloadFromDisk()} title="Recharger depuis le disque">Tout annuler</button>
      <button type="button" class="ed-btn ed-btn-primary" disabled={saving.value} onClick={() => void save()} title="Ctrl+S">
        {saving.value ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </header>
  );
}

function Banners(): JSX.Element {
  const s = status.value;
  return (
    <div class="ed-banners">
      {draftOffer.value ? (
        <div class="ed-banner ed-banner-info" role="status">
          Un brouillon non enregistré du {new Date(draftOffer.value.at).toLocaleString('fr-FR')} est gardé dans ce navigateur.
          <button type="button" class="ed-btn ed-btn-primary" onClick={resumeDraft}>Le reprendre</button>
          <button type="button" class="ed-btn" onClick={dropDraft}>L'oublier</button>
        </div>
      ) : null}
      {diskChanged.value || conflict.value ? (
        <div class="ed-banner ed-banner-warn" role="alert">
          <strong>Fichiers changés sur le disque.</strong>
          {conflict.value ? ' L\'enregistrement a été refusé pour ne rien écraser.' : ' Un fichier de content/ a changé hors de l\'éditeur.'}
          {dirty.value ? ' Recharger fera perdre les changements non enregistrés.' : ''}
          <button type="button" class="ed-btn ed-btn-primary" onClick={() => void reloadFromDisk()}>Recharger</button>
          {conflict.value ? null : <button type="button" class="ed-btn" onClick={() => { diskChanged.value = false; }}>Ignorer</button>}
        </div>
      ) : null}
      {s ? <div class={`ed-status ed-status-${s.kind}`} role={s.kind === 'error' ? 'alert' : 'status'}>{s.text}</div> : null}
      {saveErrors.value.length > 0 ? (
        <details class="ed-banner ed-banner-error" open>
          <summary>{saveErrors.value.length} erreur{saveErrors.value.length > 1 ? 's' : ''} de validation : rien n'a été écrit</summary>
          <ul>{saveErrors.value.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function EditorApp(): JSX.Element {
  if (loadError.value) {
    return (
      <div class="ed-fatal" role="alert">
        <h1>Éditeur indisponible</h1>
        <p>{loadError.value}</p>
        <button type="button" class="ed-btn ed-btn-primary" onClick={() => void load()}>Réessayer</button>
      </div>
    );
  }
  return (
    <div class="ed-app">
      <Header />
      <Banners />
      {tab.value === 'dialogues' ? <DialoguesTab /> : <PhrasesTab />}
    </div>
  );
}

// Ctrl+S (ou Cmd+S) enregistre, où que soit le focus.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
  }
});

// Avertir avant de quitter avec des changements non enregistrés.
window.addEventListener('beforeunload', (e) => {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = '';
});

// Un fichier de content/ a changé : venant de l'éditeur, rien à faire ; sinon, le bandeau. Jamais de rechargement seul.
if (import.meta.hot) {
  import.meta.hot.on('braise:content', (data: { file: string; fromEditor: boolean }) => {
    if (!data.fromEditor) diskChanged.value = true;
  });
}

async function start(): Promise<void> {
  render(<EditorApp />, document.getElementById('editor') as HTMLElement);
  await Promise.all([load(), loadAtlas(), loadSounds()]);
  offerDraft();
}

void start();
