import type { JSX } from 'preact';
import type { AltarBoostRaw } from '../content/index.ts';
import { altarCost, altarRank, altarSpent, canBuyAltarRank } from '../meta/altar.ts';
import { hasMemory, heroXpForNext, memoryCount } from '../meta/hero.ts';
import { newHero, type Settings } from '../meta/save.ts';
import { Bar, Btn, ConfirmDialog, HelpBar, Icon, MenuButton, Panel, Pips, useFocusScope, useHandlers } from './parts.tsx';
import {
  actions, cineCaption, cineCard, cineQuick, cineSkip, confirm, dialogueState, ending, fmt, fmtTime, gameData, knowsCream, memoryCard, notice,   roman, save, saveRev, t,
} from './store.ts';

const CLASS = 'class.ash-blade';

/** L'or et les Cendres du compte. */
export function Currencies(): JSX.Element {
  saveRev.value;
  const s = save.value!;
  return (
    <div class="currencies">
      <span class="currency"><Icon name="icon-gold" /> {fmt(s.account.gold)}</span>
      <span class="currency"><Icon name="icon-ashes" /> {fmt(s.account.ashes)}</span>
    </div>
  );
}

export function Title(): JSX.Element {
  const ref = useFocusScope('title');
  saveRev.value;
  const s = save.value;
  return (
    <div class="screen title" ref={ref}>
      <div class="logo">
        <span class="logo-text">BRAISE</span>
        <span class="logo-sub">{t('game.subtitle')}</span>
      </div>
      <button type="button" class="press" data-focus="start" data-focus-default onClick={() => actions().start()}>
        {t('ui.press')} <Btn g="confirm" /> {t('ui.toStart')}
      </button>
      {/* Toujours là : une sauvegarde qui a déjà un héros ne rejoue pas le prologue d'elle-même. */}
      <div class="title-extras">
        <button type="button" class="press press-small" data-focus="prologue" onClick={() => actions().prologue()}>
          {t('title.prologue')}
        </button>
        {/* Le tutoriel se rejoue dès qu'un héros existe ou qu'il a été vu ; une sauvegarde neuve y passe d'elle-même. */}
        {s && knowsCream(s) ? (
          <button type="button" class="press press-small" data-focus="tutorial" onClick={() => actions().tutorial()}>
            {t('title.tutorial')}
          </button>
        ) : null}
      </div>
      {notice.value ? <p class="notice">{notice.value}</p> : null}
    </div>
  );
}

/**
 * La cinématique (document 15) : l'image est dessinée par le rendu, l'interface affiche le carton,
 * la ligne de récit en bas de l'image, et les deux touches (suite, passer).
 */
export function CinematicScreen(): JSX.Element {
  const card = cineCard.value;
  const caption = cineCaption.value;
  const hold = cineSkip.value;
  const found = memoryCard.value;
  // La scène d'un souvenir finit sur son carton : il attend A, il n'y a plus rien à passer.
  if (found) {
    return (
      <div class="screen cinematic">
        <button type="button" class="cine-memory" onClick={() => actions().closeMemoryCard()}>
          <span class="cine-memory-found">{t('memory.found')}</span>
          <span class="cine-memory-name">{t(`${found.id}.name`)}</span>
          <span class="cine-memory-count">{t('memory.count', { have: found.have, total: found.total })}</span>
        </button>
        <div class="cine-next"><Btn g="confirm" /> {t('cine.next')}</div>
      </div>
    );
  }
  return (
    <div class="screen cinematic">
      {card ? <p class="cine-card" key={card}>{t(card)}</p> : null}
      {caption ? <p class="cine-caption" key={caption}>{t(caption)}</p> : null}
      {caption ? <div class="cine-next"><Btn g="confirm" /> {t('cine.next')}</div> : null}
      <div class={`cine-skip${hold > 0 ? ' active' : ''}`}>
        <span class="cine-ring" style={{ '--hold': String(hold) }} />
        <Btn g="back" /> {t(cineQuick.value ? 'cine.skipPress' : 'cine.skip')}
      </div>
    </div>
  );
}

