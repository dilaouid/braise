import type { JSX } from 'preact';
import { DialogueBox } from './dialogue.tsx';
import { ChestScreen, FindScreen, Hud, LevelUp, PauseScreen, ShopScreen, TotemScreen } from './run.tsx';
import { Altar, Camp, CinematicScreen, EndScreen, Memories, SettingsScreen, Title } from './screens.tsx';
import { actions, overlay, screen } from './store.ts';

/** La racine de l'interface : un écran, et au plus un calque par-dessus. */
export function App(): JSX.Element {
  const s = screen.value;
  const o = overlay.value;
  return (
    <>
      {s === 'title' ? <Title /> : null}
      {s === 'cinematic' ? <CinematicScreen /> : null}
      {s === 'camp' ? <Camp /> : null}
      {s === 'memories' ? <Memories /> : null}
      {s === 'altar' ? <Altar /> : null}
      {s === 'settings' ? <SettingsScreen onClose={() => actions().goto('camp')} /> : null}
      {s === 'run' ? <Hud /> : null}
      {s === 'run' && o === 'levelup' ? <LevelUp /> : null}
      {s === 'run' && o === 'chest' ? <ChestScreen /> : null}
      {s === 'run' && o === 'totem' ? <TotemScreen /> : null}
      {s === 'run' && o === 'shop' ? <ShopScreen /> : null}
      {s === 'run' && o === 'find' ? <FindScreen /> : null}
      {s === 'run' && o === 'pause' ? <PauseScreen /> : null}
      {(s === 'run' || s === 'camp') && o === 'dialogue' ? <DialogueBox /> : null}
      {s === 'end' ? <EndScreen /> : null}
      {s === 'boot' ? <div class="screen boot">…</div> : null}
    </>
  );
}
