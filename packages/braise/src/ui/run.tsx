import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { RARITIES } from '../content/index.ts';
import type { Card } from '../core/types.ts';
import { Bar, Btn, ConfirmDialog, HelpBar, Icon, MenuButton, Panel, Pips, useFocusScope, useHandlers, type Glyph } from './parts.tsx';
import { SettingsScreen } from './screens.tsx';
import { Portrait } from './dialogue.tsx';
import {
  actions, chest, findState, fmt, focusedId, forgeState, fmtTime, gameData, hud, levelUp, overlay, pauseReason, pauseStats, roman, runExtras, shopState, t,
  totemState, tutoHud,
} from './store.ts';

const LESSON_GLYPHS: readonly Glyph[] = ['move', 'dash', 'flask', 'skill', 'confirm'];

/** Un anneau de rechargement, en pixels : il se remplit dans le sens des aiguilles. */
function Ring({ frac, icon, glyph, active, count }: {
  frac: number; icon: string; glyph: 'skill' | 'ultimate' | 'dash' | 'flask'; active?: boolean;
  /** Un nombre de charges, affiché dans le coin (la ruée, quand elle en a plusieurs). */
  count?: number;
}): JSX.Element {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <span class={`ring ${pct >= 100 ? 'ready' : ''} ${active ? 'active' : ''}`} style={`--pct: ${pct}%`}>
      <Icon name={icon} />
      <Btn g={glyph} />
      {count === undefined ? null : <b class="ring-count">{count}</b>}
    </span>
  );
}

export function Hud(): JSX.Element | null {
  const h = hud.value;
  if (!h) return null;
  const data = gameData();
  const cls = data.classes['class.ash-blade']!;
  // Le tutoriel : ni chronomètre, ni Veillée, ni mini-carte, ni Cendres ; un bandeau de leçon en haut.
  const tuto = tutoHud.value;
  const glyph = tuto ? LESSON_GLYPHS.find((g) => g === tuto.glyph) : undefined;
  return (
    <div class={`hud${overlay.value === 'dialogue' ? ' talking' : ''}`}>
      <div class="xpbar"><div class="xpbar-fill" style={{ width: `${Math.round((100 * h.xp) / Math.max(1, h.xpNext))}%` }} /></div>
      <div class="hud-tl">
        <div class="hp">
          <Bar class="bar-hp" value={h.hp} max={h.maxHp} />
          <span class="hp-text">{Math.max(0, Math.ceil(h.hp))}/{h.maxHp}</span>
        </div>
        <div class="hud-row">
          <span class="flasks">
            {Array.from({ length: h.maxFlasks }, (_, i) => <Icon key={i} name="pickup-drop" class={i < h.flasks && !h.flaskBlocked ? '' : 'spent'} />)}
          </span>
          <span class="lvl">{t('hud.level', { level: h.level })}</span>
        </div>
        <div class="slots">
          {h.weapons.map((w, i) => (
            <span class={`slot weapon ${w.ready ? 'evolve' : ''}`} key={`w${i}`}>
              <Icon name={w.icon} />
              <Pips value={w.level} max={w.max} />
            </span>
          ))}
        </div>
        <div class="slots">
          {h.relics.map((r, i) => (
            <span class="slot relic" key={`r${i}`}>
              <Icon name={r.icon} />
              <Pips value={r.level} max={r.max} />
            </span>
          ))}
        </div>
      </div>
      <div class="hud-tr">
        {tuto ? <span class="vigil place">{t('hud.tutorial')}</span> : (
          <>
            <span class={`clock ${h.boss ? 'boss' : ''}`}>{h.boss ? t('hud.boss') : fmtTime(h.time)}</span>
            <span class="vigil">{t('hud.vigil', { vigil: roman(h.vigil) })}</span>
            <canvas class="minimap" id="minimap" width="48" height="48" />
          </>
        )}
        {h.fps > 0 ? <span class="fps">{h.fps} i/s</span> : null}
      </div>
      <div class="hud-bl">
        <Ring frac={h.dashFrac} icon="icon-dash" glyph="dash" count={h.dashMax > 1 ? h.dashCharges : undefined} />
        <Ring frac={h.skillFrac} icon={cls.skill.icon} glyph="skill" />
        <Ring frac={h.ultFrac} icon={cls.ultimate.icon} glyph="ultimate" active={h.ultActive} />
      </div>
      <div class="hud-br">
        <span class="currency"><Icon name="icon-gold" /> {fmt(h.gold)}</span>
        {tuto ? null : <span class="currency"><Icon name="icon-ashes" /> {fmt(h.ashes)}</span>}
      </div>
      {h.boss ? (
        <div class="bossbar">
          <span class="boss-name">{h.boss.name}</span>
          <div class="boss-track">
            <div class="boss-fill" style={{ width: `${Math.round(h.boss.frac * 1000) / 10}%` }} />
            {tuto ? null : <i class="boss-mark" style={{ left: '66%' }} />}
            {tuto ? null : <i class="boss-mark" style={{ left: '33%' }} />}
          </div>
        </div>
      ) : null}
      {tuto?.banner ? (
        <div class="lesson" key={tuto.banner}>
          {glyph ? <Btn g={glyph} /> : null}
          <span>{t(tuto.banner)}</span>
        </div>
      ) : null}
      {tuto?.bark ? (
        <div class="bark" key={tuto.bark}>
          <Portrait name="face-cream-neutral" size={32} />
          <span>{t(tuto.bark)}</span>
        </div>
      ) : null}
      {h.message ? <div class="banner">{h.message}</div> : null}
    </div>
  );
}

