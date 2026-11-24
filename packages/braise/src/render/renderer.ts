import { Application, Container, Graphics, RenderTexture, Sprite, Texture, TextureSource } from 'pixi.js';
import type { CampDef, GameData } from '../content/index.ts';
import {
  CAP_ENEMIES, CAP_ENEMY_SHOTS, CAP_PICKUPS, CAP_SHOTS, EV, HIT_CRIT, HIT_RESIST, HIT_WEAK,
  PK_ASH, PK_CALL, PK_CHEST, PK_DROP, PK_GEM, PK_GOLD, PK_PIECE, PK_RED_GEM, SHOT_LOB, ST_BURN, ST_FROZEN, ST_SLOW, TG_CIRCLE, TG_LINE, TG_RING,
  TILE_GATE, TILE_THICKET,
  type Run,
} from '../core/types.ts';
import { CAMP_CREAM, CAMP_MOON } from '../content/scene.ts';
import type { CampState } from '../core/camp.ts';
import { lowHp } from '../core/combat.ts';
import type { SceneState } from '../core/scene.ts';
import { tutorialTarget } from '../core/tutorial.ts';
import { SHOT_SPRITES, orbPosition, weaponParams } from '../core/weapons.ts';
import { Atlas } from './atlas.ts';
import { lightDisc } from './light.ts';

/** L'image native du jeu (document 08 §5). */
export const VIEW_W = 640;
export const VIEW_H = 360;

/** L'image de chaque objet du refuge, son décalage au sol, et sa lueur (décalage, rayon, force, teinte). */
const CAMP_LOOKS: Record<string, { sprite: string; down: number; up: number; radius: number; warm: number; tint: number }> = {
  door: { sprite: 'camp-door', down: 4, up: 36, radius: 66, warm: 0.12, tint: 0xd9480f },
  altar: { sprite: 'camp-altar', down: 8, up: 18, radius: 40, warm: 0.08, tint: 0xfb7a0c },
  memories: { sprite: 'camp-souvenirs', down: 6, up: 16, radius: 34, warm: 0.1, tint: 0x7fd4ff },
  lantern: { sprite: 'camp-lantern', down: 6, up: 12, radius: 32, warm: 0.1, tint: 0xfb7a0c },
};

const C = {
  night: 0x0b0f1a, ember: 0xffb020, emberHot: 0xfb7a0c, emberPale: 0xffd166, emberWhite: 0xfff1c2, emberDark: 0xd9480f,
  danger: 0xff3d81, dangerDark: 0xc2185b, teal: 0x4fe0c8, tealPale: 0xb8fff0, white: 0xeef2f6, grey: 0x6b7285,
  pale: 0xc9d1dc, frost: 0x7fd4ff, spark: 0xf6f08a,
};

/** Ce que le refuge montre à cette image. */
export interface CampView {
  dt: number;
  /** Moon, ou null : il attend devant la porte (écran titre). */
  moon: CampState | null;
  visible: ReadonlySet<string>;
  /** L'objet au focus : il s'éclaire un peu. */
  near: string | null;
  doorOpen: boolean;
}

interface Fx {
  type: number;
  x: number; y: number;
  a: number; b: number; c: number;
  t: number; dur: number;
}

const FX_ARC = 1;
const FX_RING = 2;
const FX_BURST = 3;
const FX_FISSURE = 4;
const FX_EDGE = 5;
const FX_TELE_LINE = 6;
const FX_TELE_CIRCLE = 7;
const FX_TRAIL = 8;
const FX_TELE_RING = 9;
/** Le bois sombre des racines du Cerf et le sol qu'elles ouvrent. */
const ROOT_DARK = 0x2a1a14;

/** Un nombre de 0 à 1 tiré d'un autre, toujours le même : les racines poussent au même endroit à chaque image. */
function hash(n: number): number {
  const v = Math.sin(n) * 43758.5453;
  return v - Math.floor(v);
}
const MAX_FX = 96;
const MAX_PUFFS = 120;
const MAX_NUMBERS = 110;
const MAX_PROPS = 420;
const MAX_GATES = 24;
const MAX_THICKETS = 16;
const MAX_GATE_FADES = 12;
/** La fumée d'une barrière ouverte met ce temps à se dissiper. */
const GATE_FADE = 0.7;
/** Où sont les pattes sur l'image : Cream tient sur une toile de 48 px, pattes à 33 px du haut. */
const CREAM_ANCHOR = 33 / 48;
/** Part de Cream qui reste visible dans le noir, hors de la lueur de Moon. */
const CREAM_PALE = 0.5;
/** L'ancre verticale des sprites dont les pieds ne sont pas là où la règle du rang les attend. */
const SPRITE_ANCHOR: Record<string, number> = { 'boss-guetteur': 0.84 };
/** Hauteur d'une bulle au-dessus de la position de Moon et de Cream. */
const EMOTE_UP_MOON = 34;
const EMOTE_UP_CREAM = 24;

/** Un coin de dalle du donjon, tiré de sa position : le sol varie sans rien stocker. */
function caveCorner(x: number, y: number): number {
  let h = Math.imul((x >> 1) * 374761393 + (y >> 1) * 668265263, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h >>> 16) & 15) < 6 ? 1 : 0;
}

interface EmoteFx { sprite: Sprite; name: string; t: number }
interface GateFade { sprite: Sprite; x: number; y: number; t: number }
const MAX_LIGHTS = 140;

interface Puff { sprite: Sprite; t: number; frames: Texture[]; rate: number }
interface NumberFx { box: Container; digits: Sprite[]; t: number; x: number; y: number }

/** Les réglages d'affichage lus par le rendu. */
export interface RenderSettings {
  damageNumbers: boolean;
  screenShake: number;
  flashes: number;
}

/** Le rendu du jeu : il lit l'état de `core` et ne le modifie jamais. */
export class GameRenderer {
  readonly app: Application;
  private readonly blank = new Container();
  readonly atlas: Atlas;
  settings: RenderSettings = { damageNumbers: true, screenShake: 1, flashes: 1 };

  private readonly world = new Container();
  private readonly ground = new Container();
  private readonly groundFx = new Graphics();
  private readonly pickups = new Container();
  private readonly entities = new Container();
  private readonly shots = new Container();
  private readonly topFx = new Graphics();
  private readonly puffLayer = new Container();
  private readonly numberLayer = new Container();
  private readonly screen = new Container();
  private readonly screenFx = new Graphics();
  private readonly camp = new Container();

  private readonly lightScene = new Container();
  private readonly darkness: Sprite;
  private readonly lightHoles = new Container();
  private readonly lightTexture: RenderTexture;
  private readonly lightSprite: Sprite;
  private readonly lights: Sprite[] = [];
  private lightCount = 0;
  private readonly warmLayer = new Container();
  private readonly warms: Sprite[] = [];
  private warmCount = 0;

  private readonly tiles: Sprite[] = [];
  private tileTextures: Texture[] = [];
  private readonly tileCols = Math.ceil(VIEW_W / 32) + 2;
  private readonly tileRows = Math.ceil(VIEW_H / 32) + 2;

  private readonly enemySprites: Sprite[] = [];
  private enemyFrames: Texture[][] = [];
  private enemyWhite: Texture[][] = [];
  private enemyAnchor: number[] = [];
  private readonly propSprites: Sprite[] = [];
  private propTextures: Texture[] = [];
  private borderTexture: Texture = Texture.EMPTY;
  private readonly poiSprites: Sprite[] = [];
  private readonly poiFlames: Sprite[] = [];
  private readonly pickupSprites: Sprite[] = [];
  private pickupTextures: Texture[] = [];
  private readonly shotSprites: Sprite[] = [];
  private readonly enemyShotSprites: Sprite[] = [];
  private shotTextures: Texture[] = [];
  private readonly orbSprites: Sprite[] = [];
  private readonly arrows: Sprite[] = [];
  private readonly hero: Sprite;
  private heroWalk: Texture[][] = [];
  private heroIdle: Texture[][] = [];
  private readonly ghost: Sprite[] = [];
  private heroSprite = '';

  // Le tutoriel : Cream, les barrières de fumée, la rangée d'Éteints, les bulles.
  private readonly cream: Sprite;
  /** Une copie pâle de Cream par-dessus la pénombre : il reste hors de la lueur, mais on le voit. */
  private readonly creamPale: Sprite;
  private creamWalk: Texture[][] = [];
  private readonly gateSprites: Sprite[] = [];
  private readonly thicketSprites: Sprite[] = [];
  private gateFrames: Texture[] = [];
  private readonly gateFades: GateFade[] = [];
  private readonly emotes: EmoteFx[] = [];
  private animClock = 0;
  private dialogueBlend = 0;
  private respawnFade = 0;

  private readonly fx: Fx[] = [];
  private fxCount = 0;
  private readonly puffs: Puff[] = [];
  private readonly numbers: NumberFx[] = [];
  private digitTextures: Texture[] = [];
  private flameFrames: Texture[] = [];
  private puffFrames: Texture[] = [];

  private shownEnemies = 0;
  private shownPickups = 0;
  private shownShots = 0;
  private shownEnemyShots = 0;
  private camX = 0;
  private camY = 0;
  private shake = 0;
  private clock = 0;
  private deathFade = 0;
  private currentRun: Run | null = null;

  private campHero!: Sprite;
  private campCream!: Sprite;
  private campFlame!: Sprite;
  /** Le refuge décrit par le contenu : les images et les lueurs suivent ses positions. Posé par `app` au démarrage. */
  campDef: CampDef = { speed: 0, bounds: { x: 0, y: 0, rx: 1, ry: 1 }, objects: [] };
  /** La porte, l'Autel, les Souvenirs et la lanterne seule, par identifiant d'objet. */
  private readonly campObjects = new Map<string, Sprite>();
  /** Leur apparition, de 0 (cachés, en scène) à 1. */
  private campFade = 1;
  private campBuilt = false;
  /** Cream pendant une scène de route (Moon reprend `campHero`), leurs bulles, et la flamme qui prend. */
  private sceneCream!: Sprite;
  private readonly sceneEmotes: EmoteFx[] = [];
  private sceneFire = 1;