/**
 * Une scène de route : le jeu dessine Moon et Cream sur le décor du refuge ; la boîte de dialogue
 * s'affiche par-dessus quand l'un d'eux parle. Ici : l'anneau « maintenir pour passer » quand aucune
 * boîte n'est ouverte, puis le carton du souvenir, par-dessus le refuge.
 */
export function SceneScreen(): JSX.Element {
  const found = memoryCard.value;
  if (found) {
    return (
      <div class="screen scene">
        <button type="button" class="cine-memory" onClick={() => actions().closeMemoryCard()}>
          <span class="cine-memory-found">{t('memory.found')}</span>
          <span class="cine-memory-name">{t(`${found.id}.name`)}</span>
          <span class="cine-memory-count">{t('memory.count', { have: found.have, total: found.total })}</span>
        </button>
        <div class="cine-next"><Btn g="confirm" /> {t('cine.next')}</div>
      </div>
    );
  }
  const hold = cineSkip.value;
  return (
    <div class="screen scene">
      {dialogueState.value ? null : (
        <div class={`cine-skip${hold > 0 ? ' active' : ''}`}>
          <span class="cine-ring" style={{ '--hold': String(hold) }} />
          <Btn g="back" /> {t('cine.skip')}
        </div>
      )}
    </div>
  );
}

/**
 * Les Souvenirs au refuge : un emplacement par souvenir du jeu, dans l'ordre du contenu. Un souvenir
 * obtenu porte son nom et se rejoue ; les autres sont des emplacements vides, sans nom ni indice.
 */
export function Memories(): JSX.Element {
  const ref = useFocusScope('memories');
  saveRev.value;
  const s = save.value!;
  const data = gameData();
  useHandlers({ back: () => actions().goto('camp') });
  const first = data.memories.find((m) => hasMemory(s, m.id));
  const slots: JSX.Element[] = [];
  for (let i = 0; i < data.memoriesTotal; i++) {
    const memory = data.memories[i];
    if (memory && hasMemory(s, memory.id)) {
      slots.push(
        <button
          type="button" key={memory.id} class="memory-slot" data-focus={memory.id}
          data-focus-default={memory === first ? '' : undefined} onClick={() => actions().replayMemory(memory.id)}
        >
          <span class="memory-rank">{i + 1}</span>
          <Icon name="poi-souvenir" />
          <span class="memory-name">{t(`${memory.id}.name`)}</span>
        </button>,
      );
    } else {
      slots.push(
        <div class="memory-slot empty" key={i}>
          <span class="memory-rank">{i + 1}</span>
          <span class="memory-name">{t('camp.memories.empty')}</span>
        </div>,
      );
    }
  }
  return (
    <div class="screen memories" ref={ref}>
      <Panel class="memories-panel" active>
        <header>
          <h1>{t('camp.memories')}</h1>
          <span class="memories-count">{t('memory.count', { have: memoryCount(data, s), total: data.memoriesTotal })}</span>
        </header>
        <p class="dim">{t('camp.memories.desc')}</p>
        <div class="memories-list">{slots}</div>
      </Panel>
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('ui.confirm')], ['back', t('ui.back')]]} />
    </div>
  );
}

function describeBonus(id: string, rank: number): string {
  const data = gameData();
  const boost = data.altar.find((b) => b.id === id)!;
  const [key, per] = Object.entries(boost.perRank)[0] as [string, number];
  const value = per * rank;
  const pct = `+${Math.round(value * 100)} %`;
  switch (key) {
    case 'power': return `${pct} ${t('stat.power')}`;
    case 'maxHpShare': return `${pct} ${t('stat.maxHp')}`;
    case 'glowShare': return `${pct} ${t('stat.glow')}`;
    case 'wisdom': return `${pct} ${t('stat.wisdom')}`;
    default: return `+${value}`;
  }
}