function cardTexts(card: Card): { name: string; tag: string; text: string; icon: string; linked: string | null; linkLabel: string } {
  const data = gameData();
  if (card.kind === 'weapon') {
    const def = data.weapons[card.def]!;
    const relic = data.relics[def.relic]!;
    return {
      name: t(`${def.id}.name`),
      tag: card.level === 1 ? `${t('levelup.weapon')} · ${t('levelup.new')}` : `${t('levelup.weapon')} · ${t('levelup.level', { level: card.level })}`,
      text: card.level === 1 ? t(`${def.id}.desc`) : t(`${def.id}.level.${card.level}`),
      icon: def.icon,
      linked: relic.icon,
      linkLabel: t('levelup.evolvesWith'),
    };
  }
  if (card.kind === 'relic') {
    const def = data.relics[card.def]!;
    const weapon = data.weapons[def.weapon]!;
    return {
      name: t(`${def.id}.name`),
      tag: card.level === 1 ? `${t('levelup.relic')} · ${t('levelup.new')}` : `${t('levelup.relic')} · ${t('levelup.level', { level: card.level })}`,
      text: t(`${def.id}.desc`),
      icon: def.icon,
      linked: weapon.icon,
      linkLabel: t('levelup.evolves'),
    };
  }
  if (card.kind === 'gold') {
    return { name: t('levelup.gold.name'), tag: '', text: t('levelup.gold.desc', { gold: data.tuning.gold.cardGold }), icon: 'icon-gold', linked: null, linkLabel: '' };
  }
  return {
    name: t('levelup.heal.name'), tag: '', text: t('levelup.heal.desc', { pct: Math.round(data.tuning.cardHealShare * 100) }),
    icon: 'icon-flask', linked: null, linkLabel: '',
  };
}