  private constructor(app: Application, atlas: Atlas) {
    this.app = app;
    this.atlas = atlas;
    this.entities.sortableChildren = true;
    this.world.addChild(this.ground, this.groundFx, this.pickups, this.entities, this.shots, this.topFx, this.puffLayer);

    this.darkness = new Sprite(Texture.WHITE);
    this.darkness.width = VIEW_W;
    this.darkness.height = VIEW_H;
    this.lightScene.addChild(this.darkness, this.lightHoles);
    this.lightTexture = RenderTexture.create({ width: VIEW_W, height: VIEW_H });
    this.lightTexture.source.scaleMode = 'nearest';
    this.lightSprite = new Sprite(this.lightTexture);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const s = new Sprite(Texture.EMPTY);
      s.anchor.set(0.5);
      s.blendMode = 'erase';
      s.visible = false;
      this.lightHoles.addChild(s);
      this.lights.push(s);
    }

    for (let i = 0; i < 24; i++) {
      const s = new Sprite(Texture.EMPTY);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = C.emberHot;
      s.visible = false;
      this.warmLayer.addChild(s);
      this.warms.push(s);
    }
    this.screen.addChild(this.screenFx);
    app.stage.addChild(this.camp, this.world, this.warmLayer, this.lightSprite, this.numberLayer, this.screen);

