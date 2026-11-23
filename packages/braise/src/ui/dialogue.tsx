import type { JSX } from 'preact';
import { Btn } from './parts.tsx';
import { actions, cineSkip, dialogueShown, dialogueState, refs, t } from './store.ts';

/** Un portrait de l'atlas, réduit ou non : `size` est son côté en pixels de l'image native. */
export function Portrait({ name, size }: { name: string; size: number }): JSX.Element {
  const atlas = refs.atlas;
  const rect = atlas?.rect(name);
  if (!atlas || !rect) return <span class="portrait portrait-missing" style={{ width: `${size}px`, height: `${size}px` }} />;
  const k = size / rect.w;
  return (
    <span
      class="portrait"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${refs.atlasUrl})`,
        backgroundPosition: `-${rect.x * k}px -${rect.y * k}px`,
        backgroundSize: `${atlas.size.width * k}px ${atlas.size.height * k}px`,
      }}
    />
  );
}

/**
 * La boîte de dialogue : le portrait de Moon à gauche, celui de Cream à droite, le nom, et le texte
 * qui s'écrit lettre par lettre. Cliquer la boîte fait comme A ; cliquer « Passer » fait comme B maintenu.
 */
export function DialogueBox(): JSX.Element | null {
  const d = dialogueState.value;
  if (!d) return null;
  const shown = dialogueShown.value;
  const hold = cineSkip.value;
  const done = shown >= d.text.length;
  return (
    <div class={`dialogue dialogue-${d.who}`}>
      <span class="dialogue-face" key={`${d.who}-${d.face}`}><Portrait name={`face-${d.who}-${d.face}`} size={64} /></span>
      <button type="button" class="dialogue-box" onClick={() => actions().dialogueNext()}>
        <span class="dialogue-name">{t(`dialog.name.${d.who}`)}</span>
        <span class="dialogue-text">
          {d.text.slice(0, shown)}
          <span class="dialogue-rest">{d.text.slice(shown)}</span>
        </span>
        <span class={`dialogue-next${done ? ' ready' : ''}`}><Btn g="confirm" /> {t(d.single ? 'ui.close' : 'dialog.next')}</span>
      </button>
      {d.single ? null : (
        <button type="button" class={`dialogue-skip${hold > 0 ? ' active' : ''}`} onClick={() => actions().dialogueSkip()}>
          <span class="cine-ring" style={{ '--hold': String(hold) }} />
          <Btn g="back" /> {t('dialog.skip')}
        </button>
      )}
    </div>
  );
}
