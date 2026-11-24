import type { JSX } from 'preact';
import type { CampObject } from '../content/index.ts';
import { canBuyAltarRank } from '../meta/altar.ts';
import { heroXpForNext } from '../meta/hero.ts';
import { lanternNews } from '../meta/lantern.ts';
import { newHero } from '../meta/save.ts';
import { Bar, Btn, useFocusScope, useHandlers } from './parts.tsx';
import { Currencies } from './screens.tsx';
import { actions, campVisible, device, gameData, overlay, save, saveRev, t } from './store.ts';

const CLASS = 'class.ash-blade';

/** Ce qu'ouvre chaque objet du refuge. */
function openObject(id: string): void {
  if (id === 'cream') actions().creamTalk();
  else if (id === 'door' || id === 'altar' || id === 'lantern' || id === 'memories') actions().goto(id);
}

/** Un objet du refuge : un bouton transparent posé sur son image, avec son nom quand Moon est à côté. */
function ObjectButton({ o, badge }: { o: CampObject; badge: boolean }): JSX.Element {
  const [w, h] = o.box;
  return (
    <button
      type="button" class="camp-object" data-focus={o.id} aria-label={t(`camp.object.${o.id}`)}
      style={{ left: `${o.x - w / 2}px`, top: `${o.y - h + 4}px`, width: `${w}px`, height: `${h}px` }}
      onClick={() => openObject(o.id)}
    >
      {badge ? <span class="badge" /> : null}
      <span class="camp-tag"><Btn g="confirm" /> {t(`camp.object.${o.id}`)}</span>
    </button>
  );
}

/** Le refuge : pas de menu, Moon marche et ouvre ce qui est près de lui. */
export function CampScreen(): JSX.Element {
  const ref = useFocusScope('', true);
  saveRev.value;
  const s = save.value!;
  const data = gameData();
  const hero = s.heroes[CLASS] ?? newHero();
  const next = heroXpForNext(hero.level, data.heroTuning);
  const talking = overlay.value === 'dialogue';
  useHandlers({
    // Échap ouvre les réglages ; B, à la manette, ne fait rien.
    back: () => {
      if (device.value === 'keyboard') actions().goto('settings');
    },
    pause: () => actions().goto('settings'),
    tabPrev: () => actions().campJump(-1),
    tabNext: () => actions().campJump(1),
    // Le stick et les flèches font marcher Moon : ils ne déplacent pas le focus.
    nav: () => true,
  });
  const badges: Record<string, boolean> = {
    altar: data.altar.some((b) => canBuyAltarRank(s, data, b.id) === null),
    lantern: lanternNews(data, s.account.lantern),
  };
  const visible = campVisible(data, s);
  return (
    <div class={`screen camp${talking ? ' talking' : ''}`} ref={ref}>
      {data.camp.objects.filter((o) => o.reach > 0 && visible.has(o.id)).map((o) => <ObjectButton key={o.id} o={o} badge={badges[o.id] === true} />)}
      <div class="camp-hero">
        <span>{t('hud.level', { level: hero.level })}</span>
        <Bar class="bar-xp" value={hero.xp} max={next} />
      </div>
      <div class="camp-purse"><Currencies /></div>
      <button type="button" class="camp-settings" onClick={() => actions().goto('settings')}><Btn g="start" /> {t('ui.settings')}</button>
    </div>
  );
}
