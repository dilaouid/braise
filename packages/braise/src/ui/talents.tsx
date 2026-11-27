import type { JSX } from 'preact';
import type { TalentNodeRaw } from '../content/index.ts';
import { newHero } from '../meta/save.ts';
import {
  branchPoints, canAddTalent, talentPointsLeft, talentPointsSpent, talentRank, tierOpen, tierThreshold,
} from '../meta/talents.ts';
import { ConfirmDialog, HelpBar, Icon, Panel, Pips, useFocusScope, useHandlers } from './parts.tsx';
import { actions, confirm, focusedId, gameData, save, saveRev, t } from './store.ts';

const CLASS = 'class.ash-blade';

/** Un nœud : son icône, son nom, ses rangs. A y place un point. */
function NodeButton({ node, first }: { node: TalentNodeRaw; first: boolean }): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const hero = save.value!.heroes[CLASS] ?? newHero();
  const rank = talentRank(cls, hero, node.id);
  const open = tierOpen(cls, hero, node, data.heroTuning);
  const can = canAddTalent(cls, hero, data.heroTuning, node.id) === null;
  const state = !open ? 'locked' : rank >= node.ranks ? 'full' : rank > 0 ? 'some' : can ? 'ready' : '';
  return (
    <button
      type="button" class={`talent ${state} ${node.tier === 4 ? 'master' : ''}`} data-focus={node.id}
      data-focus-default={first ? '' : undefined} onClick={() => actions().addTalent(node.id)}
    >
      <span class="talent-icon"><Icon name={node.icon} /></span>
      <span class="talent-body">
        <span class="talent-name">{t(`${node.id}.name`)}</span>
        <Pips value={rank} max={node.ranks} />
      </span>
    </button>
  );
}

/** Ce que dit le nœud au focus : son effet, son rang, ce qui le ferme. */
function Detail(): JSX.Element {
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const hero = save.value!.heroes[CLASS] ?? newHero();
  const node = cls.tree.nodes.find((n) => n.id === focusedId.value);
  if (!node) return <div class="talent-detail" />;
  const open = tierOpen(cls, hero, node, data.heroTuning);
  return (
    <div class="talent-detail">
      <b>{t(`${node.id}.name`)}</b>
      <span class="dim">{node.tier === 4 ? t('talents.master') : t('talents.rank', { rank: talentRank(cls, hero, node.id), max: node.ranks })}</span>
      <span>{t(`${node.id}.desc`)}</span>
      {open ? null : <span class="bad">{t('talents.locked', { points: tierThreshold(node.tier, data.heroTuning) })}</span>}
    </div>
  );
}

/** Le feu de camp : l'arbre de Moon. Chaque niveau donne une braise à placer. */
export function TalentsScreen(): JSX.Element {
  const ref = useFocusScope('talents');
  saveRev.value;
  const data = gameData();
  const cls = data.classes[CLASS]!;
  const hero = save.value!.heroes[CLASS] ?? newHero();
  const left = talentPointsLeft(cls, hero, data.heroTuning);
  const spent = talentPointsSpent(cls, hero);
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
  });
  return (
    <div class="screen talents" ref={ref}>
      <Panel class="talents-panel" active>
        <header>
          <h1>{t('talents.title')}</h1>
          <span class={`talents-points ${left > 0 ? 'gold' : ''} ${left < 0 ? 'bad' : ''}`}>
            {left < 0 ? t('talents.over', { points: -left }) : t('talents.points', { points: left })}
          </span>
        </header>
        <p class="quote">{t('talents.quote')}</p>
        <div class="talent-tree">
          {cls.tree.branches.map((branch, b) => (
            <section class="talent-branch" key={branch}>
              <h2>{t(`talents.branch.${branch}`)} <span class="dim">{branchPoints(cls, hero, branch)}</span></h2>
              {[1, 2, 3, 4].map((tier) => (
                <div class="talent-tier" key={tier}>
                  {cls.tree.nodes.filter((n) => n.branch === branch && n.tier === tier).map((n, k) => (
                    <NodeButton key={n.id} node={n} first={b === 0 && tier === 1 && k === 0} />
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
        <Detail />
      </Panel>
      <HelpBar items={[['confirm', t('talents.add')], ['x', t('talents.remove')], spent > 0 && ['y', t('talents.reset')], ['back', t('ui.back')]]} />
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
