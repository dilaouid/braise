import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AtlasImage } from './atlas.tsx';

export interface PickerOption {
  value: string;
  label: string;
  /** Nom de l'image de l'atlas montrée en vignette, ou rien. */
  image: string | null;
}

let uid = 0;

/**
 * Un menu déroulant qui montre la vignette de chaque choix (un `<select>` ne sait pas montrer d'image).
 * Souris : clic. Clavier : Entrée, Espace ou flèche bas l'ouvre ; flèches, Début, Fin, Entrée, Échap.
 */
export function ImagePicker(props: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  size?: number;
  class?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useRef(`picker-${++uid}`).current;
  const size = props.size ?? 28;
  const currentIndex = Math.max(0, props.options.findIndex((o) => o.value === props.value));
  const current = props.options[currentIndex];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: MouseEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`#${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = (): void => {
    setActive(currentIndex);
    setOpen(true);
  };
  const choose = (i: number): void => {
    const o = props.options[i];
    setOpen(false);
    button.current?.focus();
    if (o && o.value !== props.value) props.onChange(o.value);
  };
  const onListKey = (e: KeyboardEvent): void => {
    const n = props.options.length;
    if (e.key === 'ArrowDown') setActive((a) => Math.min(n - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div class={`ed-picker ${props.class ?? ''}`} ref={root}>
      <button
        type="button"
        ref={button}
        class="ed-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${props.label} : ${current?.label ?? '—'}`}
        title={props.label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        {current?.image ? <AtlasImage name={current.image} size={size} label={current.label} /> : <span class="ed-thumb-empty" style={{ width: `${size}px`, height: `${size}px` }} />}
        <span class="ed-picker-label">{current?.label ?? '—'}</span>
        <span class="ed-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul
          class="ed-picker-list"
          role="listbox"
          ref={list}
          tabIndex={-1}
          aria-label={props.label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {props.options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === props.value}
              class={`ed-picker-option${i === active ? ' active' : ''}${o.value === props.value ? ' chosen' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.image ? <AtlasImage name={o.image} size={size + 8} label={o.label} /> : <span class="ed-thumb-empty" style={{ width: `${size + 8}px`, height: `${size + 8}px` }} />}
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
