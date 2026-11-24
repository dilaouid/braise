import { signal } from '@preact/signals';
import type { JSX } from 'preact';

/** L'atlas du jeu, lu sans Pixi : `atlas.json` (nom → rectangle) et `atlas.png`. */
interface AtlasJson {
  width: number;
  height: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

export const atlas = signal<AtlasJson | null>(null);
export const ATLAS_URL = '/atlas/atlas.png';

export async function loadAtlas(): Promise<void> {
  try {
    atlas.value = (await (await fetch('/atlas/atlas.json')).json()) as AtlasJson;
  } catch {
    atlas.value = null;
  }
}

/** Le sprite de Moon ou de Cream dans une pose, ou au repos sans pose. */
export function poseSprite(who: 'moon' | 'cream', pose: string): string {
  if (who === 'moon') return pose ? `hero-lame-cendre-pose-${pose}` : 'hero-lame-cendre-idle-1#0';
  return pose ? `cream-pose-${pose}` : 'cream-sit';
}

/**
 * Une image de l'atlas, agrandie au pixel près. `size` est la hauteur voulue en pixels d'écran ;
 * la classe `portrait` du jeu donne le rendu net.
 */
export function AtlasImage({ name, size, label }: { name: string; size: number; label?: string }): JSX.Element {
  const a = atlas.value;
  const r = a?.frames[name];
  if (!a || !r) return <span class="portrait portrait-missing ed-thumb" style={{ width: `${size}px`, height: `${size}px` }} title={label ?? name} />;
  const k = size / r.h;
  return (
    <span
      class="portrait ed-thumb"
      role="img"
      aria-label={label ?? name}
      style={{
        width: `${r.w * k}px`,
        height: `${size}px`,
        backgroundImage: `url(${ATLAS_URL})`,
        backgroundPosition: `-${r.x * k}px -${r.y * k}px`,
        backgroundSize: `${a.width * k}px ${a.height * k}px`,
      }}
    />
  );
}
