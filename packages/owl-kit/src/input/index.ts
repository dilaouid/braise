/**
 * Entrées : transforme le clavier, l'API Gamepad et le pont natif optionnel d'OwlLeaf
 * en actions. Le jeu ne lit que des actions.
 */

/** Les actions connues du kit. */
export const ACTIONS = [
  'dash', 'skill', 'ultimate', 'flask', 'showNames', 'pause', 'map',
  'confirm', 'back', 'menuX', 'menuY', 'tabPrev', 'tabNext', 'pagePrev', 'pageNext',
  'up', 'down', 'left', 'right',
] as const;

export type ActionName = (typeof ACTIONS)[number];
export type DeviceKind = 'keyboard' | 'gamepad';

/** Liaisons d'une action : codes de touches physiques et indices de boutons standard. */
export interface Binding {
  keys: string[];
  buttons: number[];
}

export type Bindings = Record<ActionName, Binding>;

/** Indices de la disposition « standard » de l'API Gamepad. */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

/** Les liaisons par défaut (document 07). */
export function defaultBindings(): Bindings {
  return {
    dash: { keys: ['Space'], buttons: [PAD.A, PAD.RB] },
    skill: { keys: ['KeyE', 'KeyJ'], buttons: [PAD.X] },
    ultimate: { keys: ['KeyR', 'KeyK'], buttons: [PAD.Y] },
    flask: { keys: ['KeyF', 'KeyL'], buttons: [PAD.LB] },
    showNames: { keys: ['AltLeft'], buttons: [PAD.B] },
    pause: { keys: ['Escape'], buttons: [PAD.START] },
    map: { keys: ['Tab', 'KeyM'], buttons: [PAD.SELECT] },
    confirm: { keys: ['Enter', 'NumpadEnter', 'Space'], buttons: [PAD.A] },
    back: { keys: ['Escape', 'Backspace'], buttons: [PAD.B] },
    menuX: { keys: ['KeyX'], buttons: [PAD.X] },
    menuY: { keys: ['KeyC'], buttons: [PAD.Y] },
    tabPrev: { keys: ['KeyQ'], buttons: [PAD.LB] },
    tabNext: { keys: ['KeyE'], buttons: [PAD.RB] },
    pagePrev: { keys: ['PageUp'], buttons: [PAD.LT] },
    pageNext: { keys: ['PageDown'], buttons: [PAD.RT] },
    up: { keys: ['ArrowUp', 'KeyW'], buttons: [PAD.UP] },
    down: { keys: ['ArrowDown', 'KeyS'], buttons: [PAD.DOWN] },
    left: { keys: ['ArrowLeft', 'KeyA'], buttons: [PAD.LEFT] },
    right: { keys: ['ArrowRight', 'KeyD'], buttons: [PAD.RIGHT] },
  };
}

/** Réglages des manettes. */
export interface InputSettings {
  deadzoneLeft: number;
  deadzoneRight: number;
  /** Inverser A et B (manettes à disposition Nintendo). */
  swapAB: boolean;
}

/** L'état des actions pour une image. */
export interface InputFrame {
  /** Déplacement analogique, de norme ≤ 1, zone morte appliquée. */
  moveX: number;
  moveY: number;
  /** Visée (stick droit), nulle sous la zone morte. */
  aimX: number;
  aimY: number;
  held: Record<ActionName, boolean>;
  pressed: Record<ActionName, boolean>;
  /** Direction de menu de cette image, avec répétition : -1, 0 ou 1. */
  navX: number;
  navY: number;
  /** La croix de la manette seule (ni stick ni clavier), à l'appui : -1, 0 ou 1. */
  dpadX: number;
  dpadY: number;
  /** La croix est maintenue. */
  dpadHeld: boolean;
  device: DeviceKind;
}

interface PadState {
  buttons: boolean[];
  axes: number[];
}

function emptyFlags(): Record<ActionName, boolean> {
  const out = {} as Record<ActionName, boolean>;
  for (const a of ACTIONS) out[a] = false;
  return out;
}

const NAV_FIRST_MS = 350;
const NAV_REPEAT_MS = 90;
const MENU_STICK = 0.6;
const FULL_STICK = 0.85;

/** Source d'événements minimale (window), injectable pour les tests. */
export interface InputTarget {
  addEventListener(type: string, listener: (event: any) => void, options?: any): void;
  removeEventListener(type: string, listener: (event: any) => void, options?: any): void;
}

/** Fournit les manettes : `navigator.getGamepads` par défaut. */
export type GamepadProvider = () => ArrayLike<Gamepad | null>;

/**
 * Gestionnaire d'entrées. Appeler `poll(now)` une fois par image, puis lire `frame`.
 */
