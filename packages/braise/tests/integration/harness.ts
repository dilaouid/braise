import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '../..');
const EVIDENCE = resolve(PACKAGE, '../../production/qa/evidence');

/** Les textes du jeu : un parcours lit les mêmes clés que l'interface. */
export const FR: Record<string, string> = JSON.parse(readFileSync(resolve(PACKAGE, 'content/i18n/fr.json'), 'utf8'));
/** Les dialogues livrés : `dialogues[id]` est la liste de leurs lignes. */
export const DIALOGUES: Record<string, Array<{ who?: string; text?: string }>> =
  JSON.parse(readFileSync(resolve(PACKAGE, 'content/dialogues.json'), 'utf8')).dialogues;

/** Le texte brut d'une sauvegarde d'exemple de `tests/fixtures/saves/`. */
export function fixtureSave(name: string): string {
  return readFileSync(resolve(PACKAGE, 'tests/fixtures/saves', `${name}.json`), 'utf8');
}

/** La clé de `localStorage` où l'hôte du navigateur garde un fichier. */
export const storageKey = (file: string): string => `braise:${file}`;

/** Indices de la disposition « standard » de l'API Gamepad. */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;
export type PadButton = keyof typeof PAD;

interface PadState {
  connected: boolean;
  buttons: boolean[];
  axes: number[];
}

/**
 * Une manette simulée : elle remplace `navigator.getGamepads` par un objet piloté par le test
 * (document 08 §11). Elle prouve la logique du jeu, pas le comportement d'une vraie manette.
 */
export class SimPad {
  private constructor(private readonly page: Page) {}

  /** À appeler avant d'ouvrir la page. */
  static async install(page: Page): Promise<SimPad> {
    await page.addInitScript(() => {
      const state = { connected: true, buttons: new Array<boolean>(17).fill(false), axes: [0, 0, 0, 0] };
      (window as unknown as { __pad: unknown }).__pad = state;
      const snapshot = (): unknown => ({
        id: 'Manette simulée (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
        buttons: state.buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
        axes: state.axes.slice(),
      });
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => (state.connected ? [snapshot(), null, null, null] : [null, null, null, null]),
      });
    });
    return new SimPad(page);
  }

  private set(change: Partial<{ button: [number, boolean]; axes: number[] }>): Promise<void> {
    return this.page.evaluate((c) => {
      const state = (window as unknown as { __pad: PadState }).__pad;
      if (c.button) state.buttons[c.button[0]] = c.button[1];
      if (c.axes) state.axes = c.axes;
    }, change);
  }

  /** Enfonce un bouton et le laisse enfoncé. */
  down(button: PadButton): Promise<void> {
    return this.set({ button: [PAD[button], true] });
  }

  /** Relâche un bouton. */
  up(button: PadButton): Promise<void> {
    return this.set({ button: [PAD[button], false] });
  }

  /** Un appui bref : enfoncé quelques images, puis relâché quelques images. */
  async press(button: PadButton, frames = 4): Promise<void> {
    await this.down(button);
    await waitFrames(this.page, frames);
    await this.up(button);
    await waitFrames(this.page, frames);
  }

  /** Incline le stick gauche. */
  stick(x: number, y: number): Promise<void> {
    return this.set({ axes: [x, y, 0, 0] });
  }
}

/**
 * Passe la cinématique d'intro (document 15), qui se joue au premier départ d'une sauvegarde neuve :
 * B (ou Échap) maintenu un peu plus d'une seconde. Le tutoriel la suit : voir `skipTutorial`.
 */
export async function skipIntro(page: Page, pad?: SimPad): Promise<void> {
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await settle(page);
  if (pad) await pad.down('B');
  else await page.keyboard.down('Escape');
  await page.waitForTimeout(1400);
  if (pad) await pad.up('B');
  else await page.keyboard.up('Escape');
}

/**
 * Passe le tutoriel, qui suit la cinématique sur une sauvegarde neuve : la première réplique est à
 * l'écran, puis pause, « Passer le tutoriel », et la confirmation. Le refuge s'ouvre.
 */
export async function skipTutorial(page: Page, pad?: SimPad): Promise<void> {
  const press = async (button: 'START' | 'DOWN' | 'RIGHT' | 'A'): Promise<void> => {
    if (pad) await pad.press(button);
    else await page.keyboard.press(({ START: 'Escape', DOWN: 'ArrowDown', RIGHT: 'ArrowRight', A: 'Enter' } as const)[button], { delay: 60 });
  };
  await expect(page.locator('.dialogue')).toBeVisible();
  await settle(page);
  await press('START');
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  // On ne perd pas le tutoriel : « Abandonner » n'y est pas.
  await expect(page.locator('[data-focus="abandon"]')).toHaveCount(0);
  await settle(page);
  // Deux crans vers le bas, un à la fois : deux appuis trop rapprochés peuvent n'en faire qu'un.
  const focused = page.locator('#ui .is-focused');
  for (let i = 0; i < 4 && (await focused.getAttribute('data-focus')) !== 'skip-tutorial'; i++) {
    await press('DOWN');
    await page.waitForTimeout(150);
  }
  await expectFocus(page, 'skip-tutorial');
  await press('A');
  await expect(page.locator('.dialog')).toContainText(FR['pause.skipTutorial.confirm']!);
  await expectFocus(page, 'no');
  await press('RIGHT');
  await expectFocus(page, 'yes');
  await press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
}