export function LevelUp(): JSX.Element | null {
  const ref = useFocusScope('levelup');
  const lu = levelUp.value;
  const focused = (): number => Number(document.querySelector('.levelup .is-focused')?.getAttribute('data-index') ?? 0);
  useHandlers({
    x: () => actions().reroll(),
    y: () => actions().banish(focused()),
  });
  if (!lu) return null;
  const data = gameData();
  return (
    <div class="backdrop levelup" ref={ref}>
      <h1 class="gold">{t('levelup.title', { level: lu.level })}</h1>
      <div class="cards">
        {lu.cards.map((card, i) => {
          const c = cardTexts(card);
          return (
            <button
              type="button" key={`${card.kind}-${card.def}-${i}`} class={`card card-${card.kind} ${card.evolves ? 'card-evolves' : ''}`}
              data-focus={`card${i}`} data-index={i} data-focus-default={i === 0 ? '' : undefined}
              onClick={() => actions().takeCard(i)}
            >
              <span class="card-icon"><Icon name={c.icon} /></span>
              <span class="card-name">{c.name}</span>
              <span class="card-tag">{c.tag}</span>
              <span class="card-text">{c.text}</span>
              {c.linked ? (
                <span class="card-link">
                  <span>{c.linkLabel}</span>
                  <Icon name={c.linked} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div class="skip-track"><div class="skip-fill" style={{ width: `${Math.round(lu.skipHold * 100)}%` }} /></div>
      <HelpBar
        items={[
          ['confirm', t('levelup.take')],
          lu.rerolls > 0 && ['x', t('levelup.reroll', { n: lu.rerolls })],
          lu.banishes > 0 && ['y', t('levelup.banish', { n: lu.banishes })],
          ['back', t('levelup.skip', { gold: data.tuning.gold.skipCard })],
        ]}
      />
    </div>
  );
}

export function ChestScreen(): JSX.Element | null {
  const ref = useFocusScope('chest');
  const c = chest.value;
  useHandlers({ back: () => actions().closeChest() });
  if (!c) return null;
  const data = gameData();
  const to = c.evolvedTo >= 0 ? data.weapons[c.evolvedTo]! : null;
  const from = c.evolvedFrom >= 0 ? data.weapons[c.evolvedFrom]! : null;
  return (
    <div class="backdrop chest" ref={ref}>
      <Panel class="chest-panel" active>
        <h1 class="gold">{t('chest.title')}</h1>
        <span class="chest-art"><Icon name="pickup-coffre" /></span>
        {to && from ? (
          <div class="evolution">
            <h2 class="gold">{t('chest.evolution')}</h2>
            <div class="evo-row">
              <span class="card-icon"><Icon name={from.icon} /></span>
              <span class="evo-arrow" />
              <span class="card-icon evo-new"><Icon name={to.icon} /></span>
            </div>
            <p>{t('chest.becomes', { from: t(`${from.id}.name`), to: t(`${to.id}.name`) })}</p>
            <p class="dim">{t(`${to.id}.desc`)}</p>
          </div>
        ) : c.freeLevel ? (
          <div class="evolution">
            <h2 class="gold">{t('chest.freeLevel')}</h2>
            <p>{t('chest.freeLevelDesc')}</p>
            <p class="dim">{t('chest.noEvolution')}</p>
          </div>
        ) : <p class="dim">{t('chest.noEvolution')}</p>}
        <p><Icon name="icon-gold" /> {t('chest.gold', { gold: c.gold })}</p>
        <MenuButton id="ok" label={t('ui.continue')} onPress={() => actions().closeChest()} default />
      </Panel>
    </div>
  );
}

/** Un braséro allumé : une arme prête à choisir, qui évolue et consomme le braséro. B le laisse pour plus tard. */
export function ForgeScreen(): JSX.Element | null {
  const ref = useFocusScope('forge');
  const choices = forgeState.value;
  useHandlers({ back: () => actions().closeForge() });
  if (!choices) return null;
  const data = gameData();
  return (
    <div class="backdrop levelup forge" ref={ref}>
      <h1 class="gold">{t('forge.title')}</h1>
      <p class="dim">{t('forge.hint')}</p>
      <div class="cards">
        {choices.map((c, i) => {
          const from = data.weapons[c.from]!;
          const to = data.weapons[c.to]!;
          return (
            <button
              type="button" key={`${from.id}-${i}`} class="card card-weapon" data-focus={`evo${i}`} data-index={i}
              data-focus-default={i === 0 ? '' : undefined} onClick={() => actions().takeEvolution(i)}
            >
              <span class="card-icon"><Icon name={to.icon} /></span>
              <span class="card-name">{t(`${to.id}.name`)}</span>
              <span class="card-tag">{t('forge.from', { from: t(`${from.id}.name`) })}</span>
              <span class="card-text">{t(`${to.id}.desc`)}</span>
            </button>
          );
        })}
      </div>
      <MenuButton id="later" label={t('forge.later')} onPress={() => actions().closeForge()} />
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('forge.take')], ['back', t('forge.later')]]} />
    </div>
  );
}

/** Un pourcentage de Lueur, arrondi. */
const glowPct = (share: number): number => Math.round(share * 100);

/**
 * Le totem chargé : trois Flammes. X nourrit la carte au focus (elle monte d'une rareté, et coûtera de la
 * Lueur), Y reprend un cran ; rien n'est payé avant de prendre. Pas de retour possible.
 */
export function TotemScreen(): JSX.Element | null {
  const ref = useFocusScope('totem');
  const state = totemState.value;
  const focus = focusedId.value;
  const index = focus?.startsWith('flame') ? Number(focus.slice(5)) : 0;
  useHandlers({
    x: () => actions().feedFlame(index),
    y: () => actions().unfeedFlame(index),
  });
  if (!state) return null;
  const data = gameData();
  const current = state.cards[index] ?? state.cards[0];
  return (
    <div class="backdrop levelup totem" ref={ref}>
      <h1 class="gold">{t('totem.title')}</h1>
      <p class="totem-glow">
        <Icon name="sign-glow" />{' '}
        {current && current.cost > 0
          ? t('totem.glowAfter', { from: glowPct(state.glow), to: glowPct(current.glowAfter) })
          : t('totem.glow', { glow: glowPct(state.glow) })}
      </p>
      <div class="cards">
        {state.cards.map((c, i) => {
          const def = data.flames.lines[c.line]!;
          const rarity = RARITIES[c.rarity]!;
          return (
            <button
              type="button" key={`${def.id}-${i}`} class={`card card-flame rarity-${c.rarity}`} data-focus={`flame${i}`} data-index={i}
              data-rarity={rarity} data-focus-default={i === 0 ? '' : undefined} onClick={() => actions().takeFlame(i)}
            >
              <span class="card-icon"><Icon name={def.icon} /></span>
              <span class="card-name">{t(`${def.id}.name`)}</span>
              <span class="card-tag">{t(`rarity.${rarity}`)}</span>
              <span class="card-text">{t(`${def.id}.${rarity}`)}</span>
              <span class="rarity-ladder">
                {def.tiers.map((tier, r) => (tier ? (
                  <span
                    key={r} title={t(`rarity.${RARITIES[r]}`)}
                    class={`rung rarity-${r}${r === c.rarity ? ' on' : ''}${r > state.open ? ' locked' : ''}`}
                  />
                ) : null))}
              </span>
              <span class={`card-price${c.cost > 0 ? ' paid' : ''}`}>
                {c.cost > 0 ? t('totem.cost', { points: c.cost }) : t('totem.free')}
              </span>
              {i === index && c.block && c.block !== 'top' ? <span class="card-block">{t(`totem.block.${c.block}`)}</span> : null}
            </button>
          );
        })}
      </div>
      <HelpBar
        items={[
          ['nav', t('ui.move')],
          ['confirm', t('totem.take')],
          current && current.block === null && ['x', t('totem.feed', { points: current.feedCost })],
          current && current.canUnfeed && ['y', t('totem.unfeed', { points: current.unfeedGain })],
        ]}
      />
    </div>
  );
}

/** La boutique d'un marchand : acheter ne ferme pas, B ferme. */
export function ShopScreen(): JSX.Element | null {
  const shop = shopState.value;
  // Un focus mémorisé par sorte de marchand : celui du Ferrailleur ne suit pas chez l'Herboriste.
  const ref = useFocusScope(`shop-${shop?.kind ?? 'none'}`);
  useHandlers({ back: () => actions().closeShop() });
  if (!shop) return null;
  const data = gameData();
  return (
    <div class="backdrop levelup shop" ref={ref}>
      <h1 class="gold">{t(`shop.${shop.kind}.title`)}</h1>
      <p class="shop-gold"><Icon name="icon-gold" /> {t('shop.gold', { gold: fmt(shop.gold) })}</p>
      {shop.items.length === 0 ? <p class="dim">{t('shop.empty')}</p> : null}
      <div class="cards">
        {shop.items.map((item, i) => {
          const service = item.card ? null : (['flask', 'balm', 'reroll', 'banish'] as const)[item.service]!;
          const c = item.card
            ? cardTexts(item.card)
            : { name: t(`service.${service}.name`), tag: '', text: t(`service.${service}.desc`), icon: `icon-service-${service}` };
          const kind = item.card ? item.card.kind : 'service';
          return (
            <button
              type="button" key={`item${i}`} class={`card card-${kind} ${item.can ? '' : 'card-off'}`} data-focus={`item${i}`} data-index={i}
              data-focus-default={i === 0 ? '' : undefined} onClick={() => actions().buy(i)}
            >
              <span class="card-icon"><Icon name={c.icon} /></span>
              <span class="card-name">{c.name}</span>
              <span class="card-tag">{c.tag}</span>
              <span class="card-text">{c.text}</span>
              <span class="card-price"><Icon name="icon-gold" /> {t('shop.price', { price: fmt(item.price) })}</span>
            </button>
          );
        })}
      </div>
      <MenuButton id="leave" label={t('shop.leave')} onPress={() => actions().closeShop()} default={shop.items.length === 0} />
      <HelpBar items={[['nav', t('ui.move')], shop.items.length > 0 && ['confirm', t('shop.buy')], ['back', t('shop.leave')]]} />
    </div>
  );
}

/** La trouvaille d'un trésor ou d'une cache. */
export function FindScreen(): JSX.Element | null {
  const ref = useFocusScope('find');
  const f = findState.value;
  useHandlers({ back: () => actions().closeFind() });
  if (!f) return null;
  const def = f.find >= 0 ? gameData().finds[f.find]! : null;
  return (
    <div class="backdrop chest find" ref={ref}>
      <Panel class="chest-panel" active>
        <h1 class="gold">{t('find.title')}</h1>
        <span class="card-icon find-icon"><Icon name={def ? def.icon : 'icon-gold'} /></span>
        <h2 class="gold">{def ? t(`${def.id}.name`) : t('find.empty.name')}</h2>
        <p>{def ? t(`${def.id}.desc`) : t('find.empty.desc', { gold: f.gold })}</p>
        <MenuButton id="ok" label={t('find.close')} onPress={() => actions().closeFind()} default />
      </Panel>
    </div>
  );
}

export function PauseScreen(): JSX.Element {
  const ref = useFocusScope('pause');
  const [view, setView] = useState<'menu' | 'settings' | 'abandon' | 'skip'>('menu');
  const tuto = tutoHud.value !== null;
  useHandlers({
    back: () => {
      if (view === 'menu') actions().pause(false);
    },
    pause: () => {
      if (view === 'menu') actions().pause(false);
    },
  });
  const h = hud.value;
  const stats = pauseStats.value;
  const data = gameData();
  const extras = runExtras.value;
  if (view === 'settings') return <SettingsScreen inRun onClose={() => setView('menu')} />;
  return (
    <div class="backdrop pause" ref={ref}>
      <Panel class="pause-panel" active>
        <h1>{pauseReason.value ?? t('pause.title')}</h1>
        <div class="pause-cols">
          <div class="pause-menu">
            <MenuButton id="resume" label={t('pause.resume')} onPress={() => actions().pause(false)} default />
            <MenuButton id="settings" label={t('ui.settings')} onPress={() => setView('settings')} />
            {/* On ne perd pas le tutoriel : pas d'abandon, mais on peut le passer. */}
            {tuto
              ? <MenuButton id="skip-tutorial" label={t('pause.skipTutorial')} onPress={() => setView('skip')} />
              : <MenuButton id="abandon" label={t('pause.abandon')} onPress={() => setView('abandon')} danger />}
          </div>
          <div class="pause-info">
            <h2>{t('pause.build')}</h2>
            <div class="slots">
              {h?.weapons.map((w, i) => <span class="slot weapon" key={i}><Icon name={w.icon} /><Pips value={w.level} max={w.max} /></span>)}
            </div>
            <div class="slots">
              {h?.relics.map((r, i) => <span class="slot relic" key={i}><Icon name={r.icon} /><Pips value={r.level} max={r.max} /></span>)}
            </div>
            {extras.flames.length + extras.finds.length > 0 ? (
              <div class="slots extras" title={t('pause.boons')}>
                {extras.flames.map((f) => {
                  const def = data.flames.lines[f.line]!;
                  return (
                    <span class={`slot flame rarity-${f.rarity}`} key={def.id} title={`${t(`${def.id}.name`)} · ${t(`rarity.${RARITIES[f.rarity]}`)}`}>
                      <Icon name={def.icon} />
                    </span>
                  );
                })}
                {extras.finds.map((f, i) => <span class="slot find" key={`f${i}`}><Icon name={data.finds[f]!.icon} /></span>)}
              </div>
            ) : null}
            {extras.lantern.length > 0 || extras.piece ? (
              <div class="slots lantern-slots" title={t('lantern.title')}>
                {extras.lantern.map((p) => {
                  const piece = data.lantern.pieces.find((x) => x.id === p.id)!;
                  return (
                    <span class={`slot lantern-slot${piece.kind === 'rune' && p.level === 0 ? ' off' : ''}`} key={p.id}>
                      <Icon name={piece.icon} />
                      {piece.kind === 'rune' ? <Pips value={p.level} max={3} /> : null}
                    </span>
                  );
                })}
                {extras.piece ? (
                  <span class="lantern-found"><Icon name="pickup-lantern-piece" /> {t('hud.piece', { name: t(`${extras.piece}.name`) })}</span>
                ) : null}
              </div>
            ) : null}
            {stats ? (
              <div class="stats">
                <p><span>{t('stat.maxHp')}</span><b>{stats.maxHp}</b></p>
                <p><span>{t('stat.power')}</span><b>+{Math.round(stats.power * 100)} %</b></p>
                <p><span>{t('stat.cadence')}</span><b>+{Math.round(stats.cadence * 100)} %</b></p>
                <p><span>{t('stat.zone')}</span><b>+{Math.round(stats.zone * 100)} %</b></p>
                <p><span>{t('stat.duration')}</span><b>+{Math.round(stats.duration * 100)} %</b></p>
                <p><span>{t('stat.critChance')}</span><b>{(stats.critChance * 100).toFixed(1).replace('.', ',')} %</b></p>
                <p><span>{t('stat.armor')}</span><b>{stats.armor.toFixed(1).replace('.', ',')}</b></p>
                <p><span>{t('stat.speed')}</span><b>{Math.round(stats.speed)} px/s</b></p>
                <p><span>{t('stat.glow')}</span><b>{Math.round(stats.glow)} px · {glowPct(extras.glow)} %</b></p>
                <p><span>{t('stat.str')} · {t('stat.agi')} · {t('stat.spi')}</span><b>{stats.attrs.str} · {stats.attrs.agi} · {stats.attrs.spi}</b></p>
                <p><span>{t('stat.vig')} · {t('stat.luck')}</span><b>{stats.attrs.vig} · {stats.attrs.luck}</b></p>
              </div>
            ) : null}
            <p class="dim">{t(`${data.classes['class.ash-blade']!.skill.id}.name`)} : {t(`${data.classes['class.ash-blade']!.skill.id}.desc`)}</p>
          </div>
        </div>
      </Panel>
      <HelpBar items={[['nav', t('ui.move')], ['confirm', t('ui.confirm')], ['back', t('pause.resume')]]} />
      {view === 'abandon' ? (
        <ConfirmDialog text={t('pause.abandon.confirm')} yes={t('pause.abandon')} onYes={() => actions().abandon()} onNo={() => setView('menu')} />
      ) : null}
      {view === 'skip' ? (
        <ConfirmDialog
          text={t('pause.skipTutorial.confirm')} yes={t('pause.skipTutorial')} onYes={() => actions().skipTutorial()} onNo={() => setView('menu')}
        />
      ) : null}
    </div>
  );
}
