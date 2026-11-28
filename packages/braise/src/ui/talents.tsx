import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { newHero } from '../meta/save.ts';
import {
  branchPoints, canAddTalent, canRemoveTalent, talentPointsLeft, talentPointsSpent, talentRank, tierOpen, tierThreshold,
} from '../meta/talents.ts';
import { ConfirmDialog, HelpBar, Icon, Pips, focusRef, useFocusScope, useHandlers } from './parts.tsx';
import { actions, confirm, focusedId, gameData, refs, save, saveRev, t } from './store.ts';
import { talentEffects, talentSlots, treeStep, type Slot } from './talent-view.ts';

const CLASS = 'class.ash-blade';
/** Géométrie de l'arbre, en pixels natifs : largeur d'une branche, hauteur d'un étage, écart des deux nœuds d'un étage. */
const COL_W = 128;
const ROW_H = 58;
const PAIR = 23;
const TOP = 30;

function hero() {
  return save.value!.heroes[CLASS] ?? newHero();
}

/** Une flamme animée de l'atlas, posée au pied d'une branche. */
function Flame({ x, delay, big }: { x: number; delay: number; big?: boolean }): JSX.Element | null {
  const atlas = refs.atlas;
  const rect = atlas?.rect('fx-flame#0');
  if (!atlas || !rect) return null;
  return (
    <span
      class={`hearth-flame ${big ? 'big' : ''}`}
      style={{
        left: `${x}px`,
        backgroundImage: `url(${refs.atlasUrl})`,
        backgroundSize: `${atlas.size.width}px ${atlas.size.height}px`,
        backgroundPositionY: `-${rect.y}px`,
        '--fx': `-${rect.x}px`,
        '--fx-end': `-${rect.x + rect.w * 4}px`,
        animationDelay: `${-delay}s`,
      }}
    />
  );
}

/** Des étincelles qui montent du foyer : positions et rythmes fixes, pour que l'écran soit le même à chaque visite. */
const SPARKS = [
  [22, 0, 3.4], [61, 1.2, 4.1], [97, 2.3, 3.7], [150, 0.6, 4.4], [188, 2.9, 3.2], [231, 1.7, 3.9],
  [276, 0.3, 4.6], [318, 2.1, 3.5], [352, 1.0, 4.0], [376, 3.1, 3.6], [120, 3.6, 4.2], [255, 3.3, 3.3],
] as const;