export class InputManager {
  readonly frame: InputFrame = {
    moveX: 0, moveY: 0, aimX: 0, aimY: 0,
    held: emptyFlags(), pressed: emptyFlags(), navX: 0, navY: 0, dpadX: 0, dpadY: 0, dpadHeld: false, device: 'keyboard',
  };

  bindings: Bindings = defaultBindings();
  settings: InputSettings = { deadzoneLeft: 0.25, deadzoneRight: 0.35, swapAB: false };

  /** Appelé quand le dernier périphérique utilisé change. */
  onDeviceChange: ((device: DeviceKind) => void) | null = null;
  /** Appelé quand la manette active est débranchée. */
  onDisconnect: (() => void) | null = null;
  /** Appelé quand la fenêtre perd le focus. */
  onBlur: (() => void) | null = null;

  private keys = new Set<string>();
  /** Touches enfoncées depuis la dernière lecture : un appui plus court qu'une image n'est pas perdu. */
  private taps = new Set<string>();
  private prevHeld = emptyFlags();
  private blocked = emptyFlags();
  private navDirX = 0;
  private navDirY = 0;
  private navNextAt = 0;
  private dpadDirX = 0;
  private dpadDirY = 0;
  private bridge: PadState | null = null;
  private activePad = -1;
  private lastPadStamp = new Map<number, string>();
  private readonly listeners: Array<[string, (event: any) => void]> = [];

