import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { GameData } from '../content/index.ts';
import { ownedPieces, pieceById, previewLantern, resolveLantern, type FaceView, type LanternView } from '../meta/lantern.ts';
import { LANTERN_FACES, type LanternSave } from '../meta/save.ts';
import { hasNumericMalus, lanternChips, pieceChips, pieceWords } from './effects.ts';
import { Chips } from './effects.tsx';
import { gridStep } from './grid.ts';
import { HelpBar, Icon, Pips, focusRef, useFocusScope, useHandlers } from './parts.tsx';
import { actions, focusedId, gameData, save, saveRev, t } from './store.ts';

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

/** La grille des pièces : quatre colonnes, et la case « Retirer » au bout de la première rangée. */
const GRID_COLS = 4;

/** La grille ouverte sur une face : choisir une pièce, ou retirer celle qui y est. */
function PieceChooser({ face, onClose, onDetails }: { face: number; onClose: () => void; onDetails: () => void }): JSX.Element {
  // Sans clé : le focus part toujours de la pièce posée, ou de la première.
  const ref = useFocusScope('');
  const data = gameData();
  const lantern = save.value!.account.lantern;
  const here = lantern.faces[face] ?? null;
  // Les pièces à trouver ne prennent pas le focus : la grille a des trous, elle se parcourt case par case.
  const cells = new Map<number, string>();
  data.lantern.pieces.forEach((p, i) => {
    if (lantern.owned.includes(p.id)) cells.set(Math.floor(i / GRID_COLS) * (GRID_COLS + 1) + (i % GRID_COLS), p.id);
  });
  if (here !== null) cells.set(GRID_COLS, 'remove');
  useHandlers({
    back: onClose,
    x: onDetails,
    nav: (dx, dy) => {
      const from = [...cells].find(([, id]) => id === focusedId.value)?.[0];
      const next = from === undefined ? null : gridStep([...cells.keys()], from, dx, dy, GRID_COLS + 1);
      if (next !== null) focusRef.focusId?.(cells.get(next)!);
      return true;
    },
  });
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
  const words = pieceWords(data, face);
  return (
    <>
      <p class="piece-name">
        <Icon name={piece.icon} /> {t(`${piece.id}.name`)}
        {off ? <span class="dim">{t('lantern.off')}</span> : piece.kind === 'rune' ? <span class="dim">{t('lantern.level', { n: face.level, max: 3 })}</span> : null}
      </p>
      <Chips chips={pieceChips(data, face)} />
      {details ? (
        <p class="piece-words">
          <span class={words.bonusOff ? 'off' : ''}>{t(words.bonus)}</span> <span class={`piece-malus${words.malusOff ? ' off' : ''}`}>{t(words.malus)}</span>
        </p>
      ) : null}
    </>
  );
}

/** Une face fermée : ce qu'il faut faire pour l'ouvrir. */
function ClosedDetail({ text }: { text: string }): JSX.Element {
  return (
    <>
      <p class="piece-name"><Icon name="lantern-face-closed" /> {t('lantern.closedTitle')}</p>
      <p class="piece-words"><span class="dim">{t('lantern.closedHow')}</span> {text}</p>
    </>
  );
}

/** L'écran de la Lanterne, au refuge : ses quatre faces, et les pièces à y poser, en images. */
export function LanternScreen(): JSX.Element {
  const ref = useFocusScope('lantern');
  const [editing, setEditing] = useState<number | null>(null);
  // Les mots sous les pastilles sont là d'emblée : X les cache, pour qui n'en veut plus.
  const [details, setDetails] = useState(true);
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
  const summary = lanternChips(data, view);
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
      <div class="lantern-summary">
        {summary.length > 0 ? <span class="lantern-caption">{t('lantern.total')}</span> : null}
        <Chips chips={summary} />
      </div>
      <p class="lantern-count">{t('lantern.pieces', { have: lantern.owned.length, total: data.lantern.pieces.length })}</p>
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
          ? <ClosedDetail text={closedText(data, lantern, faceIndex)} />
          : shown ? <PieceDetail data={data} face={shown} details={details} /> : owned.length === 0 ? <p>{t('lantern.empty')}</p> : null}
      </div>
      <HelpBar
        items={[
          editing !== null ? ['confirm', t('lantern.place')] : faceIndex < lantern.opened && owned.length > 0 && ['confirm', t('lantern.choose')], shown !== null && ['x', t('lantern.details')],
          editing === null && filled && ['y', t('lantern.clear')], ['back', t('ui.back')],
        ]}
      />
    </div>
  );
}
