import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { GameData, PieceDef } from '../content/index.ts';
import { ownedPieces, pieceById, previewLantern, resolveLantern, type FaceView, type LanternView } from '../meta/lantern.ts';
import { LANTERN_FACES, type LanternSave } from '../meta/save.ts';
import { HelpBar, Icon, Panel, useFocusScope, useHandlers } from './parts.tsx';
import { actions, focusedId, gameData, roman, save, saveRev, t } from './store.ts';

/** Le nom d'une pièce, avec son niveau pour une rune. */
function pieceTitle(piece: PieceDef, level: number): string {
  const name = t(`${piece.id}.name`);
  if (piece.kind === 'glass') return name;
  return level > 0 ? `${name} ${roman(level)}` : `${name} · ${t('lantern.off')}`;
}

/** Le texte du bonus d'une pièce à ce niveau. */
export function bonusText(piece: PieceDef, level: number): string {
  return piece.kind === 'glass' ? t(`${piece.id}.bonus`) : t(`${piece.id}.bonus.${Math.max(1, level)}`);
}

/** Un malus de niveau fait partie du verre : le Verre fendu ne retire que les malus chiffrés. */
function malusGone(piece: PieceDef, face: FaceView): boolean {
  const numeric = Object.keys(piece.malus.stats).length + Object.keys(piece.malus.mods).length > 0;
  return face.malusCleared && numeric;
}

/** Une pièce posée : son nom, ce qu'elle donne, ce qu'elle coûte, et ce qui change son niveau. */
export function PieceText({ data, face }: { data: GameData; face: FaceView }): JSX.Element | null {
  const piece = pieceById(data, face.id);
  if (!piece) return null;
  const off = piece.kind === 'rune' && face.level === 0;
  const gone = malusGone(piece, face);
  return (
    <div class={`piece-text${off ? ' off' : ''}`}>
      <p class="piece-name">
        <Icon name={piece.icon} /> {pieceTitle(piece, face.level)}
        {face.sources.length > 0 ? (
          <span class="dim">
            ({face.sources.map((s) => t('lantern.source', { delta: s.delta > 0 ? `+${s.delta}` : String(s.delta), name: t(`${s.id}.name`) })).join(' · ')})
          </span>
        ) : null}
      </p>
      <p class="piece-bonus"><b>{t('lantern.bonus')}</b> {bonusText(piece, face.level)}</p>
      <p class={`piece-malus${gone ? ' gone' : ''}`}>
        <b>{t('lantern.malus')}</b> <span>{t(`${piece.id}.malus`)}</span>{gone ? <em> {t('lantern.malusCleared')}</em> : null}
      </p>
    </div>
  );
}

function closedText(data: GameData, lantern: LanternSave, face: number): string {
  return t(`lantern.unlock.${face + 1}`, { have: Math.min(lantern.wins, data.lantern.winsForThird), total: data.lantern.winsForThird });
}

function FaceButton(props: { index: number; view: FaceView | null; closed: boolean; chosen: boolean; onPress: () => void }): JSX.Element {
  const data = gameData();
  const piece = props.view ? pieceById(data, props.view.id) : null;
  const off = piece?.kind === 'rune' && props.view!.level === 0;
  return (
    <button
      type="button" class={`lantern-face face-${props.index + 1}${props.closed ? ' closed' : ''}${off ? ' off' : ''}${props.chosen ? ' chosen' : ''}`}
      data-focus={`face-${props.index + 1}`} data-focus-default={props.index === 0 ? '' : undefined} onClick={props.onPress}
    >
      {props.closed ? <Icon name="lantern-face-closed" /> : piece ? <Icon name={piece.icon} /> : <span class="face-hole" />}
      <span class="face-label">
        {props.closed ? t('lantern.closed') : piece ? pieceTitle(piece, props.view!.level) : t('lantern.face.empty')}
      </span>
    </button>
  );
}

function PieceRow({ piece, face }: { piece: PieceDef; face: number }): JSX.Element {
  return (
    <>
      <Icon name={piece.icon} />
      <span class="piece-row-name">{t(`${piece.id}.name`)}</span>
      {face >= 0 ? <span class="dim">{t('lantern.face', { n: face + 1 })}</span> : null}
    </>
  );
}

/** La liste ouverte sur une face : choisir une pièce, ou retirer celle qui y est. */
function PieceChooser({ face, onClose }: { face: number; onClose: () => void }): JSX.Element {
  // Sans clé : le focus part toujours de la pièce posée, ou de la première.
  const ref = useFocusScope('');
  useHandlers({ back: onClose });
  const data = gameData();
  const lantern = save.value!.account.lantern;
  const here = lantern.faces[face] ?? null;
  return (
    <div class="lantern-list active" ref={ref}>
      {here !== null ? (
        <button
          type="button" class="piece-row remove" data-focus="remove"
          onClick={() => {
            actions().lanternClear(face);
            onClose();
          }}
        >
          <span class="piece-row-name">{t('lantern.remove')}</span>
        </button>
      ) : null}
      {ownedPieces(data, lantern).map((p) => (
        <button
          type="button" key={p.id} class={`piece-row${here === p.id ? ' here' : ''}`} data-focus={p.id}
          data-focus-default={here === p.id ? '' : undefined}
          onClick={() => {
            if (here !== p.id) actions().lanternPlace(face, p.id);
            onClose();
          }}
        >
          <PieceRow piece={p} face={lantern.faces.indexOf(p.id)} />
        </button>
      ))}
    </div>
  );
}