/** Un nœud : son icône, ses rangs en braises dessous. A y place un point. */
function NodeButton({ slot, first }: { slot: Slot; first: boolean }): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const h = hero();
  const { node } = slot;
  const rank = talentRank(cls, h, node.id);
  const open = tierOpen(cls, h, node, data.heroTuning);
  const can = canAddTalent(cls, h, data.heroTuning, node.id) === null;
  const state = !open ? 'locked' : rank >= node.ranks ? 'full' : rank > 0 ? (can ? 'some ready' : 'some') : can ? 'ready' : 'open';
  const master = node.tier === 4;
  const size = master ? 36 : 30;
  const cx = (Math.floor(slot.col / 2) * COL_W) + COL_W / 2 + (slot.col % 1 === 0 ? (slot.col % 2 === 0 ? -PAIR : PAIR) : 0);
  const cy = TOP + slot.row * ROW_H;
  return (
    <button
      type="button" class={`tnode ${state} ${master ? 'master' : ''}`} data-focus={node.id}
      data-focus-default={first ? '' : undefined} onClick={() => actions().addTalent(node.id)}
      style={{ left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` }}
    >
      <Icon name={node.icon} />
      <span class="tnode-ranks">
        {Array.from({ length: node.ranks }, (_, i) => <i key={i} class={i < rank ? 'on' : ''} />)}
      </span>
    </button>
  );
}

/** Une branche : son tronc, qui se remplit de braise à mesure qu'on y place des points, et les seuils de ses étages. */
function Trunk({ branch, b }: { branch: string; b: number }): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const pts = branchPoints(cls, hero(), branch);
  const last = tierThreshold(4, data.heroTuning);
  const span = ROW_H * 3;
  const fill = Math.round(span * Math.min(1, last > 0 ? pts / last : 1));
  const x = b * COL_W + COL_W / 2;
  return (
    <>
      <span class="trunk" style={{ left: `${x - 1}px`, top: `${TOP}px`, height: `${span}px` }}>
        <span class="trunk-fill" style={{ height: `${fill}px` }} />
      </span>
      {[2, 3, 4].map((tier) => {
        const need = tierThreshold(tier, data.heroTuning);
        const lit = pts >= need;
        return (
          <span key={tier} class={`threshold ${lit ? 'lit' : ''}`} style={{ left: `${x - 7}px`, top: `${TOP + (4 - tier) * ROW_H + ROW_H / 2 - 5}px` }}>
            {need}
          </span>
        );
      })}
      <span class="branch-name" style={{ left: `${b * COL_W}px`, width: `${COL_W}px`, top: `${TOP + span + 26}px` }}>
        {t(`talents.branch.${branch}`)} <b>{pts}</b>
      </span>
    </>
  );
}

/** Où en est la branche du nœud au focus : les braises qu'il lui faut pour ouvrir son étage suivant. */
function BranchProgress({ branch }: { branch: string }): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const pts = branchPoints(cls, hero(), branch);
  const tier = [2, 3, 4].find((k) => pts < tierThreshold(k, data.heroTuning));
  const name = t(`talents.branch.${branch}`);
  return (
    <div class="tdetail-branch">
      {tier === undefined ? t('talents.allOpen', { branch: name }) : t('talents.progress', { branch: name, points: pts, need: tierThreshold(tier, data.heroTuning), tier })}
    </div>
  );
}

/** Ce que dit le nœud au focus : son effet par rang, ce qu'il donne maintenant, ce que donnerait le rang suivant. */
function Detail(): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const h = hero();
  const node = cls.tree.nodes.find((n) => n.id === focusedId.value);
  if (!node) return <div class="tdetail panel" />;
  const rank = talentRank(cls, h, node.id);
  const open = tierOpen(cls, h, node, data.heroTuning);
  const now = talentEffects(node, rank, t);
  // Tous les rangs qu'il reste à prendre, chacun avec ce qu'il donnerait.
  const nexts = Array.from({ length: node.ranks - rank }, (_, i) => ({ rank: rank + 1 + i, lines: talentEffects(node, rank + 1 + i, t) }));
  const holds = rank > 0 && canRemoveTalent(cls, h, data.heroTuning, node.id) === 'holds';
  return (
    <div class="tdetail panel">
      <div class="tdetail-head">
        <span class={`tdetail-icon ${rank > 0 ? 'lit' : ''}`}><Icon name={node.icon} /></span>
        <span class="tdetail-title">
          <b>{t(`${node.id}.name`)}</b>
          <span class="dim">{t(`talents.branch.${node.branch}`)} · {node.tier === 4 ? t('talents.master') : t('talents.tier', { tier: node.tier })}</span>
          <span class="tdetail-rank">{t('talents.rank', { rank, max: node.ranks })} <Pips value={rank} max={node.ranks} /></span>
        </span>
      </div>
      <p class="tdetail-desc">{t(`${node.id}.desc`)}</p>
      <div class="tdetail-values">
        <span class="tdetail-label">{t('talents.now')}</span>
        {now.length > 0 ? now.map((line) => <span key={line} class="gold">{line}</span>) : <span class="dim">{t('talents.none')}</span>}
        <span class="tdetail-label">{t('talents.next')}</span>
        {nexts.length > 0
          ? nexts.map((n) => (
              <span key={n.rank} class="tdetail-nextrank">
                <span class="dim">{t('talents.nextRank', { rank: n.rank })}</span>
                {n.lines.map((line) => <span key={line} class="tdetail-next">{line}</span>)}
              </span>
            ))
          : <span class="dim">{t('talents.maxed')}</span>}
      </div>
      {open ? null : <span class="bad">{t('talents.locked', { points: tierThreshold(node.tier, data.heroTuning) })}</span>}
      {holds ? <span class="dim">{t('talents.holds')}</span> : null}
      <BranchProgress branch={node.branch} />
    </div>
  );
}

/** Le feu de camp : l'arbre de Moon, qui monte du foyer. Chaque niveau donne une braise à placer. */
export function TalentsScreen(): JSX.Element {
  const ref = useFocusScope('talents');
  saveRev.value;
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const h = hero();
  const left = talentPointsLeft(cls, h, data.heroTuning);
  const spent = talentPointsSpent(cls, h);
  const all = talentSlots(cls);
  /** La colonne d'où l'on vient : en montant d'un étage à deux nœuds vers un nœud seul, on redescend du même côté. */
  const prefer = useRef(0);
  useHandlers({
    back: () => actions().goto('camp'),
    x: () => {
      const id = focusedId.value;
      if (id) actions().removeTalent(id);
    },
    y: () => {
      if (spent <= 0) return;
      confirm.value = { text: t('talents.reset.confirm', { points: spent }), yes: t('talents.reset'), onYes: () => actions().resetTalents() };
    },
    nav: (dx, dy) => {
      const from = all.find((s) => s.node.id === focusedId.value);
      if (!from) return false;
      if (from.col % 1 === 0) prefer.current = from.col;
      else if (Math.floor(prefer.current / 2) !== Math.floor(from.col / 2)) prefer.current = Math.floor(from.col);
      const to = treeStep(all, from, dx === 0 ? 0 : Math.sign(dx), dx === 0 ? Math.sign(dy) : 0, prefer.current);
      if (to) focusRef.focusId?.(to.node.id);
      return true;
    },
  });
  return (
    <div class="screen talents" ref={ref}>
      <div class="talents-glow" />
      <header class="talents-head">
        <h1>{t('talents.title')}</h1>
        <p class="quote">{t('talents.quote')}</p>
      </header>
      <div class={`talents-points ${left > 0 ? 'has' : ''} ${left < 0 ? 'bad' : ''}`}>
        {left < 0 ? <span>{t('talents.over', { points: -left })}</span> : (
          <>
            <span class="talents-points-n">{left}</span>
            <span>{t(left === 1 ? 'talents.left.one' : 'talents.left')}</span>
          </>
        )}
      </div>
      <div class="talent-tree">
        <div class="sparks">
          {SPARKS.map(([x, d, s], i) => <i key={i} style={{ left: `${x}px`, animationDelay: `${-d}s`, animationDuration: `${s}s` }} />)}
        </div>
        {cls.tree.branches.map((branch, b) => <Trunk key={branch} branch={branch} b={b} />)}
        {all.map((s) => <NodeButton key={s.node.id} slot={s} first={s.col === 0 && s.row === 3} />)}
        <div class="hearth">
          {cls.tree.branches.map((branch, b) => (
            <span key={branch}>
              <Flame x={b * COL_W + COL_W / 2 - 16} delay={b * 0.17} big />
              <Flame x={b * COL_W + COL_W / 2 - 30} delay={b * 0.23 + 0.31} />
              <Flame x={b * COL_W + COL_W / 2 + 14} delay={b * 0.11 + 0.07} />
            </span>
          ))}
        </div>
      </div>
      <Detail />
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('talents.add')], ['x', t('talents.remove')], spent > 0 && ['y', t('talents.reset')], ['back', t('ui.back')]]} />
      {confirm.value ? (
        <ConfirmDialog
          text={confirm.value.text} yes={confirm.value.yes}
          onYes={() => {
            const c = confirm.value;
            confirm.value = null;
            c?.onYes();
          }}
          onNo={() => (confirm.value = null)}
        />
      ) : null}
    </div>
  );
}