    for (let i = 0; i < this.tileCols * this.tileRows; i++) {
      const s = new Sprite(Texture.EMPTY);
      this.ground.addChild(s);
      this.tiles.push(s);
    }
    this.hero = new Sprite(Texture.EMPTY);
    this.hero.anchor.set(0.5, 0.8);
    this.entities.addChild(this.hero);
    for (let i = 0; i < 3; i++) {
      const g = new Sprite(Texture.EMPTY);
      g.anchor.set(0.5, 0.8);
      g.visible = false;
      this.entities.addChild(g);
      this.ghost.push(g);
    }
    const pool = (count: number, parent: Container, anchorX = 0.5, anchorY = 0.5): Sprite[] => {
      const list: Sprite[] = [];
      for (let i = 0; i < count; i++) {
        const s = new Sprite(Texture.EMPTY);
        s.anchor.set(anchorX, anchorY);
        s.visible = false;
        parent.addChild(s);
        list.push(s);
      }
      return list;
    };
    this.enemySprites = pool(CAP_ENEMIES, this.entities);
    this.propSprites = pool(MAX_PROPS, this.entities, 0.5, 0.92);
    this.cream = pool(1, this.entities, 0.5, CREAM_ANCHOR)[0]!;
    this.gateSprites = pool(MAX_GATES, this.entities, 0.5, 1);
    this.thicketSprites = pool(MAX_THICKETS, this.entities, 0.5, 0.8);
    for (const s of pool(MAX_GATE_FADES, this.entities, 0.5, 1)) this.gateFades.push({ sprite: s, x: 0, y: 0, t: -1 });
    this.creamPale = pool(1, this.numberLayer, 0.5, CREAM_ANCHOR)[0]!;
    this.creamPale.alpha = CREAM_PALE;
    for (const s of pool(2, this.numberLayer, 0.5, 1)) this.emotes.push({ sprite: s, name: '', t: 0 });
    this.poiSprites = pool(28, this.entities, 0.5, 0.8);
    this.poiFlames = pool(28, this.entities, 0.5, 1);
    this.pickupSprites = pool(CAP_PICKUPS, this.pickups);
    this.shotSprites = pool(CAP_SHOTS, this.shots);
    this.enemyShotSprites = pool(CAP_ENEMY_SHOTS, this.shots);
    this.orbSprites = pool(32, this.shots);
    this.arrows = pool(8, this.screen);
    for (let i = 0; i < MAX_FX; i++) this.fx.push({ type: 0, x: 0, y: 0, a: 0, b: 0, c: 0, t: 0, dur: 1 });
    for (const s of pool(MAX_PUFFS, this.puffLayer)) this.puffs.push({ sprite: s, t: -1, frames: [], rate: 12 });
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const box = new Container();
      box.visible = false;
      const digits: Sprite[] = [];
      for (let d = 0; d < 6; d++) {
        const s = new Sprite(Texture.EMPTY);
        s.x = d * 5;
        box.addChild(s);
        digits.push(s);
      }
      this.numberLayer.addChild(box);
      this.numbers.push({ box, digits, t: -1, x: 0, y: 0 });
    }
    this.bindTextures();
  }

  /** Crée le rendu dans un élément de la page. */
  static async create(parent: HTMLElement, base: string): Promise<GameRenderer> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({
      width: VIEW_W, height: VIEW_H, backgroundColor: C.night, antialias: false, resolution: 1,
      autoDensity: false, roundPixels: true, autoStart: false, preference: 'webgl', powerPreference: 'high-performance',
    });
    app.ticker.stop();
    app.canvas.classList.add('game-canvas');
    parent.appendChild(app.canvas);
    const atlas = await Atlas.load(base);
    return new GameRenderer(app, atlas);
  }

  private bindTextures(): void {
    const a = this.atlas;
    this.pickupTextures = [];
    this.pickupTextures[PK_GEM] = a.get('pickup-gem-small');
    this.pickupTextures[PK_GOLD] = a.get('pickup-gold');
    this.pickupTextures[PK_ASH] = a.get('pickup-ash');
    this.pickupTextures[PK_DROP] = a.get('pickup-drop');
    this.pickupTextures[PK_CHEST] = a.get('pickup-coffre');
    this.pickupTextures[PK_CALL] = a.get('pickup-call');
    this.pickupTextures[PK_RED_GEM] = a.get('pickup-gem-red');
    this.pickupTextures[PK_PIECE] = a.get('pickup-lantern-piece');
    this.shotTextures = SHOT_SPRITES.map((name) => a.get(name));
    this.digitTextures = a.anim('font-digits');
    this.flameFrames = a.anim('fx-flame');
    this.puffFrames = a.anim('fx-puff');
    for (const s of this.enemyShotSprites) s.texture = a.get('shot-enemy');
    for (const s of this.orbSprites) s.texture = a.get('fx-firefly');
    for (const s of this.arrows) s.texture = a.get('ui-arrow');
    for (const s of this.poiFlames) s.texture = this.flameFrames[0]!;
  }

  /** Prépare le rendu d'une expédition : textures de la région, de la classe et des ennemis. */
  beginRun(run: Run): void {
    const a = this.atlas;
    const data: GameData = run.data;
    this.currentRun = run;
    this.tileTextures = [];
    for (let mask = 0; mask < 16; mask++) this.tileTextures.push(a.get(`${run.region.tileset}-${mask}`));
    this.propTextures = run.region.decor.map((d) => a.get(d.sprite));
    this.borderTexture = a.get(run.region.borderDecor);
    this.enemyFrames = data.enemies.map((e) => a.anim(e.sprite));
    this.enemyWhite = data.enemies.map((e) => a.whiteAnim(e.sprite));
    this.enemyAnchor = data.enemies.map((e) => SPRITE_ANCHOR[e.sprite] ?? (e.rank === 'boss' ? 0.72 : e.flying ? 0.5 : 0.66));
    this.heroSprite = run.cls.sprite;
    // Les murs du donjon sont posés au pied de leur tuile ; les décors du Bois gardent leur ancre.
    for (const s of this.propSprites) s.anchor.set(0.5, run.tutorial ? 1 : 0.92);
    this.cream.visible = false;
    this.creamPale.visible = false;
    for (const s of this.gateSprites) s.visible = false;
    for (const s of this.thicketSprites) s.visible = false;
    for (const f of this.gateFades) {
      f.t = -1;
      f.sprite.visible = false;
    }
    for (const em of this.emotes) {
      em.name = '';
      em.sprite.visible = false;
    }
    this.dialogueBlend = 0;
    this.respawnFade = 0;
    if (run.tutorial) {
      this.creamWalk = [];
      for (let d = 0; d < 8; d++) this.creamWalk.push(a.anim(`cream-walk-${d}`));
      this.gateFrames = a.anim('fx-barriere-fumee');
      for (const s of this.thicketSprites) s.texture = a.get('decor-eteints-endormis');
    }
    this.heroWalk = [];
    this.heroIdle = [];
    for (let d = 0; d < 8; d++) {
      this.heroWalk.push(a.anim(`${run.cls.sprite}-walk-${d}`));
      const idle = a.anim(`${run.cls.sprite}-idle-${d}`);
      this.heroIdle.push(idle[0] === Texture.EMPTY ? [a.get(`${run.cls.sprite}-rot-${d}`)] : idle);
    }
    this.fxCount = 0;
    for (const s of this.enemySprites) s.visible = false;
    for (const s of this.pickupSprites) s.visible = false;
    for (const s of this.shotSprites) s.visible = false;
    for (const s of this.enemyShotSprites) s.visible = false;
    this.shownEnemies = 0;
    this.shownPickups = 0;
    this.shownShots = 0;
    this.shownEnemyShots = 0;
    for (const p of this.puffs) {
      p.t = -1;
      p.sprite.visible = false;
    }
    for (const n of this.numbers) {
      n.t = -1;
      n.box.visible = false;
    }
    this.shake = 0;
    this.deathFade = 0;
    this.darkness.tint = parseInt(run.region.darkness.color.slice(1), 16);
    this.darkness.alpha = run.region.darkness.opacity;
    this.camp.visible = false;
    this.world.visible = true;
    this.numberLayer.visible = true;
    this.screen.visible = true;
  }

  /** Ajoute un effet passager. */
  private addFx(type: number, x: number, y: number, a: number, b: number, c: number, dur: number): void {
    const f = this.fx[this.fxCount < MAX_FX ? this.fxCount++ : MAX_FX - 1]!;
    f.type = type; f.x = x; f.y = y; f.a = a; f.b = b; f.c = c; f.t = 0; f.dur = dur;
  }

  private puff(x: number, y: number, frames: Texture[], tint = 0xffffff, rate = 14): void {
    for (const p of this.puffs) {
      if (p.t >= 0) continue;
      p.t = 0;
      p.frames = frames;
      p.rate = rate;
      p.sprite.tint = tint;
      p.sprite.position.set(Math.round(x), Math.round(y));
      p.sprite.visible = true;
      p.sprite.texture = frames[0]!;
      return;
    }
  }

  private number(x: number, y: number, value: number, flags: number): void {
    if (!this.settings.damageNumbers) return;
    const n = this.numbers.find((k) => k.t < 0);
    if (!n) return;
    const text = String(Math.min(999999, Math.round(value)));
    const tint = flags & HIT_CRIT ? C.emberPale : flags & HIT_WEAK ? C.white : flags & HIT_RESIST ? C.grey : C.pale;
    for (let d = 0; d < n.digits.length; d++) {
      const s = n.digits[d]!;
      if (d < text.length) {
        s.texture = this.digitTextures[text.charCodeAt(d) - 48] ?? Texture.EMPTY;
        s.tint = tint;
        s.visible = true;
      } else {
        s.visible = false;
      }
    }
    n.t = 0;
    n.x = x - (text.length * 5) / 2 + ((value * 7) % 9) - 4;
    n.y = y - 14;
    n.box.visible = true;
  }

  /** Reçoit un événement de la simulation (coup, mort, ramassage…). */
  onEvent(run: Run, type: number, x: number, y: number, a: number, b: number, c: number): void {
    switch (type) {
      case EV.kill: this.puff(x, y, this.puffFrames); break;
      case EV.eliteDeath:
      case EV.bossDeath:
        for (let k = 0; k < 6; k++) this.puff(x + Math.cos(k) * 14, y + Math.sin(k * 2) * 12, this.puffFrames, 0xffffff, 9);
        this.addFx(FX_RING, x, y, type === EV.bossDeath ? 220 : 90, C.emberWhite, 3, 0.6);
        this.shake = Math.max(this.shake, type === EV.bossDeath ? 3 : 2);
        break;
      case EV.bossReform:
        // Le boss retombe en poussière : une gerbe grise, sans l'éclat de la vraie mort.
        for (let k = 0; k < 10; k++) this.puff(x + Math.cos(k * 1.7) * 22, y - 10 + Math.sin(k * 2.3) * 16, this.puffFrames, 0x9aa3b5, 7);
        this.addFx(FX_RING, x, y, 160, C.night, 3, 0.7);
        this.shake = Math.max(this.shake, 3);
        break;
      case EV.damageNumber: this.number(x, y, a, b); break;
      case EV.heroHurt: this.shake = Math.max(this.shake, 1.5); break;
      case EV.heroDash: this.addFx(FX_TRAIL, x, y, a, 0, 0, 0.25); break;
      case EV.arc: this.addFx(FX_ARC, x, y, a, b, c, 0.16); break;
      case EV.nova:
        this.addFx(FX_RING, x, y, a, C.emberPale, 4, 0.28);
        this.shake = Math.max(this.shake, 1);
        break;
      case EV.burst: this.addFx(FX_BURST, x, y, a, C.emberHot, 0, 0.22); break;
      case EV.fissure: this.addFx(FX_FISSURE, x, y, a, b, c, 0.4); break;
      case EV.skill:
        this.addFx(FX_RING, x, y, a, C.ember, 5, 0.3);
        this.shake = Math.max(this.shake, 1.5);
        break;
      case EV.ultTick: this.addFx(FX_RING, x, y - 6, a, C.emberHot, 2, 0.18); break;
      case EV.levelUp: this.addFx(FX_RING, x, y, 120, C.emberPale, 3, 0.5); break;
      case EV.evolution: this.addFx(FX_RING, x, y, 180, C.emberWhite, 6, 0.7); break;
      case EV.waveWarning: this.addFx(FX_EDGE, 0, 0, a, b, 0, run.data.tuning.director.waveWarning); break;
      case EV.telegraphHit: {
        // a : la forme ; b : l'angle d'une ligne ou le rayon intérieur d'un anneau ; c : la longueur ou le rayon.
        const dust = 0x8f8173;
        if (a === TG_CIRCLE) {
          this.addFx(FX_TELE_CIRCLE, x, y, c, 0, 0, 0.7);
          for (let k = 0; k < 4; k++) this.puff(x + Math.cos(k * 1.6) * c * 0.6, y + Math.sin(k * 1.6) * c * 0.5, this.puffFrames, dust, 12);
        } else if (a === TG_RING) {
          this.addFx(FX_TELE_RING, x, y, b, c, 0, 0.6);
          for (let k = 0; k < 8; k++) {
            const ang = (k * Math.PI) / 4 + b * 0.01;
            this.puff(x + Math.cos(ang) * (b + c) * 0.5, y + Math.sin(ang) * (b + c) * 0.5, this.puffFrames, dust, 12);
          }
        } else if (a === TG_LINE) {
          // L'événement ne porte pas la largeur : celle des racines du Cerf, la seule ligne qui frappe.
          this.addFx(FX_TELE_LINE, x, y, b, c, 22, 0.9);
          for (let d = 50; d < c; d += 100) this.puff(x + Math.cos(b) * d, y + Math.sin(b) * d, this.puffFrames, dust, 12);
        }
        this.shake = Math.max(this.shake, 2);
        break;
      }
      case EV.bossSpawn: this.shake = Math.max(this.shake, 3); break;
      case EV.poiDone: this.addFx(FX_RING, x, y, 90, a === 1 ? C.teal : C.emberPale, 3, 0.5); break;
      case EV.heroRevive: this.addFx(FX_RING, x, y, 110, C.emberWhite, 6, 0.5); break;
      case EV.flameCall: this.addFx(FX_RING, x, y, 300, C.tealPale, 2, 0.6); break;
      case EV.heroDeath: this.deathFade = 0.001; break;
      case EV.gateOpen: {
        // La fumée de la barrière monte et s'efface.
        const f = this.gateFades.find((k) => k.t < 0);
        if (f) {
          f.t = 0;
          f.x = x;
          f.y = y;
        }
        this.puff(x, y - 6, this.puffFrames, 0xc9d1dc, 10);
        break;
      }
      case EV.tutoRespawn: this.respawnFade = 1; break;
    }
  }

  /** Perce la couche sombre d'un disque de lumière. `warm` ajoute une teinte chaude (lanterne, feux). */
  private light(x: number, y: number, radius: number, warm = 0, tint: number = C.emberHot): void {
    if (this.lightCount >= MAX_LIGHTS || radius < 3) return;
    const s = this.lights[this.lightCount++]!;
    s.texture = lightDisc(radius);
    s.position.set(Math.round(x), Math.round(y));
    s.visible = true;
    if (warm > 0 && this.warmCount < this.warms.length) {
      const w = this.warms[this.warmCount++]!;
      w.texture = s.texture;
      w.position.copyFrom(s.position);
      w.alpha = warm;
      w.tint = tint;
      w.visible = true;
    }
  }

  private renderLight(): void {
    for (let i = this.lightCount; i < MAX_LIGHTS; i++) {
      if (!this.lights[i]!.visible) break;
      this.lights[i]!.visible = false;
    }
    for (let i = this.warmCount; i < this.warms.length; i++) this.warms[i]!.visible = false;
    this.app.renderer.render({ container: this.lightScene, target: this.lightTexture, clear: true, clearColor: [0, 0, 0, 0] });
  }

  /** Dessine une image de l'expédition. `alpha` interpole entre les deux derniers pas. */
  drawRun(run: Run, alpha: number, dtMs: number): void {
    if (run !== this.currentRun) this.beginRun(run);
    const dt = Math.min(0.1, dtMs / 1000);
    const paused = run.phase !== 'playing';
    if (!paused) this.clock += dt;
    const time = this.clock;
    const hero = run.hero;
    const map = run.map;
    const hx = hero.px + (hero.x - hero.px) * alpha;
    const hy = hero.py + (hero.y - hero.py) * alpha;
    const tuto = run.tutorial;
    const talking = run.phase === 'dialogue';
    // Pendant un dialogue le monde est figé, mais Moon, Cream et les bulles continuent de bouger.
    if (!paused || talking) this.animClock += dt;
    const animTime = this.animClock;
    let gx = hx;
    let gy = hy;
    if (tuto) {
      gx = tuto.guide.px + (tuto.guide.x - tuto.guide.px) * alpha;
      gy = tuto.guide.py + (tuto.guide.y - tuto.guide.py) * alpha;
    }

    // La caméra : centrée sur le héros, bornée à la carte, arrondie au pixel natif.
    // Pendant un dialogue, elle glisse vers le milieu entre Moon et Cream, sans jamais perdre Moon.
    let focusX = hx;
    let focusY = hy;
    if (tuto) {
      const want = talking ? 1 : 0;
      this.dialogueBlend += Math.max(-dt / 0.45, Math.min(dt / 0.45, want - this.dialogueBlend));
      const b = this.dialogueBlend;
      const k = b * b * (3 - 2 * b);
      const maxX = VIEW_W / 2 - 96;
      const maxY = VIEW_H / 2 - 100;
      focusX += Math.max(-maxX, Math.min(maxX, (gx - hx) / 2)) * k;
      // La boîte de dialogue couvre le bas de l'image : les deux sont cadrés un peu plus haut.
      focusY += (Math.max(-maxY, Math.min(maxY, (gy - hy) / 2)) + 30) * k;
    }
    const mapPx = map.size * map.tile;
    let camX = Math.round(Math.min(mapPx - VIEW_W, Math.max(0, focusX - VIEW_W / 2)));
    let camY = Math.round(Math.min(mapPx - VIEW_H, Math.max(0, focusY - VIEW_H / 2 - 8)));
    this.camX = camX;
    this.camY = camY;
    if (this.shake > 0.05 && this.settings.screenShake > 0) {
      const amp = Math.min(3, this.shake) * this.settings.screenShake;
      camX += Math.round(Math.sin(time * 97) * amp);
      camY += Math.round(Math.cos(time * 83) * amp);
      this.shake *= Math.pow(0.0005, dt);
    } else {
      this.shake = 0;
    }
    this.world.position.set(-camX, -camY);
    this.numberLayer.position.set(-camX, -camY);
    this.lightCount = 0;
    this.warmCount = 0;
    const lightX = (x: number): number => x - camX;
    const lightY = (y: number): number => y - camY;

    // Sol.
    const tx0 = Math.floor(camX / map.tile);
    const ty0 = Math.floor(camY / map.tile);
    const cs = map.size + 1;
    let ti = 0;
    let gates = 0;
    let thickets = 0;
    for (let r = 0; r < this.tileRows; r++) {
      for (let c = 0; c < this.tileCols; c++) {
        const s = this.tiles[ti++]!;
        const tx = tx0 + c;
        const ty = ty0 + r;
        if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) {
          s.visible = false;
          continue;
        }
        const k = ty * cs + tx;
        let mask = map.corners[k]! * 8 + map.corners[k + 1]! * 4 + map.corners[k + cs]! * 2 + map.corners[k + cs + 1]!;
        if (tuto) {
          // Le donjon : rien n'est dessiné sous les murs ni hors des salles, tout y est noir.
          const v = map.solid[ty * map.size + tx]!;
          if (v === 1) {
            s.visible = false;
            continue;
          }
          mask = caveCorner(tx, ty) * 8 + caveCorner(tx + 1, ty) * 4 + caveCorner(tx, ty + 1) * 2 + caveCorner(tx + 1, ty + 1);
          const cx = (tx + 0.5) * map.tile;
          if (v === TILE_GATE && gates < MAX_GATES) {
            const gs = this.gateSprites[gates++]!;
            gs.texture = this.gateFrames[Math.floor(time * 6 + tx * 3 + ty) % this.gateFrames.length]!;
            gs.position.set(cx, (ty + 1) * map.tile);
            gs.zIndex = (ty + 0.9) * map.tile;
            gs.visible = true;
          } else if (v === TILE_THICKET && thickets < MAX_THICKETS) {
            const ts = this.thicketSprites[thickets++]!;
            ts.position.set(cx, (ty + 0.86) * map.tile);
            ts.zIndex = (ty + 0.86) * map.tile;
            ts.visible = true;
          }
        }
        s.texture = this.tileTextures[mask]!;
        s.position.set(tx * map.tile, ty * map.tile);
        s.visible = true;
      }
    }
    for (; gates < MAX_GATES; gates++) this.gateSprites[gates]!.visible = false;
    for (; thickets < MAX_THICKETS; thickets++) this.thicketSprites[thickets]!.visible = false;
    for (const f of this.gateFades) {
      if (f.t < 0) continue;
      if (!paused) f.t += dt;
      if (f.t >= GATE_FADE) {
        f.t = -1;
        f.sprite.visible = false;
        continue;
      }
      const k = f.t / GATE_FADE;
      f.sprite.texture = this.gateFrames[Math.floor(f.t * 10) % this.gateFrames.length]!;
      f.sprite.position.set(f.x, Math.round(f.y + map.tile / 2 - k * 14));
      f.sprite.zIndex = f.y + map.tile * 0.4;
      f.sprite.alpha = 1 - k;
      f.sprite.visible = true;
    }

    // Décors : seuls ceux de l'écran sont dessinés (la liste est triée par ordonnée).
    let pi = 0;
    const props = map.props;
    let lo = 0;
    let hi = props.length;
    const top = camY - 8;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (props[mid]!.y < top) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < props.length && pi < MAX_PROPS; k++) {
      const p = props[k]!;
      if (p.y > camY + VIEW_H + 100) break;
      if (p.x < camX - 40 || p.x > camX + VIEW_W + 40) continue;
      const s = this.propSprites[pi++]!;
      s.texture = p.decor < 0 ? this.borderTexture : this.propTextures[p.decor]!;
      // Un mur du donjon tient au pied de sa tuile et dépasse au-dessus d'elle.
      s.position.set(p.x, tuto ? Math.ceil(p.y / map.tile) * map.tile : p.y);
      s.zIndex = p.y;
      s.visible = true;
    }
    for (; pi < MAX_PROPS; pi++) {
      if (!this.propSprites[pi]!.visible) break;
      this.propSprites[pi]!.visible = false;
    }

    const g = this.groundFx;
    g.clear();
    const top2 = this.topFx;
    top2.clear();

    // Points d'intérêt.
    const ev = run.data.tuning.events;
    for (let k = 0; k < this.poiSprites.length; k++) {
      const s = this.poiSprites[k]!;
      const f = this.poiFlames[k]!;
      const poi = map.pois[k];
      if (!poi || poi.x < camX - 80 || poi.x > camX + VIEW_W + 80 || poi.y < camY - 80 || poi.y > camY + VIEW_H + 80) {
        s.visible = false;
        f.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(poi.x, poi.y + 10);
      s.zIndex = poi.y + 4;
      f.visible = false;
      s.tint = 0xffffff;
      s.scale.set(1);
      if (poi.kind === 'memory') {
        // Le Souvenir : une grosse gemme bleue qui flotte et pulse doucement, avec sa lumière.
        const pulse = Math.sin(time * 3);
        s.texture = this.atlas.get('poi-souvenir');
        s.scale.set(1 + pulse * 0.06);
        s.position.set(poi.x, poi.y + 10 + Math.round(Math.sin(time * 1.7) * 2));
        g.ellipse(poi.x, poi.y + 12, 13 - pulse, 4).fill({ color: C.night, alpha: 0.35 });
        g.circle(poi.x, poi.y, 22 + pulse * 3).stroke({ width: 1, color: C.frost, alpha: 0.4 + pulse * 0.15 });
        this.light(lightX(poi.x), lightY(poi.y - 6), 76 + Math.round(pulse * 5));
      } else if (poi.kind === 'brazier') {
        s.texture = this.atlas.get('poi-brasero');
        if (poi.state === 3) {
          // Allumé : la flamme attend une arme à faire évoluer, le cercle invite à revenir.
          f.visible = true;
          f.texture = this.flameFrames[Math.floor(time * 10 + k) % this.flameFrames.length]!;
          f.position.set(poi.x, poi.y - 8);
          f.zIndex = poi.y + 5;
          this.light(lightX(poi.x), lightY(poi.y - 8), 96 + Math.round(Math.sin(time * 3 + k) * 2), 0.14);
          g.circle(poi.x, poi.y, ev.brazier.radius).stroke({ width: 1, color: C.emberPale, alpha: 0.25 + Math.sin(time * 2) * 0.08 });
        } else if (poi.state === 2) {
          // Consommé : sa flamme est passée dans l'arme.
          s.tint = 0x6b7285;
          this.light(lightX(poi.x), lightY(poi.y - 6), 20);
        } else {
          g.circle(poi.x, poi.y, ev.brazier.radius).stroke({ width: 1, color: C.ember, alpha: 0.35 + Math.sin(time * 4) * 0.1 });
          if (poi.state === 1) {
            const frac = Math.min(1, poi.progress / ev.brazier.seconds);
            g.moveTo(poi.x, poi.y).arc(poi.x, poi.y, ev.brazier.radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).closePath()
              .fill({ color: C.ember, alpha: 0.16 });
            this.light(lightX(poi.x), lightY(poi.y - 8), 24 + frac * 50);
          }
        }
      } else if (poi.kind === 'spring') {
        s.texture = this.atlas.get('poi-source');
        if (poi.state === 2) s.tint = 0x7f8a9a;
        else this.light(lightX(poi.x), lightY(poi.y), 44);
      } else if (poi.kind === 'cache') {
        s.texture = this.atlas.get('poi-cache');
        if (poi.state === 2) s.tint = 0x6b7285;
      } else if (poi.kind === 'totem') {
        s.texture = this.atlas.get('poi-totem');
        if (poi.state === 2) {
          s.tint = 0x6b7285;
        } else {
          g.circle(poi.x, poi.y, ev.totem.radius).stroke({ width: 1, color: C.teal, alpha: 0.35 + Math.sin(time * 4) * 0.1 });
          if (poi.state === 1) {
            const frac = Math.min(1, poi.progress / ev.totem.seconds);
            g.moveTo(poi.x, poi.y).arc(poi.x, poi.y, ev.totem.radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).closePath()
              .fill({ color: C.teal, alpha: 0.14 });
          }
          this.light(lightX(poi.x), lightY(poi.y - 6), 40);
        }
      } else if (poi.kind === 'smith' || poi.kind === 'herbalist') {
        const cfg = poi.kind === 'smith' ? ev.smith : ev.herbalist;
        s.texture = this.atlas.get(poi.kind === 'smith' ? 'poi-ferrailleur' : 'poi-herboriste');
        g.circle(poi.x, poi.y, cfg.radius).stroke({ width: 1, color: C.emberPale, alpha: 0.4 });
        if (poi.progress > 0) {
          const frac = Math.min(1, poi.progress / cfg.dwell);
          g.moveTo(poi.x, poi.y).arc(poi.x, poi.y, cfg.radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).closePath()
            .fill({ color: C.emberPale, alpha: 0.2 });
        }
        this.light(lightX(poi.x), lightY(poi.y - 4), 54);
      } else if (poi.kind === 'treasure') {
        s.texture = this.atlas.get('poi-tresor');
        if (poi.state === 2) s.tint = 0x6b7285;
        else this.light(lightX(poi.x), lightY(poi.y), 30);
      } else {
        s.texture = this.atlas.get('poi-portail');
        s.position.set(poi.x, poi.y + 22);
        this.light(lightX(poi.x), lightY(poi.y), 84 + Math.round(Math.sin(time * 4) * 3), 0.14);
      }
    }

    // Zones au sol du joueur : tons Braise, pâles, sous les ennemis.
    const z = run.zones;
    for (let i = 0; i < z.count; i++) {
      const fade = Math.min(1, z.life[i]! / 0.4);
      const flick = 0.85 + Math.sin(time * 9 + i) * 0.15;
      g.circle(z.x[i]!, z.y[i]!, z.radius[i]!).fill({ color: C.emberDark, alpha: 0.22 * fade });
      g.circle(z.x[i]!, z.y[i]!, z.radius[i]! * 0.7 * flick).fill({ color: C.emberHot, alpha: 0.2 * fade });
      g.circle(z.x[i]!, z.y[i]!, z.radius[i]!).stroke({ width: 1, color: C.ember, alpha: 0.45 * fade });
      this.light(lightX(z.x[i]!), lightY(z.y[i]!), z.radius[i]! + 14);
    }

    // Annonces d'attaque : magenta, hachurées, qui se remplissent pendant le délai.
    const tg = run.telegraphs;
    for (let i = 0; i < tg.count; i++) {
      // Une annonce différée n'est encore qu'un contour pâle : on voit venir la suite sans la confondre avec ce qui frappe.
      const waiting = tg.t[i]! < 0;
      const frac = waiting ? 0 : Math.min(1, tg.t[i]! / tg.duration[i]!);
      if (tg.shape[i] === TG_RING) {
        const inner = tg.length[i]!;
        const outer = tg.width[i]!;
        const w = outer - inner;
        if (!waiting) {
          g.circle(tg.x[i]!, tg.y[i]!, (inner + outer) / 2).stroke({ width: w, color: C.danger, alpha: 0.12 });
          // Le remplissage part du bord intérieur, comme l'onde qui vient du Cerf.
          if (frac > 0) g.circle(tg.x[i]!, tg.y[i]!, inner + (w * frac) / 2).stroke({ width: w * frac, color: C.danger, alpha: 0.22 });
        }
        const edge = waiting ? 0.3 : 0.9;
        g.circle(tg.x[i]!, tg.y[i]!, outer).stroke({ width: 1, color: C.danger, alpha: edge });
        g.circle(tg.x[i]!, tg.y[i]!, inner).stroke({ width: 1, color: C.danger, alpha: edge });
        if (!waiting) g.circle(tg.x[i]!, tg.y[i]!, inner + w / 2).stroke({ width: 1, color: C.dangerDark, alpha: 0.5 });
      } else if (waiting) {
        if (tg.shape[i] === TG_CIRCLE) {
          g.circle(tg.x[i]!, tg.y[i]!, tg.width[i]!).stroke({ width: 1, color: C.danger, alpha: 0.3 });
        } else {
          const a = tg.angle[i]!;
          const len = tg.length[i]!;
          g.moveTo(tg.x[i]!, tg.y[i]!).lineTo(tg.x[i]! + Math.cos(a) * len, tg.y[i]! + Math.sin(a) * len)
            .stroke({ width: tg.width[i]!, color: C.danger, alpha: 0.07 });
        }
      } else if (tg.shape[i] === TG_CIRCLE) {
        const r = tg.width[i]!;
        g.circle(tg.x[i]!, tg.y[i]!, r).fill({ color: C.danger, alpha: 0.12 });
        g.circle(tg.x[i]!, tg.y[i]!, r * frac).fill({ color: C.danger, alpha: 0.22 });
        g.circle(tg.x[i]!, tg.y[i]!, r).stroke({ width: 1, color: C.danger, alpha: 0.9 });
        for (let ring = 1; ring <= 3; ring++) g.circle(tg.x[i]!, tg.y[i]!, (r * ring) / 4).stroke({ width: 1, color: C.dangerDark, alpha: 0.5 });
      } else {
        const a = tg.angle[i]!;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const nx = -uy * (tg.width[i]! / 2);
        const ny = ux * (tg.width[i]! / 2);
        const x0 = tg.x[i]!;
        const y0 = tg.y[i]!;
        const len = tg.length[i]!;
        g.poly([x0 + nx, y0 + ny, x0 + ux * len + nx, y0 + uy * len + ny, x0 + ux * len - nx, y0 + uy * len - ny, x0 - nx, y0 - ny])
          .fill({ color: C.danger, alpha: 0.12 });
        const fl = len * frac;
        g.poly([x0 + nx, y0 + ny, x0 + ux * fl + nx, y0 + uy * fl + ny, x0 + ux * fl - nx, y0 + uy * fl - ny, x0 - nx, y0 - ny])
          .fill({ color: C.danger, alpha: 0.24 });
        g.poly([x0 + nx, y0 + ny, x0 + ux * len + nx, y0 + uy * len + ny, x0 + ux * len - nx, y0 + uy * len - ny, x0 - nx, y0 - ny])
          .stroke({ width: 1, color: C.danger, alpha: 0.9 });
        // Hachures : le danger ne se lit pas par la seule couleur.
        for (let d = 10; d < len; d += 12) {
          g.moveTo(x0 + ux * d + nx, y0 + uy * d + ny).lineTo(x0 + ux * (d - 8) - nx, y0 + uy * (d - 8) - ny)
            .stroke({ width: 1, color: C.dangerDark, alpha: 0.55 });
        }
      }
    }

    // Arène du boss.
    const d = run.director;
    if (d.bossSpawned && !d.bossDead) {
      g.circle(d.arenaX, d.arenaY, d.arenaR).stroke({ width: 3, color: C.dangerDark, alpha: 0.7 });
      g.circle(d.arenaX, d.arenaY, d.arenaR + 4).stroke({ width: 1, color: C.danger, alpha: 0.5 + Math.sin(time * 3) * 0.2 });
    }

    // Ramassables.
    const p = run.pickups;
    for (let i = 0; i < p.count; i++) {
      const s = this.pickupSprites[i]!;
      const x = p.px[i]! + (p.x[i]! - p.px[i]!) * alpha;
      const y = p.py[i]! + (p.y[i]! - p.py[i]!) * alpha;
      if (x < camX - 16 || x > camX + VIEW_W + 16 || y < camY - 16 || y > camY + VIEW_H + 16) {
        s.visible = false;
        continue;
      }
      const kind = p.kind[i]!;
      let tex = this.pickupTextures[kind]!;
      if (kind === PK_GEM) {
        const v = p.value[i]!;
        const gems = run.data.tuning.gems;
        tex = v >= gems.large ? this.atlas.get('pickup-gem-large') : v >= gems.medium ? this.atlas.get('pickup-gem-medium') : tex;
      }
      s.texture = tex;
      const bob = kind === PK_CHEST ? 0 : Math.round(Math.sin(time * 4 + i * 0.7));
      s.position.set(Math.round(x), Math.round(y) + bob);
      s.visible = true;
      if (kind === PK_CHEST) this.light(lightX(x), lightY(y), 26);
      else if (kind === PK_PIECE) this.light(lightX(x), lightY(y), 18, 0.25);
      else if (kind === PK_CALL || kind === PK_DROP || kind === PK_RED_GEM) this.light(lightX(x), lightY(y), 12);
      else this.light(lightX(x), lightY(y), 6);
    }
    for (let i = p.count; i < this.shownPickups; i++) this.pickupSprites[i]!.visible = false;
    this.shownPickups = p.count;

    // Ennemis : une direction, retournée ; clignotement blanc d'une image quand ils sont touchés.
    const e = run.enemies;
    const defs = run.data.enemies;
    for (let i = 0; i < e.count; i++) {
      const s = this.enemySprites[i]!;
      const x = e.px[i]! + (e.x[i]! - e.px[i]!) * alpha;
      const y = e.py[i]! + (e.y[i]! - e.py[i]!) * alpha;
      const kind = e.kind[i]!;
      if (x < camX - 70 || x > camX + VIEW_W + 70 || y < camY - 70 || y > camY + VIEW_H + 110) {
        s.visible = false;
        continue;
      }
      const frames = e.flash[i]! > 0 ? this.enemyWhite[kind]! : this.enemyFrames[kind]!;
      const frozen = (e.status[i]! & ST_FROZEN) !== 0;
      const frame = frozen ? 0 : Math.floor(time * 10 + (e.uid[i]! % 7)) % frames.length;
      s.texture = frames[frame]!;
      s.anchor.set(0.5, this.enemyAnchor[kind]!);
      s.scale.x = e.facing[i]! < 0 ? -1 : 1;
      s.position.set(Math.round(x), Math.round(y));
      s.zIndex = y;
      const st = e.status[i]!;
      s.tint = st & ST_FROZEN || st & ST_SLOW ? 0x9fd8ff : st & ST_BURN ? 0xffc79a : 0xffffff;
      s.alpha = 1;
      s.visible = true;
      const def = defs[kind]!;
      const dir = run.director;
      if (dir.bossReformT > 0 && e.uid[i] === dir.bossUid && def.reform) {
        // En poussière : il s'efface presque, de la cendre s'en échappe, puis il se recompose.
        const k = 1 - dir.bossReformT / def.reform.duration;
        s.texture = frames[0]!;
        s.tint = 0x9aa3b5;
        s.alpha = k < 0.35 ? 1 - (k / 0.35) * 0.85 : k < 0.7 ? 0.15 : 0.15 + ((k - 0.7) / 0.3) * 0.85;
        if (Math.random() < 0.3) this.puff(x + (Math.random() - 0.5) * 60, y - Math.random() * 50, this.puffFrames, 0x9aa3b5, 8);
      }
      if (def.rank === 'elite') {
        // Barre de vie : seulement sur les élites (le boss a la sienne dans l'interface).
        const w = 30;
        const frac = Math.max(0, e.hp[i]! / e.maxHp[i]!);
        top2.rect(x - w / 2 - 1, y - 40, w + 2, 4).fill({ color: C.night, alpha: 0.9 });
        top2.rect(x - w / 2, y - 39, w * frac, 2).fill({ color: C.danger });
      }
    }
    for (let i = e.count; i < this.shownEnemies; i++) this.enemySprites[i]!.visible = false;
    this.shownEnemies = e.count;

    // Héros.
    const frames = hero.moving || hero.dashT > 0 ? this.heroWalk[hero.facing]! : this.heroIdle[hero.facing]!;
    const rate = hero.moving ? 12 : 5;
    this.hero.texture = tuto && tuto.heroPose !== ''
      ? this.atlas.get(`${this.heroSprite}-pose-${tuto.heroPose}`)
      : frames[Math.floor(animTime * rate) % frames.length]!;
    this.hero.position.set(Math.round(hx), Math.round(hy));
    this.hero.zIndex = hy;
    const blink = hero.invuln > 0 && hero.dashT <= 0 && Math.floor(time * 20) % 2 === 0;
    this.hero.alpha = run.phase === 'dead' ? Math.max(0, 1 - this.deathFade * 1.5) : blink ? 0.35 : 1;
    this.hero.tint = hero.invuln > 0 && hero.dashT <= 0 ? 0xff9ac0 : hero.buffT > 0 ? 0xffdfae : 0xffffff;
    for (let k = 0; k < this.ghost.length; k++) {
      const gs = this.ghost[k]!;
      if (hero.dashT > 0) {
        gs.visible = true;
        gs.texture = this.hero.texture;
        gs.position.set(Math.round(hx - hero.dashX * (k + 1) * 9), Math.round(hy - hero.dashY * (k + 1) * 9));
        gs.alpha = 0.4 - k * 0.11;
        gs.tint = C.ember;
        gs.zIndex = hy - 1;
      } else {
        gs.visible = false;
      }
    }
    // Cream : il marche, s'assoit quand il attend, prend la pose de la ligne de dialogue. Pas d'ombre.
    if (tuto) {
      const guide = tuto.guide;
      const cream = this.cream;
      let flip = 1;
      if (guide.pose !== '') {
        cream.texture = this.atlas.get(`cream-pose-${guide.pose}`);
      } else if (guide.moving && !talking) {
        const walk = this.creamWalk[guide.facing]!;
        cream.texture = walk[Math.floor(animTime * 12) % walk.length]!;
      } else {
        // Assis de trois quarts, la tête à gauche sur l'image : retourné quand Moon est à droite.
        cream.texture = this.atlas.get('cream-sit');
        if (hx > gx) flip = -1;
      }
      cream.scale.x = flip;
      cream.position.set(Math.round(gx), Math.round(gy));
      cream.zIndex = gy;
      cream.visible = true;
      this.creamPale.texture = cream.texture;
      this.creamPale.scale.x = flip;
      this.creamPale.position.copyFrom(cream.position);
      this.creamPale.visible = true;
      this.drawEmote(this.emotes[0]!, tuto.emoteMoon, hx, hy - EMOTE_UP_MOON, dt);
      this.drawEmote(this.emotes[1]!, tuto.emoteCream, gx, gy - EMOTE_UP_CREAM, dt);
    }
    // Anneau de rechargement de la ruée, sous le héros.
    const dash = run.data.tuning.dash;
    if (hero.dashCd > 0) {
      const frac = 1 - hero.dashCd / dash.cooldown;
      g.moveTo(hx + 9, hy + 1).arc(hx, hy + 1, 9, 0, frac * Math.PI * 2).stroke({ width: 1, color: C.emberPale, alpha: 0.7 });
    } else {
      g.circle(hx, hy + 1, 9).stroke({ width: 1, color: C.ember, alpha: 0.35 });
    }
    // Ultime en cours : un tourbillon autour du héros.
    if (hero.ultT > 0) {
      const r = run.cls.ultimate.radius;
      for (let k = 0; k < 3; k++) {
        const a0 = time * 14 + (k * Math.PI * 2) / 3;
        top2.moveTo(hx + Math.cos(a0) * r, hy - 6 + Math.sin(a0) * r * 0.85).arc(hx, hy - 6, r, a0, a0 + 1.3)
          .stroke({ width: 3, color: C.emberHot, alpha: 0.55 });
      }
      g.circle(hx, hy - 6, r).fill({ color: C.emberHot, alpha: 0.1 });
      this.light(lightX(hx), lightY(hy), r + 20);
    }
    if (hero.buffT > 0) g.circle(hx, hy, 12 + Math.sin(time * 10) * 1.5).stroke({ width: 1, color: C.emberHot, alpha: 0.6 });

    // Lucioles en orbite.
    let oi = 0;
    for (const w of run.weapons) {
      const def = run.data.weapons[w.def]!;
      if (def.behavior !== 'orbit' || w.phase === 0) continue;
      const count = weaponParams(run, w).count;
      for (let k = 0; k < count && oi < this.orbSprites.length; k++) {
        const o = orbPosition(run, w, k, hx, hy);
        const s = this.orbSprites[oi++]!;
        s.position.set(Math.round(o.x), Math.round(o.y));
        s.visible = true;
        s.alpha = 0.9;
        this.light(lightX(o.x), lightY(o.y), 12);
      }
    }
    for (; oi < this.orbSprites.length; oi++) this.orbSprites[oi]!.visible = false;

    // Projectiles du joueur.
    const sh = run.shots;
    for (let i = 0; i < sh.count; i++) {
      const s = this.shotSprites[i]!;
      let x = sh.px[i]! + (sh.x[i]! - sh.px[i]!) * alpha;
      let y = sh.py[i]! + (sh.y[i]! - sh.py[i]!) * alpha;
      const sprite = sh.sprite[i]!;
      s.texture = this.shotTextures[sprite]!;
      if (sh.kind[i] === SHOT_LOB) {
        // Un lobé monte puis retombe : la hauteur est un effet de rendu.
        const total = sh.t[i]! || 1;
        const k = 1 - sh.life[i]! / total;
        y -= Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 42;
        s.rotation = time * 12;
      } else {
        s.rotation = sprite === 1 ? Math.atan2(sh.vy[i]!, sh.vx[i]!) : 0;
      }
      x = Math.round(x);
      y = Math.round(y);
      s.position.set(x, y);
      s.alpha = 0.9;
      s.visible = true;
      if (sprite !== 1) this.light(lightX(x), lightY(y), 12);
    }
    for (let i = sh.count; i < this.shownShots; i++) this.shotSprites[i]!.visible = false;
    this.shownShots = sh.count;
    // Projectiles ennemis : magenta plein, toujours au-dessus.
    const es = run.enemyShots;
    for (let i = 0; i < es.count; i++) {
      const s = this.enemyShotSprites[i]!;
      s.position.set(Math.round(es.px[i]! + (es.x[i]! - es.px[i]!) * alpha), Math.round(es.py[i]! + (es.y[i]! - es.py[i]!) * alpha));
      s.visible = true;
    }
    for (let i = es.count; i < this.shownEnemyShots; i++) this.enemyShotSprites[i]!.visible = false;
    this.shownEnemyShots = es.count;

    this.drawFx(run, dt, paused, top2, g, hx, hy, camX, camY);
    this.drawOverlay(run, time, camX, camY);

    // La lueur : un disque chaud autour de la lanterne ; son rayon est la statistique Lueur plus 24 px.
    let glow = hero.stats.glow + 24 + Math.round(Math.sin(time * 1.6) * 2);
    if (run.phase === 'dead') {
      this.deathFade = Math.min(1.2, this.deathFade + dt * 0.8);
      glow *= Math.max(0, 1 - this.deathFade);
      this.darkness.alpha = Math.min(1, run.region.darkness.opacity + this.deathFade * 0.5);
    }
    // Dernière lueur : le disque rougit sous son seuil, plus ou moins selon le réglage des flashs.
    const last = lowHp(run) && this.settings.flashes > 0;
    const warmth = last ? 0.1 + 0.18 * this.settings.flashes : 0.1;
    this.light(lightX(hx), lightY(hy - 8), glow, run.phase === 'dead' ? 0 : warmth, last ? C.emberDark : C.emberHot);
    // Retour à l'entrée de la salle après une chute : un fondu court depuis le noir.
    if (this.respawnFade > 0) {
      this.screenFx.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: Math.min(1, this.respawnFade) });
      this.respawnFade = Math.max(0, this.respawnFade - dt * 2.2);
    }
    this.renderLight();
    this.app.renderer.render(this.app.stage);
  }

  /** Une bulle au-dessus d'une tête, avec un petit rebond quand elle apparaît ou change. */
  private drawEmote(em: EmoteFx, name: string, x: number, y: number, dt: number): void {
    if (name === '') {
      em.name = '';
      em.sprite.visible = false;
      return;
    }
    if (name !== em.name) {
      em.name = name;
      em.t = 0;
      em.sprite.texture = this.atlas.get(`emote-${name}`);
    }
    em.t += dt;
    const k = Math.min(1, em.t / 0.32);
    const hop = Math.sin(k * Math.PI) * 6;
    em.sprite.position.set(Math.round(x), Math.round(y - hop));
    em.sprite.visible = true;
  }

  /** Les racines qui jaillissent le long d'une ligne frappée, de son origine vers son bout. */
  private drawRootSpikes(ground: Graphics, f: Fx, camX: number, camY: number): void {
    const ux = Math.cos(f.a);
    const uy = Math.sin(f.a);
    const len = f.b;
    const width = f.c;
    for (let d = 10; d < len; d += 13) {
      // Le jaillissement court le long de la ligne en 0,12 s, puis chaque racine pousse et retombe.
      const local = (f.t - (d / len) * 0.12) / 0.5;
      if (local <= 0 || local >= 1) continue;
      const h = hash(d * 12.9898 + f.x * 0.37 + f.y * 0.11);
      const side = (h - 0.5) * width * 0.7;
      const px = f.x + ux * d - uy * side;
      const py = f.y + uy * d + ux * side;
      const rise = local < 0.2 ? local / 0.2 : 1 - (local - 0.2) / 0.8;
      const tall = (9 + h * 11) * rise;
      const lean = (hash(h * 91.7) - 0.5) * 6;
      const base = 2.5 + h * 1.5;
      ground.poly([px - base, py, px + base, py, px + lean, py - tall]).fill({ color: ROOT_DARK, alpha: 0.95 });
      ground.moveTo(px + base * 0.3, py - 1).lineTo(px + lean, py - tall).stroke({ width: 1, color: C.danger, alpha: 0.7 * rise });
    }
    // La lueur de l'impact : sans elle, le coup se perd dans le noir de la forêt.
    if (f.t < 0.3) {
      const glow = 1 - f.t / 0.3;
      for (let d = 30; d < len; d += 70) this.light(f.x + ux * d - camX, f.y + uy * d - camY, Math.round(26 * glow), 0.08);
    }
  }

  private drawFx(run: Run, dt: number, paused: boolean, top: Graphics, ground: Graphics, hx: number, hy: number, camX: number, camY: number): void {
    for (let i = this.fxCount - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      if (!paused) f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const fade = 1 - k;
      switch (f.type) {
        case FX_ARC: {
          // L'arc de la lame : pâle et sans contour, pour laisser voir les dangers.
          const range = Math.abs(f.c);
          const half = (f.b * Math.PI) / 360;
          const sweep = f.c < 0 ? 1 - k : k;
          if (f.b >= 360) {
            top.circle(hx, hy - 4, range).stroke({ width: 6, color: C.ember, alpha: 0.5 * fade });
            top.circle(hx, hy - 4, range - 5).stroke({ width: 2, color: C.emberWhite, alpha: 0.6 * fade });
          } else {
            const a0 = f.a - half;
            const a1 = f.a - half + half * 2 * Math.min(1, sweep * 1.6 + 0.3);
            top.moveTo(hx + Math.cos(a0) * range, hy - 4 + Math.sin(a0) * range).arc(hx, hy - 4, range, a0, a1)
              .stroke({ width: 7, color: C.ember, alpha: 0.5 * fade });
            top.moveTo(hx + Math.cos(a0) * (range - 3), hy - 4 + Math.sin(a0) * (range - 3)).arc(hx, hy - 4, range - 3, a0, a1)
              .stroke({ width: 2, color: C.emberWhite, alpha: 0.7 * fade });
            ground.moveTo(hx, hy - 4).arc(hx, hy - 4, range, f.a - half, f.a + half).closePath().fill({ color: C.emberPale, alpha: 0.1 * fade });
          }
          break;
        }
        case FX_RING:
          top.circle(f.x, f.y, f.a * (0.25 + 0.75 * k)).stroke({ width: f.c, color: f.b, alpha: 0.7 * fade });
          break;
        case FX_BURST:
          ground.circle(f.x, f.y, f.a * (0.5 + 0.5 * k)).fill({ color: f.b, alpha: 0.35 * fade });
          top.circle(f.x, f.y, f.a * (0.5 + 0.5 * k)).stroke({ width: 2, color: C.emberPale, alpha: 0.6 * fade });
          break;
        case FX_FISSURE: {
          const len = f.b * Math.min(1, k * 3);
          ground.moveTo(f.x, f.y).lineTo(f.x + Math.cos(f.a) * len, f.y + Math.sin(f.a) * len).stroke({ width: f.c, color: C.emberDark, alpha: 0.4 * fade });
          ground.moveTo(f.x, f.y).lineTo(f.x + Math.cos(f.a) * len, f.y + Math.sin(f.a) * len).stroke({ width: 2, color: C.emberPale, alpha: 0.8 * fade });
          break;
        }
        case FX_TELE_CIRCLE: {
          // Un éclair plein, puis le sol fendu en étoile qui s'efface, et la poussière qui s'éloigne.
          const flash = Math.max(0, 1 - f.t / 0.14);
          if (flash > 0) ground.circle(f.x, f.y, f.a).fill({ color: C.danger, alpha: 0.55 * flash });
          ground.circle(f.x, f.y, f.a).fill({ color: ROOT_DARK, alpha: 0.35 * fade });
          ground.circle(f.x, f.y, f.a * (0.6 + 0.5 * k)).stroke({ width: 3, color: C.danger, alpha: 0.6 * fade });
          for (let s = 0; s < 7; s++) {
            const a = s * 0.9 + hash(f.x + s) * 0.6;
            const r = f.a * (0.55 + hash(f.y + s) * 0.45);
            ground.moveTo(f.x, f.y).lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r).stroke({ width: 2, color: C.dangerDark, alpha: 0.8 * fade });
          }
          if (f.t < 0.25) this.light(f.x - camX, f.y - camY, Math.round(f.a * 0.8 * (1 - f.t / 0.25)), 0.08);
          break;
        }
        case FX_TELE_RING: {
          // L'onde : un front qui file vers l'extérieur de l'anneau et laisse un sillon sombre.
          const inner = f.a;
          const outer = f.b;
          const flash = Math.max(0, 1 - f.t / 0.14);
          const mid = (inner + outer) / 2;
          if (flash > 0) ground.circle(f.x, f.y, mid).stroke({ width: outer - inner, color: C.danger, alpha: 0.5 * flash });
          ground.circle(f.x, f.y, mid).stroke({ width: (outer - inner) * 0.6, color: ROOT_DARK, alpha: 0.3 * fade });
          const front = inner + (outer - inner) * Math.min(1, k * 1.6);
          ground.circle(f.x, f.y, front).stroke({ width: 3, color: C.danger, alpha: 0.75 * fade });
          ground.circle(f.x, f.y, front - 4).stroke({ width: 1, color: C.emberWhite, alpha: 0.5 * fade });
          break;
        }
        case FX_TELE_LINE: {
          const ux = Math.cos(f.a);
          const uy = Math.sin(f.a);
          const ex = f.x + ux * f.b;
          const ey = f.y + uy * f.b;
          const flash = Math.max(0, 1 - f.t / 0.14);
          if (flash > 0) ground.moveTo(f.x, f.y).lineTo(ex, ey).stroke({ width: f.c, color: C.danger, alpha: 0.6 * flash });
          // Le sillon : le sol ouvert reste visible un moment après le coup.
          ground.moveTo(f.x, f.y).lineTo(ex, ey).stroke({ width: f.c * 0.55, color: ROOT_DARK, alpha: 0.55 * fade });
          ground.moveTo(f.x, f.y).lineTo(ex, ey).stroke({ width: 1, color: C.dangerDark, alpha: 0.8 * fade });
          this.drawRootSpikes(ground, f, camX, camY);
          break;
        }
        case FX_TRAIL:
          ground.moveTo(f.x, f.y).lineTo(f.x + Math.cos(f.a) * 110, f.y + Math.sin(f.a) * 110).stroke({ width: 4, color: C.ember, alpha: 0.3 * fade });
          break;
        case FX_EDGE: {
          // Un tracé rouge sur le bord de l'écran, du côté d'où vient la vague.
          const s = this.screenFx;
          const pulse = 0.45 + Math.sin(f.t * 18) * 0.25;
          if (f.b > 0) {
            s.rect(0, 0, VIEW_W, 3).fill({ color: C.danger, alpha: pulse });
            s.rect(0, VIEW_H - 3, VIEW_W, 3).fill({ color: C.danger, alpha: pulse });
            s.rect(0, 0, 3, VIEW_H).fill({ color: C.danger, alpha: pulse });
            s.rect(VIEW_W - 3, 0, 3, VIEW_H).fill({ color: C.danger, alpha: pulse });
          } else {
            const ux = Math.cos(f.a);
            const uy = Math.sin(f.a);
            if (Math.abs(ux) > Math.abs(uy)) s.rect(ux > 0 ? VIEW_W - 4 : 0, VIEW_H * 0.2, 4, VIEW_H * 0.6).fill({ color: C.danger, alpha: pulse });
            else s.rect(VIEW_W * 0.2, uy > 0 ? VIEW_H - 4 : 0, VIEW_W * 0.6, 4).fill({ color: C.danger, alpha: pulse });
          }
          break;
        }
      }
      if (f.t >= f.dur) {
        const last = this.fx[--this.fxCount]!;
        this.fx[i] = last;
        this.fx[this.fxCount] = f;
      }
    }
    for (const pf of this.puffs) {
      if (pf.t < 0) continue;
      if (!paused) pf.t += dt;
      const frame = Math.floor(pf.t * pf.rate);
      if (frame >= pf.frames.length) {
        pf.t = -1;
        pf.sprite.visible = false;
      } else {
        pf.sprite.texture = pf.frames[frame]!;
      }
    }
    for (const n of this.numbers) {
      if (n.t < 0) continue;
      if (!paused) n.t += dt;
      if (n.t > 0.6) {
        n.t = -1;
        n.box.visible = false;
        continue;
      }
      n.box.position.set(Math.round(n.x), Math.round(n.y - n.t * 22));
      n.box.alpha = n.t > 0.4 ? 1 - (n.t - 0.4) / 0.2 : 1;
    }
  }

  /** Flèches vers ce qui est hors champ : élites, boss, point d'intérêt suivi, portail. */
  private drawOverlay(run: Run, time: number, camX: number, camY: number): void {
    let used = 0;
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const arrow = (wx: number, wy: number, tint: number): void => {
      if (used >= this.arrows.length) return;
      const sx = wx - camX;
      const sy = wy - camY;
      if (sx > 8 && sx < VIEW_W - 8 && sy > 8 && sy < VIEW_H - 8) return;
      const a = Math.atan2(sy - cy, sx - cx);
      const s = this.arrows[used++]!;
      const k = Math.min((cx - 14) / Math.abs(Math.cos(a) || 1e-6), (cy - 14) / Math.abs(Math.sin(a) || 1e-6));
      s.position.set(Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k));
      s.rotation = a + Math.PI / 2;
      s.tint = tint;
      s.alpha = 0.75 + Math.sin(time * 6) * 0.2;
      s.visible = true;
    };
    const e = run.enemies;
    for (let i = 0; i < e.count; i++) {
      if (run.data.enemies[e.kind[i]!]!.rank !== 'normal') arrow(e.x[i]!, e.y[i]!, C.danger);
    }
    // Le point d'intérêt le plus proche encore à faire, ou le portail.
    let target: { x: number; y: number } | null = null;
    let best = Infinity;
    // En tutoriel, la flèche montre là où l'étape attend le joueur, et rien pendant un dialogue.
    if (run.tutorial) {
      if (run.phase !== 'dialogue') target = tutorialTarget(run);
    } else for (const poi of run.map.pois) {
      // Les marchands ne sont jamais « à faire » : la flèche ne les montre pas.
      if (poi.state === 2 || poi.kind === 'smith' || poi.kind === 'herbalist') continue;
      if (poi.kind === 'portal' || poi.kind === 'memory') {
        target = poi;
        break;
      }
      const dist = Math.hypot(poi.x - run.hero.x, poi.y - run.hero.y);
      if (dist < best) {
        best = dist;
        target = poi;
      }
    }
    if (target && !(run.director.bossSpawned && !run.director.bossDead)) arrow(target.x, target.y, C.emberPale);
    const p = run.pickups;
    for (let i = 0; i < p.count; i++) if (p.kind[i] === PK_CHEST || p.kind[i] === PK_PIECE) arrow(p.x[i]!, p.y[i]!, C.ember);
    for (; used < this.arrows.length; used++) this.arrows[used]!.visible = false;
  }

  /** Une image noire : ce qu'on voit pendant qu'une cinématique charge. */
  drawBlank(): void {
    this.app.renderer.render(this.blank);
  }

  /** Efface le tracé d'écran (appelé au début de chaque image). */
  beginFrame(): void {
    this.screenFx.clear();
  }

  /** Le décor du refuge, construit une fois : sol, arbres, braséro, flamme, et les personnages. */
  /** Où le contenu place cet objet du refuge. */
  private campPlace(id: string): { x: number; y: number } {
    return this.campDef.objects.find((o) => o.id === id) ?? { x: 320, y: 200 };
  }

  private buildCamp(): void {
    if (this.campBuilt) return;
    this.campBuilt = true;
    const a = this.atlas;
    // Les personnages d'une scène passent devant ou derrière le décor selon leur hauteur.
    this.camp.sortableChildren = true;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 20; x++) {
        const near = Math.hypot(x - 9.5, y - 6.5);
        const mask = near < 3.2 ? 15 : near < 4.2 ? [7, 11, 13, 14][(x + y) % 4]! : 0;
        const s = new Sprite(a.get(`tile-bois-${mask}`));
        s.position.set(x * 32, y * 32 - 12);
        s.zIndex = -10000;
        this.camp.addChild(s);
      }
    }
    const prop = (name: string, x: number, y: number): void => {
      const s = new Sprite(a.get(name));
      s.anchor.set(0.5, 0.92);
      s.position.set(x, y);
      s.zIndex = y;
      this.camp.addChild(s);
    };
    prop('decor-arbre', 60, 120); prop('decor-arbre', 130, 70); prop('decor-arbre', 560, 110); prop('decor-arbre', 600, 230);
    prop('decor-arbre', 30, 300); prop('decor-rochers', 500, 300); prop('decor-souche', 150, 290); prop('decor-ruine', 470, 110);
    prop('decor-arbre', 250, 52); prop('decor-arbre', 410, 60); prop('decor-rochers', 90, 210);
    const fire = this.campPlace('fire');
    prop('poi-brasero', fire.x, fire.y);
    for (const [id, look] of Object.entries(CAMP_LOOKS)) {
      const at = this.campPlace(id);
      const s = new Sprite(a.get(look.sprite));
      s.anchor.set(0.5, 1);
      s.position.set(at.x, at.y + look.down);
      s.zIndex = at.y;
      this.camp.addChild(s);
      this.campObjects.set(id, s);
    }
    this.campFlame = new Sprite(this.flameFrames[0]!);
    this.campFlame.anchor.set(0.5, 1);
    this.campFlame.position.set(fire.x, fire.y - 20);
    this.campFlame.zIndex = fire.y + 1;
    this.camp.addChild(this.campFlame);
    this.campHero = new Sprite(Texture.EMPTY);
    this.campHero.anchor.set(0.5, 0.8);
    this.campHero.position.set(CAMP_MOON.x, CAMP_MOON.y);
    this.campHero.zIndex = CAMP_MOON.y;
    this.camp.addChild(this.campHero);
    // Cream, couché contre une lanterne allumée, de l'autre côté du feu.
    this.campCream = new Sprite(a.get('camp-cream'));
    this.campCream.anchor.set(0.5, 0.85);
    this.campCream.position.set(CAMP_CREAM.x, CAMP_CREAM.y);
    this.campCream.zIndex = CAMP_CREAM.y;
    this.camp.addChild(this.campCream);
    // Les personnages d'une scène de route, et leurs bulles.
    this.sceneCream = new Sprite(Texture.EMPTY);
    this.sceneCream.anchor.set(0.5, CREAM_ANCHOR);
    this.camp.addChild(this.sceneCream);
    for (let i = 0; i < 2; i++) {
      const s = new Sprite(Texture.EMPTY);
      s.anchor.set(0.5, 1);
      s.zIndex = 10000;
      this.camp.addChild(s);
      this.sceneEmotes.push({ sprite: s, name: '', t: 0 });
    }
  }

  /** Ce qui est commun au refuge et aux scènes : le décor, la flamme (`fire` de 0 à 1), la nuit. */
  private campBase(t: number, lit: boolean, fire: number): void {
    this.buildCamp();
    this.currentRun = null;
    this.camp.visible = true;
    this.world.visible = false;
    this.numberLayer.visible = false;
    this.screen.visible = false;
    this.campFlame.texture = this.flameFrames[Math.floor(t * 10) % this.flameFrames.length]!;
    this.campFlame.visible = fire > 0;
    this.campFlame.scale.set((lit ? 2 : 1) * fire);
    this.darkness.tint = C.night;
    this.darkness.alpha = (lit ? 0.4 : 0.52) + (1 - fire) * 0.12;
    this.lightCount = 0;
    this.warmCount = 0;
    if (fire > 0) {
      // Le feu est sur le côté, mais c'est toute la clairière qu'il éclaire.
      const b = this.campDef.bounds;
      this.light(b.x + 20, b.y - 24, Math.round(((lit ? 150 : 104) + Math.sin(t * 3) * 2) * fire), 0.1);
      const at = this.campPlace('fire');
      this.light(at.x, at.y - 20, Math.round((lit ? 60 : 44) * fire), 0.12);
    }
  }

  /** Le camp : le fond des menus, entre deux expéditions. */
  drawCamp(timeMs: number, lit: boolean, heroSprite: string, cream: boolean, view: CampView): void {
    const t = timeMs / 1000;
    this.campBase(t, lit, 1);
    this.campFade = Math.min(1, this.campFade + view.dt);
    for (const [id, s] of this.campObjects) {
      // La lanterne est dans l'image de Cream couché : seule, elle ne se montre que sans lui.
      s.visible = view.visible.has(id) && !(id === 'lantern' && cream);
      s.alpha = this.campFade;
    }
    this.campObjects.get('door')!.texture = this.atlas.get(view.doorOpen ? 'camp-door-open' : 'camp-door');
    this.sceneFire = 1;
    this.sceneCream.visible = false;
    for (const em of this.sceneEmotes) em.sprite.visible = false;
    this.campCream.visible = cream;
    this.campHero.visible = true;
    const moon = view.moon ?? { ...CAMP_MOON, facing: 1, moving: false };
    this.campHero.position.set(Math.round(moon.x), Math.round(moon.y));
    this.campHero.zIndex = moon.y;
    this.campHero.scale.x = 1;
    const walk = moon.moving ? this.atlas.anim(`${heroSprite}-walk-${moon.facing}`) : this.atlas.anim(`${heroSprite}-idle-${moon.facing}`);
    const frames = walk[0] === Texture.EMPTY ? [this.atlas.get(`${heroSprite}-rot-${moon.facing}`)] : walk;
    this.campHero.texture = frames[Math.floor(t * (moon.moving ? 12 : 5)) % frames.length]!;
    this.light(moon.x, moon.y - 10, 56 + Math.round(Math.sin(t * 2.7)), 0.1);
    if (this.campFade > 0.05) {
      const glow = this.campFade;
      for (const [id, look] of Object.entries(CAMP_LOOKS)) {
        if (!view.visible.has(id)) continue;
        const at = this.campPlace(id);
        const near = view.near === id;
        this.light(at.x, at.y - look.up, Math.round((look.radius + (near ? 10 : 0)) * glow), (look.warm + (near ? 0.14 : 0)) * glow, look.tint);
      }
      if (view.near === 'cream') {
        const at = this.campPlace('cream');
        this.light(at.x, at.y - 10, 34, 0.14);
      }
    }
    if (cream) this.light(272, 204, 30 + Math.round(Math.sin(t * 2.3)), 0.1);
    this.renderLight();
    this.app.renderer.render(this.app.stage);
  }

  /**
   * Une scène de route : le décor du refuge, Moon et Cream qui marchent et se parlent. `fade` (de 0 à 1)
   * sort l'image du noir au début. `dt` en secondes.
   */
  drawScene(timeMs: number, dt: number, lit: boolean, heroSprite: string, s: SceneState, fade: number): void {
    const t = timeMs / 1000;
    // Le feu qui prend grandit en une demi-seconde.
    this.sceneFire = s.fire ? Math.min(1, this.sceneFire + dt * 2) : 0;
    this.campBase(t, lit, this.sceneFire);
    this.campCream.visible = false;
    this.campFade = 0;
    for (const o of this.campObjects.values()) o.visible = false;
    const a = this.atlas;
    const moon = s.moon;
    const hero = this.campHero;
    hero.visible = true;
    if (moon.pose !== '') hero.texture = a.get(`${heroSprite}-pose-${moon.pose}`);
    else {
      const walk = moon.moving ? a.anim(`${heroSprite}-walk-${moon.facing}`) : a.anim(`${heroSprite}-idle-${moon.facing}`);
      const frames = walk[0] === Texture.EMPTY ? [a.get(`${heroSprite}-rot-${moon.facing}`)] : walk;
      hero.texture = frames[Math.floor(t * (moon.moving ? 12 : 5)) % frames.length]!;
    }
    hero.position.set(Math.round(moon.x), Math.round(moon.y));
    hero.zIndex = moon.y;
    const cat = s.cream;
    const cream = this.sceneCream;
    let flip = 1;
    if (cat.pose !== '') cream.texture = a.get(`cream-pose-${cat.pose}`);
    else if (cat.moving) {
      const walk = a.anim(`cream-walk-${cat.facing}`);
      cream.texture = walk[Math.floor(t * 12) % walk.length]!;
    } else {
      // Assis de trois quarts, la tête à gauche sur l'image : retourné quand Moon est à droite.
      cream.texture = a.get('cream-sit');
      if (moon.x > cat.x) flip = -1;
    }
    cream.scale.x = flip;
    cream.position.set(Math.round(cat.x), Math.round(cat.y));
    cream.zIndex = cat.y;
    cream.visible = true;
    this.drawEmote(this.sceneEmotes[0]!, moon.emote, moon.x, moon.y - EMOTE_UP_MOON, dt);
    this.drawEmote(this.sceneEmotes[1]!, cat.emote, cat.x, cat.y - EMOTE_UP_CREAM, dt);
    // La lanterne de Moon éclaire le chemin ; Cream a sa petite lueur.
    this.light(moon.x, moon.y - 10, 52 + Math.round(Math.sin(t * 2.7)), 0.1);
    this.light(cat.x, cat.y - 8, 26);
    this.renderLight();
    // Le fondu d'entrée : l'image sort de la nuit (la couleur de fond).
    this.app.stage.alpha = Math.max(0, Math.min(1, fade));
    this.app.renderer.render(this.app.stage);
    this.app.stage.alpha = 1;
  }
}