/** Un déblocage de rareté : un seul rang, qui ouvre une rareté de Flamme et peut en demander un autre. */
function Unlock({ boost }: { boost: AltarBoostRaw }): JSX.Element {
  // La sauvegarde est modifiée en place : c'est `saveRev` qui fait redessiner.
  saveRev.value;
  const s = save.value!;
  const data = gameData();
  const owned = altarRank(s, boost.id) > 0;
  const err = canBuyAltarRank(s, data, boost.id);
  const disabled = s.account.altarDisabled.includes(boost.id);
  return (
    <button
      type="button" class={`boost unlock rarity-${boost.unlock} ${err ? 'cannot' : ''} ${disabled ? 'off' : ''}`}
      data-focus={boost.id} title={t(`${boost.id}.desc`)} onClick={() => actions().buyAltar(boost.id)}
    >
      <span class="boost-icon"><Icon name={boost.icon} /></span>
      <span class="boost-body">
        <span class="boost-name">{t(`${boost.id}.name`)}</span>
        {owned ? <span class="boost-line gold">{t(disabled ? 'altar.disabled' : 'altar.unlock.open')}</span> : null}
        {!owned && err === 'requires' ? <span class="boost-line">{t('altar.unlock.requires', { name: t(`${boost.requires}.name`) })}</span> : null}
        {owned ? null : (
          <span class={`boost-cost ${err === 'ashes' ? 'bad' : ''}`}><Icon name="icon-ashes" /> {fmt(altarCost(boost, 1))}</span>
        )}
      </span>
    </button>
  );
}

