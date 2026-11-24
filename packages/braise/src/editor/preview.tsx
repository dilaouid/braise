import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DialogueView } from '../ui/dialogue-view.tsx';
import { AtlasImage, poseSprite } from './atlas.tsx';
import { emoteLabel, poseLabel } from './labels.ts';
import type { EditLine, EditorModel } from './model.ts';

/** La vitesse d'écriture du jeu (src/app/main.tsx, DIALOGUE_CPS). */
const CPS = 40;

const frText = (m: EditorModel, key: string, fallback: string): string => m.fr.find(([k]) => k === key)?.[1] ?? fallback;

/** Moon et Cream dans la pose du message, avec leur bulle au-dessus : ce que le moteur dessine sur le terrain. */
function Stage({ line }: { line: EditLine }): JSX.Element {
  return (
    <div class="ed-actors" aria-label="Poses et bulles">
      {(['moon', 'cream'] as const).map((who) => (
        <figure class="ed-actor" key={who}>
          <span class="ed-emote">{line.emotes[who] ? <AtlasImage name={`emote-${line.emotes[who]}`} size={24} label={`bulle ${emoteLabel(line.emotes[who])}`} /> : null}</span>
          <AtlasImage name={poseSprite(who, line.poses[who])} size={72} label={`${who === 'moon' ? 'Moon' : 'Cream'}, pose ${poseLabel(line.poses[who])}`} />
          <figcaption>{who === 'moon' ? 'Moon' : 'Cream'} · {poseLabel(line.poses[who])}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** La boîte du jeu, à l'échelle 2, pour une réplique ; un silence est dit tel quel. */
function Box({ m, line, shown, onNext, onSkip }: { m: EditorModel; line: EditLine; shown: number; onNext: () => void; onSkip: () => void }): JSX.Element {
  if (!line.who) {
    return <div class="ed-stage-frame"><div class="ed-silence">Silence de {String(line.seconds).replace('.', ',')} s</div></div>;
  }
  return (
    <div class="ed-stage-frame">
      <div class="ed-stage">
        <DialogueView
          who={line.who}
          face={line.face}
          portrait={<AtlasImage name={`face-${line.who}-${line.face}`} size={64} />}
          name={frText(m, `dialog.name.${line.who}`, line.who)}
          text={line.text}
          shown={shown}
          single={false}
          hold={0}
          nextGlyph={<span class="glyph glyph-key glyph-confirm">Entrée</span>}
          skipGlyph={<span class="glyph glyph-key glyph-back">Échap</span>}
          nextLabel={frText(m, 'dialog.next', 'Suivant')}
          skipLabel={frText(m, 'dialog.skip', 'Passer')}
          onNext={onNext}
          onSkip={onSkip}
        />
      </div>
    </div>
  );
}

/**
 * L'aperçu du message choisi, comme en jeu. « Jouer depuis ce message » enchaîne les messages avec
 * l'écriture lettre par lettre : A, Entrée ou un clic avance, Échap arrête.
 */
export function Preview({ m, lines, index, onSelect }: { m: EditorModel; lines: EditLine[]; index: number; onSelect: (i: number) => void }): JSX.Element {
  const [playing, setPlaying] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const at = playing ?? index;
  const line = lines[at];

  // L'écriture lettre par lettre ; un silence passe seul après sa durée.
  useEffect(() => {
    if (playing === null || !line) return;
    if (!line.who) {
      const t = setTimeout(() => advance(), line.seconds * 1000);
      return () => clearTimeout(t);
    }
    if (shown >= line.text.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 1000 / CPS);
    return () => clearTimeout(t);
  }, [playing, shown, line]);

  useEffect(() => {
    if (playing === null) return;
    frame.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'Enter' || e.key === 'a' || e.key === 'A' || e.key === ' ') advance();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function stop(): void {
    if (playing !== null) onSelect(playing);
    setPlaying(null);
  }
  function advance(): void {
    if (playing === null || !line) return;
    if (line.who && shown < line.text.length) {
      setShown(line.text.length);
      return;
    }
    if (playing + 1 >= lines.length) {
      stop();
      return;
    }
    setPlaying(playing + 1);
    setShown(0);
  }
  const play = (): void => {
    setPlaying(index);
    setShown(0);
  };

  return (
    <section class="ed-preview" aria-label="Aperçu">
      <div class="ed-preview-head">
        <h2>Aperçu <span class="ed-dim">message {at + 1}</span></h2>
        {playing === null ? (
          <button type="button" class="ed-btn ed-btn-primary" onClick={play} disabled={!line}>▶ Jouer depuis ce message</button>
        ) : (
          <button type="button" class="ed-btn" onClick={stop}>■ Arrêter <span class="ed-dim">(Échap)</span></button>
        )}
        {playing !== null ? <span class="ed-dim">A, Entrée ou un clic : suite</span> : null}
      </div>
      {line ? (
        <div class="ed-preview-body" ref={frame} tabIndex={-1}>
          <Box
            m={m}
            line={line}
            shown={playing === null ? line.text.length : shown}
            onNext={() => (playing === null ? play() : advance())}
            onSkip={() => stop()}
          />
          <Stage line={line} />
        </div>
      ) : <p class="ed-dim">Aucun message.</p>}
    </section>
  );
}
