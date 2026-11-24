import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { GameData, PieceDef } from '../content/index.ts';
import { ownedPieces, pieceById, previewLantern, resolveLantern, type FaceView, type LanternView } from '../meta/lantern.ts';
import { LANTERN_FACES, type LanternSave } from '../meta/save.ts';
import { lanternChips, pieceChips } from './effects.ts';
import { Chips } from './effects.tsx';
import { HelpBar, Icon, Pips, useFocusScope, useHandlers } from './parts.tsx';
import { actions, focusedId, gameData, save, saveRev, t } from './store.ts';

/** Le texte du bonus d'une pièce à ce niveau. */
function bonusText(piece: PieceDef, level: number): string {
  return piece.kind === 'glass' ? t(`${piece.id}.bonus`) : t(`${piece.id}.bonus.${Math.max(1, level)}`);
}

/** Un malus de niveau fait partie du verre : le Verre fendu ne retire que les malus chiffrés. */
function hasNumericMalus(piece: PieceDef): boolean {
  return Object.keys(piece.malus.stats).length + Object.keys(piece.malus.mods).length > 0;
}

function closedText(data: GameData, lantern: LanternSave, face: number): string {
  return t(`lantern.unlock.${face + 1}`, { have: Math.min(lantern.wins, data.lantern.winsForThird), total: data.lantern.winsForThird });
}

/** Les centres des faces, dans l'anneau. */
const CENTERS = [[150, 24], [230, 122], [150, 220], [70, 122]] as const;
/** Un trait s'arrête avant le cadre de ses deux faces. */
const LINK_MARGIN = 34;

interface Link { from: number; to: number; label: string; kind: 'up' | 'down' | 'clear' }

/** Les traits de l'anneau : quel verre change quelle face. */
function linksOf(data: GameData, view: LanternView): Link[] {
  const out: Link[] = [];
  view.faces.forEach((face, to) => {
    const piece = face ? pieceById(data, face.id) : null;
    if (!face || !piece) return;
    for (const s of face.sources) {
      const from = view.faces.findIndex((f) => f?.id === s.id);
      if (from >= 0) out.push({ from, to, label: s.delta > 0 ? `+${s.delta}` : String(s.delta), kind: s.delta > 0 ? 'up' : 'down' });
    }
    if (face.malusCleared && hasNumericMalus(piece)) out.push({ from: (to + 2) % LANTERN_FACES, to, label: '', kind: 'clear' });
  });
  return out;
}

