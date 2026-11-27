import type { JSX } from 'preact';
import { Portrait } from './dialogue.tsx';
import { HelpBar, Icon, useFocusScope, useHandlers } from './parts.tsx';
import { Currencies } from './screens.tsx';
import { bossBeaten, hasMemory, regionOpen } from '../meta/hero.ts';
import { actions, fmtTime, gameData, holdProgress, lastSeed, replaySeed, save, saveRev, t } from './store.ts';

const CLASS = 'class.ash-blade';

/**
 * Le porteur de la lanterne : qui part, et son trait (un bonus, un malus). Moon est seul pour l'instant ;
 * les emplacements fermés annoncent les suivants.
 */
function Carrier(): JSX.Element {
  return (
    <div class="carrier">
      <span class="carrier-face"><Portrait name="face-moon-neutral" size={40} /></span>
      <div class="carrier-body">
        <span class="carrier-name">{t(`${CLASS}.who`)} <em>{t(`${CLASS}.trait.name`)}</em></span>
        <span class="carrier-bonus">{t(`${CLASS}.trait.bonus`)}</span>
        <span class="carrier-malus">{t(`${CLASS}.trait.malus`)}</span>
      </div>
      <span class="carrier-slot closed" title={t('door.carrier.closed')} />
      <span class="carrier-slot closed" title={t('door.carrier.closed')} />
    </div>
  );
}

/** La porte : choisir où l'on va. Une carte par région, puis des cartes fermées. */
export function DoorScreen(): JSX.Element {
  const ref = useFocusScope('door');
  saveRev.value;
  const s = save.value!;
  const data = gameData();
  const regions = Object.values(data.regions);
  const replay = replaySeed.value && lastSeed.value !== null;
  useHandlers({
    back: () => actions().goto('camp'),
    x: () => {
      if (lastSeed.value !== null) replaySeed.value = !replaySeed.value;
    },
  });
  const stats = s.account.stats;
  return (
    <div class="screen door" ref={ref}>
      <div class="camp-purse"><Currencies /></div>
      <div class="door-records">
        <span title={t('door.runs')}><Icon name="icon-find-boots" /> {stats.runs ?? 0}</span>
        <span title={t('door.wins')}><Icon name="sign-crown" /> {stats.victories ?? 0}</span>
        <span title={t('door.best')}><Icon name="sign-hourglass" /> {fmtTime(stats.bestSeconds ?? 0)}</span>
      </div>
      <Carrier />
      <div class="door-cards">
        {regions.map((r, i) => {
          const lit = s.account.regions[r.id]?.lit === true;
          const open = regionOpen(data, s, r.id);
          const boss = data.enemies[r.bossIdx]!;
          const memory = data.memories.find((m) => m.bossIdx === r.bossIdx);
          const found = memory !== undefined && hasMemory(s, memory.id);
          if (!open) {
            // La route est fermée : on voit où elle mène, et ce qui la garde.
            const keeper = data.enemies[data.regions[r.requires!]!.bossIdx]!;
            return (
              <button type="button" key={r.id} class="door-card locked" data-focus={r.id} onClick={() => actions().depart(undefined, r.id)}>
                <span class="door-art">{r.art ? <Icon name={r.art} /> : <Icon name={r.borderDecor} />}</span>
                <span class="door-name">{t(`${r.id}.name`)}</span>
                <span class="door-lock"><Icon name="sign-lock" /> {t('door.locked')}</span>
                <span class="door-hint">{t('door.requires', { name: t(`${keeper.id}.name`) })}</span>
              </button>
            );
          }
          return (
            <button
              type="button" key={r.id} class="door-card" data-focus={r.id} data-focus-default={i === 0 ? '' : undefined} data-hold=""
              onClick={() => actions().depart(replay ? lastSeed.value! : undefined, r.id)}
            >
              <span class="door-art">{r.art ? <Icon name={r.art} /> : <Icon name={r.borderDecor} />}</span>
              <span class="door-level">{t('door.level', { level: r.level })}</span>
              <span class="door-name">{t(`${r.id}.name`)}</span>
              <span class="door-keeper">{bossBeaten(s, r.id) || lit ? t(`${boss.id}.name`) : t('door.unknown')}</span>
              <span class="hold-track"><span class="hold-fill" style={{ width: `${Math.round(holdProgress.value * 100)}%` }} /></span>
              <span class={`door-fire${lit ? ' lit' : ''}`} title={t(lit ? 'door.lit' : 'door.dark')}><Icon name="sign-flame" /></span>
              {found ? <span class="door-memory" title={t('door.memory')}><Icon name="pickup-gem-medium" /></span> : null}
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, data.memoriesTotal - regions.length) }, (_, i) => (
          <span key={i} class="door-card closed"><span class="door-art"><Icon name="lantern-face-closed" /></span></span>
        ))}
      </div>
      {replay ? <p class="seed"><Icon name="lantern-face-closed" /> {t('door.sameMap')} · {t('camp.seed.noPiece')}</p> : null}
      <HelpBar items={[['confirm', t('camp.holdToLeave')], lastSeed.value !== null && ['x', t('door.sameMap')], ['back', t('ui.back')]]} />
    </div>
  );
}