  constructor(
    private readonly target: InputTarget,
    private readonly gamepads: GamepadProvider = () =>
      typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [],
  ) {
    this.listen('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code.startsWith('Arrow')) {
        e.preventDefault?.();
      }
      this.keys.add(e.code);
      this.taps.add(e.code);
      this.setDevice('keyboard');
    });
    this.listen('keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    this.listen('blur', () => {
      this.keys.clear();
      this.taps.clear();
      this.onBlur?.();
    });
    this.listen('gamepaddisconnected', (e: GamepadEvent) => {
      if (e.gamepad && e.gamepad.index === this.activePad) {
        this.activePad = -1;
        this.onDisconnect?.();
      }
    });
    this.listen('owl:gamepad', (e: CustomEvent<{ buttons: number[]; axes: number[] }>) => {
      const d = e.detail;
      if (!d) return;
      this.bridge = { buttons: d.buttons.map((v) => v > 0.5), axes: d.axes.slice() };
    });
  }

  private listen(type: string, fn: (event: any) => void): void {
    this.target.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  /** Retire tous les écouteurs. */
  dispose(): void {
    for (const [type, fn] of this.listeners) this.target.removeEventListener(type, fn);
    this.listeners.length = 0;
  }

  private setDevice(device: DeviceKind): void {
    if (this.frame.device !== device) {
      this.frame.device = device;
      this.onDeviceChange?.(device);
    }
  }

  /**
   * Ignore tout bouton actuellement maintenu jusqu'à son relâchement.
   * À appeler à chaque changement d'écran (document 07 §10).
   */
  suppressHeld(): void {
    for (const a of ACTIONS) if (this.frame.held[a]) this.blocked[a] = true;
    this.navDirX = 0;
    this.navDirY = 0;
  }

  /** Marque une action comme consommée pour cette image. */
  consume(action: ActionName): void {
    this.frame.pressed[action] = false;
  }

  private readPad(): PadState | null {
    if (this.bridge) return this.bridge;
    const pads = this.gamepads();
    let chosen: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      // La dernière manette à avoir envoyé une entrée commande.
      let stamp = '';
      for (let b = 0; b < p.buttons.length; b++) stamp += p.buttons[b]!.pressed ? '1' : '0';
      for (let a = 0; a < p.axes.length; a++) stamp += Math.abs(p.axes[a]!) > 0.5 ? (p.axes[a]! > 0 ? '+' : '-') : '.';
      const before = this.lastPadStamp.get(p.index);
      this.lastPadStamp.set(p.index, stamp);
      if (before !== undefined && before !== stamp) this.activePad = p.index;
      if (this.activePad === -1) this.activePad = p.index;
      if (p.index === this.activePad) chosen = p;
    }
    if (!chosen) return null;
    const buttons: boolean[] = [];
    for (let b = 0; b < chosen.buttons.length; b++) buttons.push(chosen.buttons[b]!.pressed);
    const axes = Array.from(chosen.axes);
    // La croix peut arriver comme deux axes HAT (indices 6 et 7) au lieu des boutons 12 à 15.
    if (axes.length >= 8) {
      const hx = axes[6]!;
      const hy = axes[7]!;
      if (hy < -0.5) buttons[PAD.UP] = true;
      if (hy > 0.5) buttons[PAD.DOWN] = true;
      if (hx < -0.5) buttons[PAD.LEFT] = true;
      if (hx > 0.5) buttons[PAD.RIGHT] = true;
    }
    return { buttons, axes };
  }

  /** Lit les périphériques et met `frame` à jour. `now` est en millisecondes. */
  poll(now: number): void {
    const f = this.frame;
    const pad = this.readPad();
    const s = this.settings;
    let padUsed = false;

    // Boutons de manette, avec inversion A/B éventuelle.
    const padBtn = (index: number): boolean => {
      if (!pad) return false;
      let i = index;
      if (s.swapAB) {
        if (i === PAD.A) i = PAD.B;
        else if (i === PAD.B) i = PAD.A;
      }
      return pad.buttons[i] === true;
    };

    for (const a of ACTIONS) {
      const b = this.bindings[a];
      let on = false;
      for (let i = 0; i < b.keys.length; i++) if (this.keys.has(b.keys[i]!) || this.taps.has(b.keys[i]!)) on = true;
      for (let i = 0; i < b.buttons.length; i++) {
        if (padBtn(b.buttons[i]!)) {
          on = true;
          padUsed = true;
        }
      }
      if (this.blocked[a]) {
        if (!on) this.blocked[a] = false;
        on = false;
      }
      f.held[a] = on;
      f.pressed[a] = on && !this.prevHeld[a];
      this.prevHeld[a] = on;
    }

    this.taps.clear();

    // Déplacement : le stick l'emporte s'il dépasse sa zone morte, sinon croix et clavier.
    let mx = 0;
    let my = 0;
    let stickX = 0;
    let stickY = 0;
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const len = Math.hypot(ax, ay);
      stickX = ax;
      stickY = ay;
      if (len > s.deadzoneLeft) {
        const t = Math.min(1, (len - s.deadzoneLeft) / (FULL_STICK - s.deadzoneLeft));
        mx = (ax / len) * t;
        my = (ay / len) * t;
        padUsed = true;
      }
    }
    if (mx === 0 && my === 0) {
      // Deux directions opposées s'annulent.
      const dx = (f.held.right ? 1 : 0) - (f.held.left ? 1 : 0);
      const dy = (f.held.down ? 1 : 0) - (f.held.up ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        mx = dx / len;
        my = dy / len;
      }
    }
    f.moveX = mx;
    f.moveY = my;

    // Visée manuelle au stick droit.
    f.aimX = 0;
    f.aimY = 0;
    if (pad) {
      const ax = pad.axes[2] ?? 0;
      const ay = pad.axes[3] ?? 0;
      const len = Math.hypot(ax, ay);
      if (len > s.deadzoneRight) {
        f.aimX = ax / len;
        f.aimY = ay / len;
        padUsed = true;
      }
    }
    if (padUsed) this.setDevice('gamepad');

    // La croix seule.
    const cx = (pad?.buttons[PAD.RIGHT] ? 1 : 0) - (pad?.buttons[PAD.LEFT] ? 1 : 0);
    const cy = (pad?.buttons[PAD.DOWN] ? 1 : 0) - (pad?.buttons[PAD.UP] ? 1 : 0);
    f.dpadHeld = cx !== 0 || cy !== 0;
    f.dpadX = cx !== this.dpadDirX ? cx : 0;
    f.dpadY = cy !== this.dpadDirY ? cy : 0;
    this.dpadDirX = cx;
    this.dpadDirY = cy;

    // Navigation de menu, avec répétition.
    let nx = (f.held.right ? 1 : 0) - (f.held.left ? 1 : 0);
    let ny = (f.held.down ? 1 : 0) - (f.held.up ? 1 : 0);
    if (nx === 0 && ny === 0) {
      if (Math.abs(stickX) > MENU_STICK && Math.abs(stickX) >= Math.abs(stickY)) nx = Math.sign(stickX);
      else if (Math.abs(stickY) > MENU_STICK) ny = Math.sign(stickY);
    }
    f.navX = 0;
    f.navY = 0;
    if (nx !== this.navDirX || ny !== this.navDirY) {
      this.navDirX = nx;
      this.navDirY = ny;
      if (nx !== 0 || ny !== 0) {
        f.navX = nx;
        f.navY = ny;
        this.navNextAt = now + NAV_FIRST_MS;
      }
    } else if ((nx !== 0 || ny !== 0) && now >= this.navNextAt) {
      f.navX = nx;
      f.navY = ny;
      this.navNextAt = now + NAV_REPEAT_MS;
    }
  }
}
