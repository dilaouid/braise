/**
 * Navigation spatiale au focus, commune à tous les menus.
 * Un élément est focalisable s'il porte l'attribut `data-focus`.
 * Un seul élément a le focus à la fois ; il porte la classe `is-focused`.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Choisit, parmi des rectangles, le plus proche de `from` dans la direction (dx, dy).
 * Renvoie son indice, ou -1 s'il n'y en a aucun. Fonction pure, testable sans DOM.
 */
export function pickInDirection(from: Rect, candidates: readonly Rect[], dx: number, dy: number): number {
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i] as Rect;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const ox = cx - fx;
    const oy = cy - fy;
    // Distance le long de la direction demandée, et écart sur l'autre axe.
    const along = ox * dx + oy * dy;
    if (along <= 0.5) continue;
    let across: number;
    if (dx !== 0) {
      // L'écart est nul quand les deux rectangles se recouvrent sur l'axe vertical.
      across = Math.max(0, Math.max(c.y - (from.y + from.h), from.y - (c.y + c.h)));
    } else {
      across = Math.max(0, Math.max(c.x - (from.x + from.w), from.x - (c.x + c.w)));
    }
    const score = along + across * 3 + Math.abs(dx !== 0 ? oy : ox) * 0.05;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

const SELECTOR = '[data-focus]:not([disabled]):not([aria-hidden="true"])';

/** Gère le focus dans une racine DOM. */
export class FocusManager {
  private scope: HTMLElement | null = null;
  private current: HTMLElement | null = null;
  private lastRect: Rect | null = null;
  private memory = new Map<string, string>();
  private scopeKey = '';
  /** Appelé quand le focus se déplace (son d'interface). */
  onMove: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el && this.inScope(el) && el !== this.current) this.set(el, false);
    });
  }

  private inScope(el: HTMLElement): boolean {
    return (this.scope ?? this.root).contains(el);
  }

  private items(): HTMLElement[] {
    const base = this.scope ?? this.root;
    const all = Array.from(base.querySelectorAll<HTMLElement>(SELECTOR));
    return all.filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }

  private static rect(el: HTMLElement): Rect {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** L'élément qui a le focus, s'il est encore dans la page. */
  get focused(): HTMLElement | null {
    return this.current && this.current.isConnected ? this.current : null;
  }

  private set(el: HTMLElement | null, scroll: boolean): void {
    if (this.current === el) return;
    this.current?.classList.remove('is-focused');
    this.current = el;
    if (el) {
      el.classList.add('is-focused');
      this.lastRect = FocusManager.rect(el);
      const id = el.getAttribute('data-focus');
      if (id && this.scopeKey) this.memory.set(this.scopeKey, id);
      if (scroll) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * Restreint le focus à un écran. `key` sert à retrouver le focus au retour sur cet écran.
   */
  setScope(scope: HTMLElement | null, key = ''): void {
    this.scope = scope;
    this.scopeKey = key;
    this.set(null, false);
    this.lastRect = null;
    this.ensure();
  }

  /**
   * Garantit qu'un élément a le focus : celui mémorisé, celui marqué `data-focus-default`,
   * le plus proche de l'ancien, ou le premier.
   */
  ensure(): void {
    if (this.focused && this.inScope(this.focused) && !this.focused.hasAttribute('disabled')) return;
    const items = this.items();
    if (items.length === 0) {
      this.set(null, false);
      return;
    }
    const remembered = this.scopeKey ? this.memory.get(this.scopeKey) : undefined;
    let target: HTMLElement | undefined;
    if (this.lastRect) {
      // L'élément au focus a disparu : le voisin le plus proche le reçoit.
      const lr = this.lastRect;
      let bestD = Infinity;
      for (const el of items) {
        const r = FocusManager.rect(el);
        const d = Math.hypot(r.x + r.w / 2 - (lr.x + lr.w / 2), r.y + r.h / 2 - (lr.y + lr.h / 2));
        if (d < bestD) {
          bestD = d;
          target = el;
        }
      }
    } else {
      if (remembered) target = items.find((el) => el.getAttribute('data-focus') === remembered);
      target ??= items.find((el) => el.hasAttribute('data-focus-default'));
      target ??= items[0];
    }
    this.set(target ?? null, true);
  }

  /** Déplace le focus dans une direction. Renvoie vrai s'il a bougé. */
  move(dx: number, dy: number): boolean {
    this.ensure();
    const cur = this.focused;
    if (!cur) return false;
    const items = this.items().filter((el) => el !== cur);
    const idx = pickInDirection(FocusManager.rect(cur), items.map(FocusManager.rect), dx, dy);
    if (idx < 0) return false;
    this.set(items[idx] as HTMLElement, true);
    this.onMove?.();
    return true;
  }

  /** Active l'élément au focus (un clic). */
  activate(): boolean {
    this.ensure();
    const cur = this.focused;
    if (!cur) return false;
    cur.click();
    return true;
  }

  /** Donne le focus à l'élément portant cet identifiant `data-focus`. */
  focusId(id: string): void {
    const el = this.items().find((e) => e.getAttribute('data-focus') === id);
    if (el) this.set(el, true);
  }
}
