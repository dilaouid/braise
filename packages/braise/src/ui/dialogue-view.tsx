import type { ComponentChildren, JSX } from 'preact';

/** Tout ce que la boîte de dialogue montre, reçu en paramètre : ni signal ni donnée du jeu. */
export interface DialogueViewProps {
  who: 'moon' | 'cream';
  face: string;
  /** Le portrait déjà dessiné (64 px de côté). */
  portrait: ComponentChildren;
  /** Le nom de celui qui parle, déjà traduit. */
  name: string;
  /** Le texte entier, et combien de lettres sont écrites. */
  text: string;
  shown: number;
  /** Une réplique seule : il n'y a rien à passer. */
  single: boolean;
  /** Progression du maintien pour passer, de 0 à 1. */
  hold: number;
  /** Les invites des boutons « suivant » et « passer », et leurs mots. */
  nextGlyph: ComponentChildren;
  skipGlyph: ComponentChildren;
  nextLabel: string;
  skipLabel: string;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * La boîte de dialogue : le portrait toujours à gauche, le nom, et le texte
 * qui s'écrit lettre par lettre. Le jeu (`DialogueBox`) et l'éditeur de texte la partagent.
 */
export function DialogueView(p: DialogueViewProps): JSX.Element {
  const done = p.shown >= p.text.length;
  return (
    <div class={`dialogue dialogue-${p.who}`}>
      <span class="dialogue-face" key={`${p.who}-${p.face}`}>{p.portrait}</span>
      <button type="button" class="dialogue-box" onClick={() => p.onNext()}>
        <span class="dialogue-name">{p.name}</span>
        <span class="dialogue-text">
          {p.text.slice(0, p.shown)}
          <span class="dialogue-rest">{p.text.slice(p.shown)}</span>
        </span>
        <span class={`dialogue-next${done ? ' ready' : ''}`}>{p.nextGlyph} {p.nextLabel}</span>
      </button>
      {p.single ? null : (
        <button type="button" class={`dialogue-skip${p.hold > 0 ? ' active' : ''}`} onClick={() => p.onSkip()}>
          <span class="cine-ring" style={{ '--hold': String(p.hold) }} />
          {p.skipGlyph} {p.skipLabel}
        </button>
      )}
    </div>
  );
}
