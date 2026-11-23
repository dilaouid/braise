import { Assets, Rectangle, Texture, TextureSource } from 'pixi.js';

interface AtlasJson {
  width: number;
  height: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  anims: Record<string, number>;
}

/** L'atlas de sprites : une texture, et une version « silhouette blanche » pour le flash des coups. */
export class Atlas {
  private readonly textures = new Map<string, Texture>();
  private readonly white = new Map<string, Texture>();
  private readonly animCache = new Map<string, Texture[]>();
  private readonly whiteAnimCache = new Map<string, Texture[]>();

  private constructor(private readonly json: AtlasJson, source: TextureSource, whiteSource: TextureSource) {
    for (const [name, f] of Object.entries(json.frames)) {
      const frame = new Rectangle(f.x, f.y, f.w, f.h);
      this.textures.set(name, new Texture({ source, frame }));
      this.white.set(name, new Texture({ source: whiteSource, frame }));
    }
  }

  /** Charge l'atlas depuis `public/atlas/`. */
  static async load(base: string): Promise<Atlas> {
    const json = (await (await fetch(`${base}atlas/atlas.json`)).json()) as AtlasJson;
    const texture = (await Assets.load(`${base}atlas/atlas.png`)) as Texture;
    texture.source.scaleMode = 'nearest';
    // La version blanche : tous les pixels opaques deviennent blancs.
    const image = texture.source.resource as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = json.width;
    canvas.height = json.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3]! > 0) {
        data.data[i] = 255;
        data.data[i + 1] = 255;
        data.data[i + 2] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    const whiteSource = Texture.from(canvas).source;
    whiteSource.scaleMode = 'nearest';
    return new Atlas(json, texture.source, whiteSource);
  }

  has(name: string): boolean {
    return this.textures.has(name);
  }

  /** La texture d'une image. Une image inconnue donne une texture vide, jamais une erreur en jeu. */
  get(name: string): Texture {
    const t = this.textures.get(name);
    if (!t) {
      if (!this.missing.has(name)) {
        this.missing.add(name);
        console.warn(`Atlas : image inconnue « ${name} »`);
      }
      return Texture.EMPTY;
    }
    return t;
  }

  private readonly missing = new Set<string>();

  /** Les images d'une animation (une seule si le sprite n'est pas animé). */
  anim(name: string): Texture[] {
    let list = this.animCache.get(name);
    if (!list) {
      list = this.build(name, this.textures);
      this.animCache.set(name, list);
    }
    return list;
  }

  /** Les mêmes images, en silhouette blanche. */
  whiteAnim(name: string): Texture[] {
    let list = this.whiteAnimCache.get(name);
    if (!list) {
      list = this.build(name, this.white);
      this.whiteAnimCache.set(name, list);
    }
    return list;
  }

  private build(name: string, from: Map<string, Texture>): Texture[] {
    const n = this.json.anims[name];
    if (!n) return [from.get(name) ?? Texture.EMPTY];
    const list: Texture[] = [];
    for (let i = 0; i < n; i++) list.push(from.get(`${name}#${i}`) ?? Texture.EMPTY);
    return list;
  }

  /** Le rectangle d'une image dans l'atlas, pour les icônes de l'interface (CSS). */
  rect(name: string): { x: number; y: number; w: number; h: number } | null {
    return this.json.frames[name] ?? null;
  }

  get size(): { width: number; height: number } {
    return { width: this.json.width, height: this.json.height };
  }
}