/** Dépose un fichier de sauvegarde avant le premier chargement de la page, et seulement celui-là. */
export async function plantSave(page: Page, text: string): Promise<void> {
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('planted')) return;
    sessionStorage.setItem('planted', '1');
    localStorage.setItem(key!, value!);
  }, [storageKey('save.json'), text] as const);
}

/** Attend `n` images affichées par le jeu. */
export function waitFrames(page: Page, n: number): Promise<void> {
  return page.evaluate((count) => new Promise<void>((done) => {
    let seen = 0;
    const tick = (): void => {
      seen += 1;
      if (seen >= count) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
}

/**
 * Attend la fin de la garde posée à chaque changement d'écran : pendant 350 ms, les boutons
 * de validation sont ignorés (document 07 §10).
 */
export function settle(page: Page): Promise<void> {
  return page.waitForTimeout(450);
}

/** L'élément au focus : il y en a exactement un, visible, sur tout écran de menu. */
export async function expectFocus(page: Page, id?: string): Promise<void> {
  const focused = page.locator('#ui .is-focused');
  await expect(focused).toHaveCount(1);
  await expect(focused).toBeVisible();
  if (id !== undefined) await expect(focused).toHaveAttribute('data-focus', id);
}

/** Ce que la prise de développement `window.__braise` montre à un parcours. */
export interface RunView {
  phase: string;
  time: number;
  level: number;
  hp: number;
  x: number;
  y: number;
  dashCd: number;
  power: number;
  weapons: number;
  relics: number;
}

/** L'état de l'expédition en cours, ou `null` hors expédition. */
export function runView(page: Page): Promise<RunView | null> {
  return page.evaluate(() => {
    const run = (window as unknown as { __braise: { run: any } }).__braise.run;
    if (!run) return null;
    const h = run.hero;
    return {
      phase: run.phase, time: run.time, level: h.level, hp: h.hp, x: h.x, y: h.y, dashCd: h.dashCd,
      power: h.stats.power, weapons: run.weapons.length, relics: run.relics.length,
    };
  });
}

/** La sauvegarde que le jeu tient en mémoire. */
export function saveView<T = any>(page: Page): Promise<T> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __braise: { save: unknown } }).__braise.save)));
}

/**
 * Fait avancer l'expédition avec le robot, sans attendre l'affichage : un parcours ne joue pas
 * quinze minutes en temps réel. Le héros est soigné toutes les dix secondes de jeu, pour que la
 * graine tirée au départ ne décide pas de l'issue du parcours. Avec `stopOnChoice`, l'avance
 * s'arrête dès qu'une montée de niveau ou un coffre attend le joueur. Renvoie l'état atteint.
 */
export async function fastForward(page: Page, steps: number, stopOnChoice: boolean): Promise<RunView> {
  await page.evaluate(([n, stop]) => {
    const braise = (window as unknown as { __braise: { run: any; advance(steps: number, stopOnChoice: boolean): string } }).__braise;
    const CHUNK = 600;
    for (let done = 0; done < n; done += CHUNK) {
      const run = braise.run;
      if (!run || run.phase === 'dead' || run.phase === 'victory') break;
      if (stop && run.phase !== 'playing') break;
      run.hero.hp = run.hero.stats.maxHp;
      braise.advance(Math.min(CHUNK, n - done), stop);
    }
  }, [steps, stopOnChoice] as const);
  const view = await runView(page);
  if (!view) throw new Error('Aucune expédition en cours');
  return view;
}

/**
 * Amène le boss de la région tout de suite, à 1 PV (prise `bossNow`) : un parcours ne joue pas quinze
 * minutes pour le voir tomber. Rend vrai si le boss est là.
 */
export function bossNow(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __braise: { bossNow(): boolean } }).__braise.bossNow());
}

/** Le fichier de sauvegarde tel qu'il est écrit sur le disque, ou `null`. */
export function storedSave<T = any>(page: Page): Promise<T | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey('save.json'));
}

/**
 * Garde une capture. Elle est jointe au rapport du test ; avec `pnpm evidence`, elle est aussi
 * écrite dans `production/qa/evidence/<dossier>/`.
 */
export async function capture(page: Page, info: TestInfo, folder: string, name: string): Promise<void> {
  // Deux images : l'écran est peint avec son focus avant la capture.
  await waitFrames(page, 2);
  const keep = (info.config.metadata as { evidence?: boolean }).evidence === true;
  const path = keep ? resolve(EVIDENCE, folder, `${name}.png`) : info.outputPath(`${folder}-${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  // Le contour du focus clignote : la capture le fige allumé, pour qu'on voie toujours où il est.
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(`${folder}/${name}`, { path, contentType: 'image/png' });
}

/**
 * Surveille la page pendant un parcours : aucune erreur dans la console, et aucun appel
 * réseau hors du site lui-même (document 08 §12 : « aucun appel réseau à l'exécution »).
 */
export function watch(page: Page): { errors: string[]; foreign: string[] } {
  const seen = { errors: [] as string[], foreign: [] as string[] };
  page.on('pageerror', (err) => seen.errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.errors.push(msg.text());
  });
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).hostname !== 'localhost') seen.foreign.push(url);
  });
  return seen;
}
