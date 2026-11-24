import { Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { assetFrames, type CineLayer, type CineShot, type Cinematic } from '../content/cinematic.ts';
import { lightDisc } from './light.ts';
import { VIEW_H, VIEW_W } from './renderer.ts';

/**
 * Le lecteur de cinématique (document 15) : des tableaux animés plan par plan, d'après
 * content/cinematics/<id>.json. Il dessine dans son propre conteneur et ne touche pas au jeu.
 * Le son, les cartons de texte et la fin passent par `CineHooks` : le rendu ne connaît ni
 * l'audio ni l'interface.
 *
 * Règles de temps des calques :
 * - image, fumée, yeux : visibles entre `start` et `end` (par défaut, tout le plan) ;
 * - remplissage et lumière : `start` → `end` est la durée de leur variation ; ils restent ensuite.
 */

export interface CineHooks {
  sfx(name: string, volume: number): void;
  music(name: string): void;
  stopMusic(): void;
  musicRate(to: number, overSeconds: number): void;
  /** Le carton de texte du plan (une clé de fr.json), ou null. */
  card(key: string | null): void;
  /** La ligne de récit à afficher (une clé de fr.json), ou null. */
  caption(key: string | null): void;
}

const NIGHT = 0x0b0f1a;
const EMBER = 0xfb7a0c;
const EMBER_PALE = 0xffd166;
const DANGER = 0xff3d81;
const COLD_TINT = 0xc9d1dc;

interface Particle { sprite: Sprite; x: number; y: number; phase: number; size: number }

interface Node {
  layer: CineLayer;
  sprite?: Sprite;
  grey?: Sprite;
  mask?: Graphics;
  particles?: Particle[];
  glow?: Sprite;
  core?: Sprite;
  eyes?: Graphics;
  eyeSpots?: Array<[number, number]>;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const hex = (h: string): number => parseInt(h.slice(1), 16);

/** Un hasard reproductible : la même cinématique se rejoue à l'identique. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class CinematicPlayer {
  readonly root = new Container();
  private readonly camera = new Container();
  private readonly fade: Sprite;
  private readonly frames = new Map<string, Texture[]>();
  private readonly urls: string[] = [];
  private nodes: Node[] = [];
  private shotIndex = -1;
  private shotTime = 0;
  private cueIndex = 0;
  private finishedFlag = false;
  private captionKey: string | null = null;

  private constructor(private readonly def: Cinematic, private readonly hooks: CineHooks) {
    const back = new Sprite(Texture.WHITE);
    back.width = VIEW_W;
    back.height = VIEW_H;
    back.tint = NIGHT;
    this.fade = new Sprite(Texture.WHITE);
    this.fade.width = VIEW_W;
    this.fade.height = VIEW_H;
    this.fade.tint = NIGHT;
    this.root.addChild(back, this.camera, this.fade);
  }

  /** Charge les images de la cinématique (public/cinematics/<id>/) et prépare le lecteur. */
  static async load(def: Cinematic, base: string, hooks: CineHooks): Promise<CinematicPlayer> {
    const player = new CinematicPlayer(def, hooks);
    await Promise.all(
      Object.keys(def.assets).map(async (name) => {
        const url = `${base}cinematics/${def.id}/${name}.png`;
        player.urls.push(url);
        const tex = await Assets.load<Texture>(url);
        tex.source.scaleMode = 'nearest';
        const n = assetFrames(def, name);
        const w = tex.width / n;
        const list: Texture[] = [];
        for (let i = 0; i < n; i++) list.push(n === 1 ? tex : new Texture({ source: tex.source, frame: new Rectangle(i * w, 0, w, tex.height) }));
        player.frames.set(name, list);
      }),
    );
    return player;
  }

  get finished(): boolean {
    return this.finishedFlag;
  }

  /** Le temps écoulé depuis le début, en secondes. */
  get elapsed(): number {
    let t = 0;
    for (let i = 0; i < this.shotIndex; i++) t += this.def.shots[i]!.duration;
    return t + Math.max(0, this.shotTime);
  }

  /** Le plan en cours (son identifiant), pour les tests et le réglage. */
  get shotId(): string | null {
    return this.def.shots[this.shotIndex]?.id ?? null;
  }

  /** Avance la cinématique de `dtMs` millisecondes. */
  update(dtMs: number): void {
    if (this.finishedFlag) return;
    if (this.shotIndex < 0) this.enter(0);
    this.shotTime += Math.min(250, dtMs) / 1000;
    let shot = this.def.shots[this.shotIndex]!;
    while (this.shotTime >= shot.duration) {
      this.fireCues(shot, shot.duration + 1);
      const rest = this.shotTime - shot.duration;
      if (this.shotIndex + 1 >= this.def.shots.length) {
        this.finishedFlag = true;
        this.hooks.card(null);
        this.setCaption(null);
        return;
      }
      this.enter(this.shotIndex + 1);
      this.shotTime = rest;
      shot = this.def.shots[this.shotIndex]!;
    }
    this.fireCues(shot, this.shotTime);
    const shown = shot.caption !== undefined && this.shotTime >= (shot.captionAt ?? 0.8) && this.shotTime < shot.duration - (shot.fadeOut ?? 0);
    this.setCaption(shown ? shot.caption! : null);
    this.draw(shot, this.shotTime);
  }

  /**
   * Passe à la suite : saute au fondu de sortie du plan en cours. Les sons qui restaient ne sont
   * pas joués (ils tomberaient tous ensemble) ; la musique, elle, suit.
   */
  next(): void {
    const shot = this.def.shots[this.shotIndex];
    if (!shot || this.finishedFlag) return;
    const target = shot.duration - (shot.fadeOut ?? 0);
    // Pas avant que le texte soit lisible, ni pendant le fondu de sortie.
    if (this.shotTime < (shot.captionAt ?? 0.8) + 0.4 || this.shotTime >= target) return;
    const cues = shot.cues ?? [];
    for (; this.cueIndex < cues.length; this.cueIndex++) {
      const cue = cues[this.cueIndex]!;
      if (cue.music) this.hooks.music(cue.music);
      else if (cue.musicStop) this.hooks.stopMusic();
      else if (cue.musicRate) this.hooks.musicRate(cue.musicRate.to, 0);
    }
    this.shotTime = target;
  }

  private setCaption(key: string | null): void {
    if (key === this.captionKey) return;
    this.captionKey = key;
    this.hooks.caption(key);
  }

  /** Libère les textures. Le lecteur ne sert plus ensuite. */
  destroy(): void {
    this.clearNodes();
    this.root.destroy({ children: true });
    void Assets.unload(this.urls).catch(() => undefined);
  }

  private clearNodes(): void {
    for (const child of this.camera.removeChildren()) child.destroy();
    this.nodes = [];
  }

  private enter(index: number): void {
    this.clearNodes();
    this.shotIndex = index;
    this.shotTime = 0;
    this.cueIndex = 0;
    const shot = this.def.shots[index]!;
    this.hooks.card(shot.card ?? null);
    this.setCaption(null);
    shot.layers.forEach((layer, k) => this.nodes.push(this.build(layer, index * 100 + k)));
  }

  private fireCues(shot: CineShot, until: number): void {
    const cues = shot.cues ?? [];
    while (this.cueIndex < cues.length && cues[this.cueIndex]!.at <= until) {
      const cue = cues[this.cueIndex++]!;
      if (cue.sfx) this.hooks.sfx(cue.sfx, cue.volume ?? 1);
      else if (cue.music) this.hooks.music(cue.music);
      else if (cue.musicStop) this.hooks.stopMusic();
      else if (cue.musicRate) this.hooks.musicRate(cue.musicRate.to, cue.musicRate.over);
    }
  }

  private build(layer: CineLayer, seed: number): Node {
    switch (layer.type) {
      case 'image': {
        const frames = this.frames.get(layer.asset) ?? [Texture.EMPTY];
        const sprite = new Sprite(frames[layer.frame ?? 0] ?? frames[0]!);
        const [ax, ay] = layer.anchor ?? [0.5, 1];
        sprite.anchor.set(ax, ay);
        if (layer.cold) {
          const f = new ColorMatrixFilter();
          f.desaturate();
          f.alpha = 0.65;
          sprite.filters = [f];
          sprite.tint = COLD_TINT;
        }
        this.camera.addChild(sprite);
        const node: Node = { layer, sprite };
        if (layer.desat) {
          const grey = new Sprite(sprite.texture);
          grey.anchor.copyFrom(sprite.anchor);
          const f = new ColorMatrixFilter();
          f.desaturate();
          f.brightness(0.85, true);
          grey.filters = [f];
          const mask = new Graphics();
          grey.mask = mask;
          this.camera.addChild(grey, mask);
          node.grey = grey;
          node.mask = mask;
        }
        return node;
      }
      case 'smoke': {
        const rand = rng(seed + 7);
        const colors = (layer.colors ?? ['#6b7285']).map(hex);
        const [x, y, w, h] = layer.area;
        const particles: Particle[] = [];
        for (let i = 0; i < layer.count; i++) {
          const size = lerp(layer.radius[0], layer.radius[1], rand());
          const sprite = new Sprite(lightDisc(size));
          sprite.anchor.set(0.5);
          sprite.tint = colors[i % colors.length]!;
          this.camera.addChild(sprite);
          particles.push({ sprite, x: x + rand() * w, y: y + rand() * h, phase: rand() * Math.PI * 2, size });
        }
        return { layer, particles };
      }
      case 'light': {
        const glow = new Sprite(Texture.EMPTY);
        const core = new Sprite(Texture.EMPTY);
        for (const s of [glow, core]) {
          s.anchor.set(0.5);
          s.blendMode = 'add';
          s.position.set(layer.at[0], layer.at[1]);
        }
        glow.tint = EMBER;
        core.tint = EMBER_PALE;
        this.camera.addChild(glow, core);
        return { layer, glow, core };
      }
      case 'eyes': {
        const rand = rng(seed + 13);
        const [x, y, w, h] = layer.area;
        const spots: Array<[number, number]> = [];
        for (let tries = 0; spots.length < layer.count && tries < 500; tries++) {
          const px = Math.round(x + rand() * w);
          const py = Math.round(y + rand() * h);
          if (layer.avoid && Math.hypot(px - layer.avoid[0], py - layer.avoid[1]) < layer.avoid[2]) continue;
          spots.push([px, py]);
        }
        const eyes = new Graphics();
        this.camera.addChild(eyes);
        return { layer, eyes, eyeSpots: spots };
      }
      case 'fill': {
        const sprite = new Sprite(Texture.WHITE);
        sprite.width = VIEW_W;
        sprite.height = VIEW_H;
        sprite.tint = hex(layer.color);
        this.camera.addChild(sprite);
        return { layer, sprite };
      }
    }
  }

  private draw(shot: CineShot, t: number): void {
    const cam = shot.camera;
    if (cam) {
      const k = clamp01(t / shot.duration);
      const ox = cam.from && cam.to ? lerp(cam.from[0], cam.to[0], k) : 0;
      const oy = cam.from && cam.to ? lerp(cam.from[1], cam.to[1], k) : 0;
      const s = cam.scale ? lerp(cam.scale[0], cam.scale[1], k) : 1;
      // Le point visé reste à sa place à l'écran pendant que l'image grossit autour de lui.
      const [fx, fy] = cam.focus ?? [VIEW_W / 2, VIEW_H / 2];
      this.camera.scale.set(s);
      this.camera.position.set(Math.round(fx * (1 - s) + ox), Math.round(fy * (1 - s) + oy));
    } else {
      this.camera.scale.set(1);
      this.camera.position.set(0, 0);
    }
    for (const node of this.nodes) this.drawNode(node, shot, t);

    let dark = 0;
    if (shot.fadeIn && t < shot.fadeIn) dark = 1 - t / shot.fadeIn;
    if (shot.fadeOut && t > shot.duration - shot.fadeOut) dark = Math.max(dark, (t - (shot.duration - shot.fadeOut)) / shot.fadeOut);
    this.fade.alpha = clamp01(dark);
  }

  private drawNode(node: Node, shot: CineShot, t: number): void {
    const layer = node.layer;
    const start = layer.start ?? 0;
    const end = layer.end ?? shot.duration;
    const span = Math.max(1e-6, end - start);
    const k = clamp01((t - start) / span);
    const inside = t >= start && t < end;

    switch (layer.type) {
      case 'image': {
        const s = node.sprite!;
        s.visible = inside;
        if (!inside) {
          if (node.grey) node.grey.visible = false;
          return;
        }
        const frames = this.frames.get(layer.asset)!;
        if (layer.fps && frames.length > 1) s.texture = frames[Math.floor((t - start) * layer.fps) % frames.length]!;
        const x = layer.to ? lerp(layer.at[0], layer.to[0], k) : layer.at[0];
        const y = layer.to ? lerp(layer.at[1], layer.to[1], k) : layer.at[1];
        s.position.set(Math.round(x), Math.round(y));
        s.scale.x = layer.flip ? -1 : 1;
        s.alpha = layer.fadeIn ? clamp01((t - start) / layer.fadeIn) : 1;
        if (node.grey && node.mask && layer.desat) {
          const g = node.grey;
          g.visible = true;
          g.texture = s.texture;
          g.position.copyFrom(s.position);
          g.scale.x = s.scale.x;
          const d = layer.desat;
          const kd = clamp01((t - d.start) / Math.max(1e-6, d.end - d.start));
          const left = s.x - s.anchor.x * s.width;
          const top = s.y - s.anchor.y * s.height;
          const w = Math.round(s.width * kd);
          node.mask.clear();
          if (w > 0) node.mask.rect(d.from === 'left' ? left : left + s.width - w, top, w, s.height).fill(0xffffff);
          g.visible = w > 0;
        }
        return;
      }
      case 'smoke': {
        const [ax, ay, aw, ah] = layer.area;
        const alpha = lerp(layer.alpha[0], layer.alpha[1], k);
        const front = layer.front ? lerp(layer.front.from, layer.front.to, k) : Infinity;
        for (const p of node.particles!) {
          // Chaque volute dérive, ondule un peu, et revient de l'autre côté de sa zone.
          const x = ax + ((((p.x - ax + layer.drift[0] * t) % aw) + aw) % aw);
          const y = ay + ((((p.y - ay + layer.drift[1] * t) % ah) + ah) % ah);
          const wob = Math.sin(t * 0.8 + p.phase) * 3;
          p.sprite.position.set(Math.round(x + wob), Math.round(y));
          p.sprite.alpha = alpha * (0.6 + 0.4 * Math.sin(p.phase + t * 0.5) ** 2);
          p.sprite.visible = inside && x <= front;
        }
        return;
      }
      case 'light': {
        if (t < start) {
          node.glow!.visible = false;
          node.core!.visible = false;
          return;
        }
        const r = lerp(layer.radius[0], layer.radius[1], k);
        const flicker = 1 + Math.sin(t * 9) * 0.03;
        node.glow!.visible = r >= 3;
        node.core!.visible = r * 0.55 >= 3;
        if (r >= 3) node.glow!.texture = lightDisc(r * flicker);
        if (r * 0.55 >= 3) node.core!.texture = lightDisc(r * 0.55 * flicker);
        node.glow!.alpha = layer.warm * 0.6;
        node.core!.alpha = layer.warm;
        return;
      }
      case 'eyes': {
        const g = node.eyes!;
        g.clear();
        if (!inside) return;
        node.eyeSpots!.forEach(([x, y], i) => {
          const open = (t - start - i * layer.interval) / 0.25;
          if (open <= 0) return;
          const h = open < 0.5 ? 1 : 2;
          g.rect(x, y + (2 - h), 2, h).rect(x + 5, y + (2 - h), 2, h);
        });
        g.fill(DANGER);
        return;
      }
      case 'fill': {
        const s = node.sprite!;
        s.visible = t >= start;
        s.alpha = lerp(layer.alpha[0], layer.alpha[1], k);
        return;
      }
    }
  }
}
