import type { JSX } from 'preact';
import type { Chip } from './effects.ts';
import { Icon } from './parts.tsx';

/** Des pastilles d'effets, en images et en nombres. */
export function Chips({ chips }: { chips: Chip[] }): JSX.Element {
  return (
    <span class="chips">
      {chips.map((chip, i) => (
        <span key={i} class={`chip ${chip.kind}${chip.cleared ? ' cleared' : ''}`}>
          {chip.parts.map((part, k) => ('icon' in part
            ? <span key={k} class={part.cross ? 'crossed' : ''}><Icon name={part.icon} /></span>
            : <b key={k}>{part.text}</b>))}
        </span>
      ))}
    </span>
  );
}
