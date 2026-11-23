/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Tout le hasard du jeu passe par lui : une graine rejoue une partie.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** État interne, pour un instantané de partie. */
  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }

  /** Entier non signé sur 32 bits. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Flottant dans [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** Flottant dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Entier dans [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Entier dans [min, max], bornes comprises. */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** Vrai avec la probabilité p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Un élément au hasard. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }

  /** Indice tiré selon des poids positifs. Renvoie -1 si tous les poids sont nuls. */
  weighted(weights: ArrayLike<number>, count: number = weights.length): number {
    let total = 0;
    for (let i = 0; i < count; i++) total += weights[i] as number;
    if (total <= 0) return -1;
    let r = this.float() * total;
    for (let i = 0; i < count; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return count - 1;
  }

  /** Mélange en place (Fisher-Yates). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}

/** Dérive une graine secondaire d'une graine et d'un numéro de flux. */
export function deriveSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Transforme un texte (une graine saisie) en graine numérique. */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
