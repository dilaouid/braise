import type { JSX } from 'preact';
import { DialogueView } from './dialogue-view.tsx';
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
  return (
    <DialogueView
      who={d.who}
      face={d.face}
      portrait={<Portrait name={`face-${d.who}-${d.face}`} size={64} />}
      name={t(`dialog.name.${d.who}`)}
      text={d.text}
      shown={dialogueShown.value}
      single={d.single}
      hold={cineSkip.value}
      nextGlyph={<Btn g="confirm" />}
      skipGlyph={<Btn g="back" />}
      nextLabel={t(d.single ? 'ui.close' : 'dialog.next')}
      skipLabel={t('dialog.skip')}
      onNext={() => actions().dialogueNext()}
      onSkip={() => actions().dialogueSkip()}
    />
  );
}