export function Altar(): JSX.Element {
  const ref = useFocusScope('altar');
  saveRev.value;
  const s = save.value!;
  const data = gameData();
  const spent = altarSpent(s, data);
  const focusedId = (): string | null => document.querySelector('.altar .is-focused')?.getAttribute('data-focus') ?? null;
  useHandlers({
    back: () => actions().goto('camp'),
    x: () => {
      if (spent <= 0) return;
      confirm.value = { text: t('altar.refund.confirm', { amount: fmt(spent) }), yes: t('altar.refund'), onYes: () => actions().refundAltar() };
    },
    y: () => {
      const id = focusedId();
      if (id) actions().toggleAltar(id);
    },
  });
  return (
    <div class="screen altar" ref={ref}>
      <Panel class="altar-panel" active>
        <header>
          <h1>{t('altar.title')}</h1>
          <Currencies />
        </header>
        <p class="quote">{t('altar.ysolde')}</p>
        <div class="altar-grid">
          {data.altar.filter((b) => b.unlock === undefined).map((boost, i) => {
            const rank = altarRank(s, boost.id);
            const max = boost.ranks;
            const maxed = max > 0 && rank >= max;
            const cost = altarCost(boost, rank + 1);
            const err = canBuyAltarRank(s, data, boost.id);
            const disabled = s.account.altarDisabled.includes(boost.id);
            return (
              <button
                type="button" key={boost.id} class={`boost ${err ? 'cannot' : ''} ${disabled ? 'off' : ''}`}
                data-focus={boost.id} data-focus-default={i === 0 ? '' : undefined}
                onClick={() => actions().buyAltar(boost.id)}
              >
                <span class="boost-icon"><Icon name={boost.icon} /></span>
                <span class="boost-body">
                  <span class="boost-name">{t(`${boost.id}.name`)} {disabled ? <em>({t('altar.disabled')})</em> : null}</span>
                  <Pips value={rank} max={max} />
                  <span class="boost-line">{t('altar.now', { value: rank > 0 ? describeBonus(boost.id, rank) : '—' })}</span>
                  {maxed
                    ? <span class="boost-line gold">{t('altar.max')}</span>
                    : <span class="boost-line">{t('altar.next', { value: describeBonus(boost.id, rank + 1) })}</span>}
                  {maxed ? null : (
                    <span class={`boost-cost ${err === 'ashes' ? 'bad' : ''}`}>
                      <Icon name="icon-ashes" /> {fmt(cost)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <h2 class="altar-row">{t('altar.flames')}</h2>
        <div class="altar-unlocks">
          {data.altar.filter((b) => b.unlock !== undefined).map((boost) => <Unlock key={boost.id} boost={boost} />)}
        </div>
        <p class="dim">{t('altar.spent', { spent: fmt(spent) })}</p>
      </Panel>
      <HelpBar items={[['confirm', t('altar.buy')], ['y', t('altar.toggle')], spent > 0 && ['x', t('altar.refund')], ['back', t('ui.back')]]} />
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

type SettingRow =
  | { key: keyof Settings; kind: 'toggle' }
  | { key: keyof Settings; kind: 'slider' };

const SETTING_ROWS: SettingRow[] = [
  { key: 'volumeMaster', kind: 'slider' },
  { key: 'volumeMusic', kind: 'slider' },
  { key: 'volumeSfx', kind: 'slider' },
  { key: 'autoSkills', kind: 'toggle' },
  { key: 'damageNumbers', kind: 'toggle' },
  { key: 'screenShake', kind: 'slider' },
  { key: 'swapAB', kind: 'toggle' },
  { key: 'showFps', kind: 'toggle' },
];

export function SettingsScreen({ onClose, inRun }: { onClose: () => void; inRun?: boolean }): JSX.Element {
  const ref = useFocusScope('settings');
  saveRev.value;
  const s = save.value!.settings;
  const change = (row: SettingRow, dir: number): void => {
    if (row.kind === 'toggle') actions().setSetting(row.key, !s[row.key] as never);
    else actions().setSetting(row.key, Math.max(0, Math.min(1, Math.round(((s[row.key] as number) + dir * 0.1) * 10) / 10)) as never);
  };
  useHandlers({
    back: onClose,
    nav: (dx) => {
      if (dx === 0) return false;
      const id = document.querySelector('.settings .is-focused')?.getAttribute('data-focus');
      const row = SETTING_ROWS.find((r) => r.key === id);
      if (!row) return false;
      change(row, dx);
      return true;
    },
  });
  return (
    <div class={`screen settings ${inRun ? 'over' : ''}`} ref={ref}>
      <Panel class="settings-panel" active>
        <h1>{t('settings.title')}</h1>
        <div class="settings-list">
          {SETTING_ROWS.map((row, i) => (
            <button
              type="button" key={row.key} class="setting" data-focus={row.key} data-focus-default={i === 0 ? '' : undefined}
              onClick={() => {
                // Au clic, un curseur monte d'un cran, puis repart de zéro.
                if (row.kind === 'slider' && (s[row.key] as number) >= 1) actions().setSetting(row.key, 0 as never);
                else change(row, 1);
              }}
            >
              <span>{t(`settings.${row.key}`)}</span>
              {row.kind === 'toggle'
                ? <span class={`toggle ${s[row.key] ? 'on' : ''}`}>{s[row.key] ? t('settings.on') : t('settings.off')}</span>
                : <span class="slider"><Bar value={s[row.key] as number} max={1} /> <b>{Math.round((s[row.key] as number) * 100)}</b></span>}
            </button>
          ))}
          <button type="button" class="setting" data-focus="fullscreen" onClick={() => actions().fullscreen()}>
            <span>{t('settings.fullscreen')}</span>
          </button>
          {inRun ? null : (
            <button
              type="button" class="setting danger" data-focus="erase"
              onClick={() => (confirm.value = { text: t('settings.erase.confirm'), yes: t('settings.erase'), onYes: () => actions().eraseSave() })}
            >
              <span>{t('settings.erase')}</span>
            </button>
          )}
        </div>
      </Panel>
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('ui.confirm')], ['back', t('ui.back')]]} />
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

export function EndScreen(): JSX.Element | null {
  const ref = useFocusScope('end');
  const e = ending.value;
  if (!e) return null;
  const { result, summary } = e;
  const data = gameData();
  const victory = result.outcome === 'victory';
  const total = result.damageByWeapon.reduce((sum, w) => sum + w.damage, 0) || 1;
  const hero = save.value!.heroes[result.classId] ?? newHero();
  const next = heroXpForNext(hero.level, data.heroTuning);
  return (
    <div class="screen end" ref={ref}>
      <Panel class="end-panel" active>
        <h1 class={victory ? 'gold' : 'danger-text'}>{t(`end.${result.outcome}`)}</h1>
        {summary.memory ? <p class="end-memory">{t('end.memory', { name: t(`${summary.memory}.name`) })}</p> : null}
        {summary.lanternPiece ? <p class="end-piece">{t('end.piece', { name: t(`${summary.lanternPiece}.name`) })}</p> : null}
        {summary.lanternLost ? <p class="end-piece lost">{t('end.pieceLost', { name: t(`${summary.lanternLost}.name`) })}</p> : null}
        {summary.lanternFace ? <p class="end-piece">{t('end.lanternFace', { n: summary.lanternFace })}</p> : null}
        <div class="end-cols">
          <div class="end-col">
            <p><span>{t('end.time')}</span><b>{fmtTime(result.seconds)}</b></p>
            <p><span>{t('end.kills')}</span><b>{fmt(result.kills)}</b></p>
            <p><span>{t('end.runLevel')}</span><b>{result.runLevel}</b></p>
            <p><span>{t('end.elites')}</span><b>{result.elites}</b></p>
            <h2>{t('end.damage')}</h2>
            {result.damageByWeapon.map((w) => {
              return (
                <div class="dmg-row" key={w.id}>
                  <span class="dmg-name">{t(`${w.id}.name`)}</span>
                  <Bar value={w.damage} max={total} />
                  <b>{Math.round((100 * w.damage) / total)} %</b>
                </div>
              );
            })}
          </div>
          <div class="end-col">
            <p>
              <span><Icon name="icon-gold" /> {t('end.gold')}</span>
              <b>{fmt(result.goldKept)} {t('end.kept')}{victory ? '' : ` · ${fmt(result.goldCollected - result.goldKept)} ${t('end.lost')}`}</b>
            </p>
            <p>
              <span><Icon name="icon-ashes" /> {t('end.ashes')}</span>
              <b>{fmt(result.ashesKept)} {t('end.kept')}{victory ? '' : ` · ${fmt(result.ashesCollected - result.ashesKept)} ${t('end.lost')}`}</b>
            </p>
            {result.goldSpent > 0 ? (
              <p>
                <span><Icon name="icon-gold" /> {t('end.goldSpent')}</span>
                <b>{fmt(result.goldSpent)}</b>
              </p>
            ) : null}
            <p class="dim">{victory ? t('end.victoryBonus') : t('end.deathShare')}</p>
            <h2>{t('end.heroXp')} +{fmt(result.heroXp)}</h2>
            <p><span>{t('end.heroLevel', { level: summary.heroLevel })}</span>{summary.levelsGained > 0 ? <b class="gold">{t('end.levelUp', { n: summary.levelsGained })}</b> : null}</p>
            <Bar class="bar-xp" value={hero.xp} max={next} />
            <p class="dim">{t('end.seed', { seed: result.seed })} · {t('region.ash-woods.name')} · {t('hud.vigil', { vigil: roman(result.vigil) })}</p>
          </div>
        </div>
        <div class="row">
          <MenuButton id="camp" label={t('end.camp')} onPress={() => actions().goto('camp')} default />
          <MenuButton id="again" label={t('end.again')} onPress={() => actions().depart(undefined, result.regionId)} />
        </div>
      </Panel>
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('ui.confirm')]]} />
    </div>
  );
}
