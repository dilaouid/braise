import { Texture } from 'pixi.js';

/** Matrice de Bayer 4 × 4, pour un tramage ordonné. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const cache = new Map<number, Texture>();

/**
 * Un disque de lumière à bord tramé sur trois anneaux (document 10 §6) : pas de dégradé lisse.
 * Dessiné « en soustraction » dans la couche sombre.
 */
export function lightDisc(radius: number): Texture {
  const r = Math.max(4, Math.round(radius / 2) * 2);
  const cached = cache.get(r);
  if (cached) return cached;
  const size = r * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      let level = 0;
      if (d < 0.7) level = 16;
      else if (d < 0.8) level = 12;
      else if (d < 0.9) level = 8;
      else if (d < 1) level = 4;
      const on = level > BAYER[(y & 3) * 4 + (x & 3)]!;
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = on ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  cache.set(r, texture);
  return texture;
}
