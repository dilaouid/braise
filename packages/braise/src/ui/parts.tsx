import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { device, refs, t, type Handlers } from './store.ts';

/** Gestion du focus, posée par `app`. */
export const focusRef: {
  setScope: ((el: HTMLElement | null, key: string) => void) | null;
  stack: Array<{ el: HTMLElement; key: string }>;
} = { setScope: null, stack: [] };

/**
 * Restreint le focus à cet écran tant qu'il est affiché. À sa fermeture, le focus
 * revient à l'écran du dessous, là où il était.
 */
export function useFocusScope(key: string): { current: HTMLDivElement | null } {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry = { el, key };
    focusRef.stack.push(entry);
    focusRef.setScope?.(el, key);
    return () => {
      const i = focusRef.stack.indexOf(entry);
      if (i >= 0) focusRef.stack.splice(i, 1);
      const top = focusRef.stack[focusRef.stack.length - 1];
      focusRef.setScope?.(top ? top.el : null, top ? top.key : '');
    };
  }, [key]);
  return ref;
}

/** Déclare les boutons qui font quelque chose sur cet écran. */
export function useHandlers(handlers: Handlers): void {
  const live = useRef(handlers);
  live.current = handlers;
  useEffect(() => {
    const proxy: Handlers = {
      back: () => live.current.back?.(),
      x: () => live.current.x?.(),
      y: () => live.current.y?.(),
      pause: () => live.current.pause?.(),
      tabPrev: () => live.current.tabPrev?.(),
      tabNext: () => live.current.tabNext?.(),
      nav: (dx, dy) => live.current.nav?.(dx, dy) ?? false,
    };
    refs.handlers.push(proxy);
    return () => {
      const i = refs.handlers.indexOf(proxy);
      if (i >= 0) refs.handlers.splice(i, 1);
    };
  }, []);
}

/** Une icône de l'atlas, à sa taille native (une seule densité de pixels). */
export function Icon({ name, class: cls }: { name: string; class?: string }): JSX.Element | null {
  const atlas = refs.atlas;
  const rect = atlas?.rect(name);
  if (!atlas || !rect) return <span class={`icon icon-missing ${cls ?? ''}`} />;
  return (
    <span
      class={`icon ${cls ?? ''}`}
      style={{
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        backgroundImage: `url(${refs.atlasUrl})`,
        backgroundPosition: `-${rect.x}px -${rect.y}px`,
        backgroundSize: `${atlas.size.width}px ${atlas.size.height}px`,
      }}
    />
  );
}

export type Glyph = 'confirm' | 'back' | 'x' | 'y' | 'lb' | 'rb' | 'start' | 'dash' | 'skill' | 'ultimate' | 'flask' | 'move' | 'nav';

const PAD_GLYPH: Record<Glyph, string> = {
  confirm: 'A', back: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', start: 'Start', dash: 'A', skill: 'X', ultimate: 'Y', flask: 'LB', move: 'L', nav: '✥',
};
const KEY_GLYPH: Record<Glyph, string> = {
  confirm: 'Entrée', back: 'Échap', x: 'X', y: 'C', lb: 'A', rb: 'E', start: 'Échap', dash: 'Espace', skill: 'E', ultimate: 'R', flask: 'F', move: 'ZQSD', nav: 'Flèches',
};

/** L'invite d'un bouton : elle suit le dernier périphérique utilisé. */
export function Btn({ g }: { g: Glyph }): JSX.Element {
  const pad = device.value === 'gamepad';
  const label = pad ? PAD_GLYPH[g] : KEY_GLYPH[g];
  const round = pad && label.length === 1;
  return <span class={`glyph ${round ? 'glyph-round' : pad ? 'glyph-pill' : 'glyph-key'} glyph-${g}`}>{label === '✥' ? '+' : label}</span>;
}

/** La barre d'aide : les boutons utilisables ici, avec leur icône et un mot. */
export function HelpBar({ items }: { items: Array<[Glyph, string] | null | false> }): JSX.Element {
  return (
    <div class="helpbar">
      {items.filter(Boolean).map((it) => {
        const [g, label] = it as [Glyph, string];
        return (
          <span class="help" key={g + label}>
            <Btn g={g} /> {label}
          </span>
        );
      })}
    </div>
  );
}

export function Panel(props: { class?: string; children: ComponentChildren; active?: boolean }): JSX.Element {
  return <div class={`panel ${props.active ? 'panel-active' : ''} ${props.class ?? ''}`}>{props.children}</div>;
}

/** Une barre de progression en pixels. */
export function Bar({ value, max, class: cls }: { value: number; max: number; class?: string }): JSX.Element {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div class={`bar ${cls ?? ''}`}>
      <div class="bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
    </div>
  );
}

/** Des petits points : le niveau d'une arme, le rang d'un boost. */
export function Pips({ value, max }: { value: number; max: number }): JSX.Element {
  const pips = [];
  for (let i = 0; i < max; i++) pips.push(<i key={i} class={i < value ? 'pip on' : 'pip'} />);
  return <span class="pips">{pips}</span>;
}

/** Un bouton de menu focalisable. */
export function MenuButton(props: {
  id: string;
  label: string;
  desc?: string;
  icon?: string;
  onPress: () => void;
  default?: boolean;
  disabled?: boolean;
  hold?: boolean;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`menu-button ${props.danger ? 'danger' : ''}`}
      data-focus={props.id}
      data-focus-default={props.default ? '' : undefined}
      data-hold={props.hold ? '' : undefined}
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {props.icon ? <Icon name={props.icon} /> : null}
      <span class="menu-text">
        <span class="menu-label">{props.label}</span>
        {props.desc ? <span class="menu-desc">{props.desc}</span> : null}
      </span>
    </button>
  );
}

/** Une boîte de confirmation : le focus est sur « Annuler ». */
export function ConfirmDialog({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }): JSX.Element {
  const ref = useFocusScope('confirm');
  useHandlers({ back: onNo });
  return (
    <div class="backdrop" ref={ref}>
      <Panel class="dialog" active>
        <p>{text}</p>
        <div class="row">
          <MenuButton id="no" label={t('ui.cancel')} onPress={onNo} default />
          <MenuButton id="yes" label={yes} onPress={onYes} danger />
        </div>
      </Panel>
    </div>
  );
}