/** Tout ce que la Lanterne donne à la prochaine expédition, en une ligne par pièce. */
function Summary({ view }: { view: LanternView }): JSX.Element {
  const data = gameData();
  const lines = view.faces.flatMap((face) => {
    const piece = face ? pieceById(data, face.id) : null;
    if (!face || !piece || (piece.kind === 'rune' && face.level === 0)) return [];
    return [(
      <p key={piece.id}>
        <b>{pieceTitle(piece, face.level)}</b> {bonusText(piece, face.level)}
        {malusGone(piece, face) ? null : <span class="piece-malus"> {t(`${piece.id}.malus`)}</span>}
      </p>
    )];
  });
  return (
    <div class="lantern-summary">
      <h2>{t('lantern.summary')}</h2>
      {lines.length > 0 ? lines : <p class="dim">{t('lantern.summary.none')}</p>}
    </div>
  );
}

/** L'écran de la Lanterne, au refuge : ses quatre faces, et les pièces à y poser. */
export function LanternScreen(): JSX.Element {
  const ref = useFocusScope('lantern');
  const [editing, setEditing] = useState<number | null>(null);
  saveRev.value;
  const data = gameData();
  const lantern = save.value!.account.lantern;
  const owned = ownedPieces(data, lantern);
  const focus = focusedId.value;
  useHandlers({
    back: () => actions().goto('camp'),
    y: () => {
      if (lantern.faces.some((id) => id !== null)) actions().lanternClearAll();
      else actions().uiSound('refuse');
    },
  });
  // En choisissant une pièce, l'anneau montre déjà les niveaux qu'elle donnerait.
  const trying = editing !== null && focus !== null && (focus === 'remove' || pieceById(data, focus) !== null);
  const view = trying ? previewLantern(data, lantern, editing, focus === 'remove' ? null : focus) : resolveLantern(data, lantern);
  const faceIndex = editing ?? (focus?.startsWith('face-') ? Number(focus.slice(5)) - 1 : 0);
  const shown = view.faces[faceIndex] ?? null;
  const press = (face: number): void => {
    if (face >= lantern.opened || owned.length === 0) actions().uiSound('refuse');
    else {
      actions().uiSound('confirm');
      setEditing(face);
    }
  };
  return (
    <div class="screen lantern" ref={ref}>
      <Panel class="lantern-panel" active>
        <header>
          <h1>{t('lantern.title')}</h1>
          <span class="memories-count">{t('lantern.count', { have: owned.length, total: data.lantern.pieces.length })}</span>
        </header>
        <div class="lantern-cols">
          <div class="lantern-left">
            <div class="lantern-ring">
              <span class="lantern-body"><Icon name="lantern-frame" /></span>
              {Array.from({ length: LANTERN_FACES }, (_, i) => (
                <FaceButton
                  key={i} index={i} view={view.faces[i] ?? null} closed={i >= lantern.opened} chosen={editing === i}
                  onPress={() => {
                    if (editing === null) press(i);
                  }}
                />
              ))}
            </div>
            <Summary view={view} />
          </div>
          <div class="lantern-right">
            <h2>{t('lantern.pieces')}</h2>
            {editing !== null
              ? <PieceChooser face={editing} onClose={() => setEditing(null)} />
              : (
                <div class="lantern-list">
                  {owned.map((p) => <div key={p.id} class="piece-row"><PieceRow piece={p} face={lantern.faces.indexOf(p.id)} /></div>)}
                  {owned.length === 0 ? <p class="dim lantern-empty">{t('lantern.empty')}</p> : null}
                </div>
              )}
            <div class="lantern-detail">
              {faceIndex >= lantern.opened
                ? <p>{closedText(data, lantern, faceIndex)}</p>
                : shown ? <PieceText data={data} face={shown} /> : <p class="dim">{t('lantern.face', { n: faceIndex + 1 })} · {t('lantern.face.empty')}</p>}
            </div>
          </div>
        </div>
      </Panel>
      <HelpBar
        items={editing !== null
          ? [['nav', t('ui.move')], ['confirm', t('ui.confirm')], ['back', t('ui.back')]]
          : [['nav', t('ui.move')], ['confirm', t('lantern.choose')], lantern.faces.some((id) => id !== null) && ['y', t('lantern.clear')], ['back', t('ui.back')]]}
      />
    </div>
  );
}