function Links({ links }: { links: Link[] }): JSX.Element {
  return (
    <svg class="lantern-links" width="300" height="246">
      {links.map((l, i) => {
        const [ax, ay] = CENTERS[l.from]!;
        const [bx, by] = CENTERS[l.to]!;
        const d = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / d;
        const uy = (by - ay) / d;
        // Deux traits entre les mêmes faces : chacun de son côté.
        const side = links.findIndex((x) => x.from === l.from && x.to === l.to) === i ? 0 : 6;
        const x = (k: number): number => Math.round(ax + ux * k - uy * side);
        const y = (k: number): number => Math.round(ay + uy * k + ux * side);
        return (
          <g key={`${l.from}-${l.to}-${l.kind}`} class={`lantern-link ${l.kind}`} data-from={l.from + 1} data-to={l.to + 1}>
            <path d={`M${x(LINK_MARGIN)} ${y(LINK_MARGIN)} L${x(d - LINK_MARGIN)} ${y(d - LINK_MARGIN)}`} />
            {l.label ? <text x={x(d - LINK_MARGIN - 14) + (l.from === 3 || l.to === 3 ? -14 : 6)} y={y(d - LINK_MARGIN - 14) + 4}>{l.label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

function FaceButton(props: { index: number; view: FaceView | null; closed: boolean; chosen: boolean; onPress: () => void }): JSX.Element {
  const data = gameData();
  const piece = props.view ? pieceById(data, props.view.id) : null;
  const rune = piece?.kind === 'rune';
  const off = rune && props.view!.level === 0;
  return (
    <button
      type="button" class={`lantern-face face-${props.index + 1}${props.closed ? ' closed' : ''}${off ? ' off' : ''}${props.chosen ? ' chosen' : ''}`}
      data-focus={`face-${props.index + 1}`} data-focus-default={props.index === 0 ? '' : undefined}
      data-piece={piece?.id ?? ''} data-level={rune ? props.view!.level : undefined}
      aria-label={piece ? t(`${piece.id}.name`) : t(props.closed ? 'lantern.closed' : 'lantern.face.empty')} onClick={props.onPress}
    >
      {props.closed ? <Icon name="lantern-face-closed" /> : piece ? <Icon name={piece.icon} /> : null}
      {rune ? <Pips value={props.view!.level} max={3} /> : null}
    </button>
  );
}

/** La grille ouverte sur une face : choisir une pièce, ou retirer celle qui y est. */
function PieceChooser({ face, onClose, onDetails }: { face: number; onClose: () => void; onDetails: () => void }): JSX.Element {
  // Sans clé : le focus part toujours de la pièce posée, ou de la première.
  const ref = useFocusScope('');
  useHandlers({ back: onClose, x: onDetails });
  const data = gameData();
  const lantern = save.value!.account.lantern;
  const here = lantern.faces[face] ?? null;
  return (
    <div class="lantern-grid active" ref={ref}>
      {data.lantern.pieces.map((p) => (lantern.owned.includes(p.id) ? (
        <button
          type="button" key={p.id} class={`piece-cell${lantern.faces.includes(p.id) ? ' placed' : ''}`} data-focus={p.id}
          data-focus-default={here === p.id ? '' : undefined} aria-label={t(`${p.id}.name`)}
          onClick={() => {
            if (here !== p.id) actions().lanternPlace(face, p.id);
            onClose();
          }}
        >
          <Icon name={p.icon} />
        </button>
      ) : <span key={p.id} class="piece-cell missing"><Icon name={p.icon} /></span>))}
      {here !== null ? (
        <button
          type="button" class="piece-cell remove" data-focus="remove" aria-label={t('lantern.remove')}
          onClick={() => {
            actions().lanternClear(face);
            onClose();
          }}
        >
          <Icon name="sign-remove" />
        </button>
      ) : null}
    </div>
  );
}

/** Une pièce posée : son nom, ses pastilles, et ses phrases si on les demande. */
function PieceDetail({ data, face, details }: { data: GameData; face: FaceView; details: boolean }): JSX.Element | null {
  const piece = pieceById(data, face.id);
  if (!piece) return null;
  const off = piece.kind === 'rune' && face.level === 0;
  return (
    <>
      <p class="piece-name"><Icon name={piece.icon} /> {t(`${piece.id}.name`)}{off ? <span class="dim">{t('lantern.off')}</span> : null}</p>
      <Chips chips={pieceChips(data, face)} />
      {details ? (
        <p class="piece-words">
          {bonusText(piece, face.level)} <span class="piece-malus">{t(`${piece.id}.malus`)}</span>
        </p>
      ) : null}
    </>
  );
}

/** L'écran de la Lanterne, au refuge : ses quatre faces, et les pièces à y poser, en images. */
export function LanternScreen(): JSX.Element {
  const ref = useFocusScope('lantern');
  const [editing, setEditing] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  saveRev.value;
  const data = gameData();
  const lantern = save.value!.account.lantern;
  const owned = ownedPieces(data, lantern);
  const focus = focusedId.value;
  const filled = lantern.faces.some((id) => id !== null);
  const toggle = (): void => {
    actions().uiSound('move');
    setDetails(!details);
  };
  useHandlers({
    back: () => actions().goto('camp'),
    x: toggle,
    y: () => {
      if (filled) actions().lanternClearAll();
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
  const placed = new Set(lantern.faces);
  return (
    <div class="screen lantern" ref={ref}>
      <div class="lantern-ring">
        <Links links={linksOf(data, view)} />
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
      <div class="lantern-summary"><Chips chips={lanternChips(data, view)} /></div>
      {editing !== null
        ? <PieceChooser face={editing} onClose={() => setEditing(null)} onDetails={toggle} />
        : (
          <div class="lantern-grid">
            {data.lantern.pieces.map((p) => (
              <span key={p.id} class={`piece-cell${lantern.owned.includes(p.id) ? '' : ' missing'}${placed.has(p.id) ? ' placed' : ''}`}><Icon name={p.icon} /></span>
            ))}
          </div>
        )}
      <div class={`lantern-detail${shown || faceIndex >= lantern.opened || owned.length === 0 ? '' : ' empty'}`}>
        {faceIndex >= lantern.opened
          ? <p>{closedText(data, lantern, faceIndex)}</p>
          : shown ? <PieceDetail data={data} face={shown} details={details} /> : owned.length === 0 ? <p>{t('lantern.empty')}</p> : null}
      </div>
      <HelpBar
        items={[
          ['confirm', t(editing !== null ? 'lantern.place' : 'lantern.choose')], shown !== null && ['x', t('lantern.details')],
          editing === null && filled && ['y', t('lantern.clear')], ['back', t('ui.back')],
        ]}
      />
    </div>
  );
}
