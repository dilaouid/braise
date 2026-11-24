import { describe, expect, it } from 'vitest';
import { FocusManager, pickInDirection, type Rect } from '../src/focus/index.ts';
import { createMemoryHost, type Host } from '../src/host/index.ts';
import { InputManager, PAD } from '../src/input/index.ts';
import { createFixedLoop } from '../src/loop/index.ts';
import { Rng, deriveSeed, seedFromString } from '../src/rng/index.ts';
import { createSaveStore } from '../src/save/index.ts';

describe('générateur déterministe', () => {
  it('la même graine donne la même suite', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('son état se sauvegarde et se restaure', () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.next();
    const state = a.state;
    const expected = [a.next(), a.next(), a.next()];
    const b = new Rng(1);
    b.state = state;
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });

  it('les flottants restent dans [0, 1) et les entiers dans leurs bornes', () => {
    const r = new Rng(3);
    for (let i = 0; i < 5000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.intRange(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('le tirage pondéré respecte les poids et ignore les poids nuls', () => {
    const r = new Rng(9);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[r.weighted([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.7);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.3);
    expect(r.weighted([0, 0])).toBe(-1);
  });

  it('les flux dérivés d\'une même graine diffèrent', () => {
    expect(deriveSeed(5, 0)).not.toBe(deriveSeed(5, 1));
    expect(seedFromString('braise')).toBe(seedFromString('braise'));
    expect(seedFromString('braise')).not.toBe(seedFromString('Braise'));
  });
});

describe('boucle à pas fixe', () => {
  it('exécute un nombre de pas indépendant de la fréquence d\'affichage', () => {
    for (const hz of [30, 60, 144]) {
      let steps = 0;
      const loop = createFixedLoop({ update: () => steps++, render: () => undefined });
      const frame = 1000 / hz;
      for (let t = 0; t < 1000 - 1e-6; t += frame) loop.advance(frame);
      expect(Math.abs(steps - 60)).toBeLessThanOrEqual(1);
    }
  });

  it('au plus cinq pas par image : le jeu ralentit au lieu de s\'emballer', () => {
    let steps = 0;
    const loop = createFixedLoop({ update: () => steps++, render: () => undefined });
    loop.advance(1000);
    expect(steps).toBe(5);
  });

  it('une pause arrête les pas ; le rendu continue', () => {
    let steps = 0;
    let renders = 0;
    const loop = createFixedLoop({ update: () => steps++, render: () => renders++, isPaused: () => true });
    loop.advance(100);
    expect(steps).toBe(0);
    expect(renders).toBe(1);
  });
});

interface Save { version: number; gold: number; name?: string }

function store(host: Host, version = 2) {
  return createSaveStore<Save>({
    host, name: 'save', version,
    migrations: { 1: (old) => ({ ...old, name: 'migré' }) },
    validate: (raw) => {
      const s = raw as Save;
      if (typeof s.gold !== 'number') throw new Error('forme');
      return s;
    },
  });
}

describe('sauvegarde', () => {
  it('écrit puis relit', async () => {
    const host = createMemoryHost();
    const s = store(host);
    await s.save({ version: 2, gold: 12 });
    expect((await s.load()).data).toEqual({ version: 2, gold: 12 });
  });

  it('migre une sauvegarde d\'une version passée', async () => {
    const host = createMemoryHost({ 'save.json': JSON.stringify({ version: 1, gold: 3 }) });
    const res = await store(host).load();
    expect(res.data).toEqual({ version: 2, gold: 3, name: 'migré' });
  });

  it('refuse une sauvegarde plus récente que le jeu, et ne l\'écrase pas', async () => {
    const text = JSON.stringify({ version: 9, gold: 1 });
    const host = createMemoryHost({ 'save.json': text });
    const s = store(host);
    const res = await s.load();
    expect(res.error).toBe('newer');
    expect(res.data).toBeNull();
    await s.save({ version: 2, gold: 0 });
    expect(host.files.get('save.json')).toBe(text);
  });

  it('une sauvegarde illisible fait essayer bak1, puis bak2', async () => {
    const host = createMemoryHost({
      'save.json': '{"version":2,"gol',
      'save.bak1': 'pas du json',
      'save.bak2': JSON.stringify({ version: 2, gold: 77 }),
    });
    const res = await store(host).load();
    expect(res.source).toBe('bak2');
    expect(res.data?.gold).toBe(77);
  });

  it('garde deux copies de secours tournantes', async () => {
    const host = createMemoryHost();
    const s = store(host);
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      await s.save({ version: 2, gold: 1 });
      now += 61_000;
      await s.save({ version: 2, gold: 2 });
      now += 61_000;
      await s.save({ version: 2, gold: 3 });
    } finally {
      Date.now = realNow;
    }
    expect(JSON.parse(host.files.get('save.json')!).gold).toBe(3);
    expect(JSON.parse(host.files.get('save.bak1')!).gold).toBe(2);
    expect(JSON.parse(host.files.get('save.bak2')!).gold).toBe(1);
  });

  it('une écriture interrompue ne corrompt jamais save.json', async () => {
    const base = createMemoryHost({ 'save.json': JSON.stringify({ version: 2, gold: 5 }) });
    // Un hôte dont l'écriture atomique échoue : rien n'est écrit, l'ancien fichier reste entier.
    const failing: Host = { ...base, write: async () => { throw new Error('disque plein'); } };
    const s = store(failing);
    await expect(s.save({ version: 2, gold: 6 })).rejects.toThrow();
    expect((await store(base).load()).data?.gold).toBe(5);
  });

  it('exporte et réimporte', () => {
    const s = store(createMemoryHost());
    const text = s.exportText({ version: 2, gold: 9 });
    expect(s.importText(text).data).toEqual({ version: 2, gold: 9 });
    expect(s.importText('n\'importe quoi').error).toBe('corrupt');
  });
});

describe('navigation spatiale au focus', () => {
  const r = (x: number, y: number, w = 40, h = 20): Rect => ({ x, y, w, h });

  it('va vers l\'élément le plus proche dans la direction demandée', () => {
    const from = r(100, 100);
    const items = [r(160, 100), r(300, 100), r(100, 140), r(40, 100), r(100, 60)];
    expect(pickInDirection(from, items, 1, 0)).toBe(0);
    expect(pickInDirection(from, items, -1, 0)).toBe(3);
    expect(pickInDirection(from, items, 0, 1)).toBe(2);
    expect(pickInDirection(from, items, 0, -1)).toBe(4);
  });

  it('préfère un élément aligné à un élément plus proche mais décalé', () => {
    const from = r(100, 100);
    expect(pickInDirection(from, [r(150, 160), r(220, 100)], 1, 0)).toBe(1);
  });

  it('ne renvoie rien quand il n\'y a personne dans cette direction', () => {
    expect(pickInDirection(r(100, 100), [r(20, 100)], 1, 0)).toBe(-1);
  });
});

/** Un élément focalisable factice : juste ce que lit le gestionnaire de focus. */
function fakeItem(id: string, x: number): any {
  const classes = new Set<string>();
  return {
    isConnected: true,
    offsetParent: {},
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) },
    getAttribute: (name: string) => (name === 'data-focus' ? id : null),
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ left: x, top: 0, width: 40, height: 20 }),
    getClientRects: () => [{}],
    closest() {
      return this;
    },
  };
}

function fakeRoot(items: any[]): any {
  const listeners: Record<string, (e: any) => void> = {};
  return {
    addEventListener: (type: string, fn: (e: any) => void) => {
      listeners[type] = fn;
    },
    contains: (el: any) => items.includes(el),
    querySelectorAll: () => items.filter((el) => el.isConnected),
    emit: (type: string, e: any) => listeners[type]!(e),
  };
}

describe('changement de focus', () => {
  function setup(): { items: any[]; root: any; focus: FocusManager; seen: Array<string | null> } {
    const items = [fakeItem('a', 0), fakeItem('b', 60), fakeItem('c', 120)];
    const root = fakeRoot(items);
    const focus = new FocusManager(root);
    const seen: Array<string | null> = [];
    focus.onChange = (id) => seen.push(id);
    return { items, root, focus, seen };
  }

  it('est annoncé à la navigation, une seule fois par changement', () => {
    const { focus, seen } = setup();
    focus.ensure();
    focus.ensure();
    focus.move(1, 0);
    focus.move(1, 0);
    focus.move(1, 0);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('est annoncé au survol de la souris', () => {
    const { focus, seen, root, items } = setup();
    focus.ensure();
    root.emit('mouseover', { target: items[2] });
    expect(seen).toEqual(['a', 'c']);
  });

  it('est annoncé quand l\'élément disparaît et quand la portée change', () => {
    const { focus, seen, items } = setup();
    focus.ensure();
    items[0].isConnected = false;
    focus.ensure();
    expect(seen).toEqual(['a', 'b']);
    focus.setScope(null);
    expect(seen).toEqual(['a', 'b', null, 'b']);
  });
});

describe('portée sans focus obligatoire', () => {
  it('rien n\'est choisi d\'office, et valider ne fait rien', () => {
    const items = [fakeItem('a', 0), fakeItem('b', 60)];
    let clicks = 0;
    for (const el of items) el.click = () => clicks++;
    const root = fakeRoot(items);
    const focus = new FocusManager(root);
    focus.setScope(root, 'camp', { optional: true });
    focus.ensure();
    expect(focus.focused).toBeNull();
    expect(focus.activate()).toBe(false);
    focus.focusId('b');
    expect(focus.focused).toBe(items[1]);
    expect(focus.activate()).toBe(true);
    expect(clicks).toBe(1);
    focus.clear();
    focus.ensure();
    expect(focus.focused).toBeNull();
    // Un élément au focus qui disparaît n'est pas remplacé.
    focus.focusId('a');
    items[0].isConnected = false;
    focus.ensure();
    expect(focus.focused).toBeNull();
  });

  it('revenir à une portée normale choisit de nouveau', () => {
    const items = [fakeItem('a', 0)];
    const root = fakeRoot(items);
    const focus = new FocusManager(root);
    focus.setScope(root, 'camp', { optional: true });
    focus.setScope(root, 'altar');
    expect(focus.focused).toBe(items[0]);
  });
});

/** Une cible d'événements factice, à la place de `window`. */
function fakeTarget() {
  const listeners = new Map<string, Array<(e: any) => void>>();
  return {
    addEventListener(type: string, fn: (e: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener() {},
    emit(type: string, event: any) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

function pad(buttons: number[] = [], axes: number[] = [0, 0, 0, 0], mapping = 'standard') {
  return {
    index: 0, connected: true, mapping, axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0, touched: false })),
  } as unknown as Gamepad;
}

describe('entrées', () => {
  it('ZQSD et WASD sont la même chose : le jeu lit la position physique des touches', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    target.emit('keydown', { code: 'KeyW' });
    target.emit('keydown', { code: 'KeyD' });
    input.poll(0);
    expect(input.frame.moveY).toBeLessThan(0);
    expect(input.frame.moveX).toBeGreaterThan(0);
    expect(Math.hypot(input.frame.moveX, input.frame.moveY)).toBeCloseTo(1, 5);
  });

  it('deux directions opposées au clavier s\'annulent', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    target.emit('keydown', { code: 'ArrowLeft' });
    target.emit('keydown', { code: 'ArrowRight' });
    input.poll(0);
    expect(input.frame.moveX).toBe(0);
  });

  it('un appui plus court qu\'une image n\'est pas perdu', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    target.emit('keydown', { code: 'Enter' });
    target.emit('keyup', { code: 'Enter' });
    input.poll(0);
    expect(input.frame.pressed.confirm).toBe(true);
    input.poll(16);
    expect(input.frame.pressed.confirm).toBe(false);
    expect(input.frame.held.confirm).toBe(false);
  });

  it('le stick est analogique : rien sous 25 %, maximum au-delà de 85 %', () => {
    let axes = [0.2, 0, 0, 0];
    const input = new InputManager(fakeTarget(), () => [pad([], axes)]);
    input.poll(0);
    expect(input.frame.moveX).toBe(0);
    axes = [0.55, 0, 0, 0];
    input.poll(16);
    expect(input.frame.moveX).toBeCloseTo(0.5, 5);
    axes = [0.9, 0, 0, 0];
    input.poll(32);
    expect(input.frame.moveX).toBe(1);
  });

  it('A valide, B annule ; « Inverser A et B » les échange', () => {
    let buttons = [PAD.A];
    const input = new InputManager(fakeTarget(), () => [pad(buttons)]);
    input.poll(0);
    expect(input.frame.pressed.confirm).toBe(true);
    expect(input.frame.pressed.back).toBe(false);
    expect(input.frame.device).toBe('gamepad');
    buttons = [];
    input.poll(16);
    input.settings.swapAB = true;
    buttons = [PAD.A];
    input.poll(32);
    expect(input.frame.pressed.back).toBe(true);
    expect(input.frame.pressed.confirm).toBe(false);
  });

  it('la croix est lue en boutons 12 à 15 comme en axes HAT', () => {
    const asButtons = new InputManager(fakeTarget(), () => [pad([PAD.LEFT])]);
    asButtons.poll(0);
    expect(asButtons.frame.moveX).toBe(-1);
    const asAxes = new InputManager(fakeTarget(), () => [pad([], [0, 0, 0, 0, 0, 0, 0, 1])]);
    asAxes.poll(0);
    expect(asAxes.frame.moveY).toBe(1);
  });

  it('la croix seule : à l\'appui, jamais le stick ni le clavier', () => {
    let buttons: number[] = [PAD.RIGHT];
    let axes = [0, 0, 0, 0];
    const target = fakeTarget();
    const input = new InputManager(target, () => [pad(buttons, axes)]);
    input.poll(0);
    expect([input.frame.dpadX, input.frame.dpadY, input.frame.dpadHeld]).toEqual([1, 0, true]);
    input.poll(16);
    expect([input.frame.dpadX, input.frame.dpadY, input.frame.dpadHeld]).toEqual([0, 0, true]);
    buttons = [];
    axes = [1, 0, 0, 0];
    target.emit('keydown', { code: 'ArrowUp' });
    input.poll(32);
    expect([input.frame.dpadX, input.frame.dpadY, input.frame.dpadHeld]).toEqual([0, 0, false]);
    expect(input.frame.moveX).toBe(1);
  });

  it('la croix seule se lit aussi en axes HAT', () => {
    const input = new InputManager(fakeTarget(), () => [pad([], [0, 0, 0, 0, 0, 0, 0, -1])]);
    input.poll(0);
    expect([input.frame.dpadX, input.frame.dpadY]).toEqual([0, -1]);
  });

  it('sans manette, la croix est au repos', () => {
    const input = new InputManager(fakeTarget(), () => []);
    input.poll(0);
    expect([input.frame.dpadX, input.frame.dpadY, input.frame.dpadHeld]).toEqual([0, 0, false]);
  });

  it('le pont natif owl:gamepad est traité comme une manette standard', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    const buttons = Array(17).fill(0);
    buttons[PAD.X] = 1;
    target.emit('owl:gamepad', { detail: { buttons, axes: [0, -1, 0, 0] } });
    input.poll(0);
    expect(input.frame.pressed.skill).toBe(true);
    expect(input.frame.moveY).toBe(-1);
  });

  it('en menu, une direction maintenue se répète après 350 ms, puis toutes les 90 ms', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    target.emit('keydown', { code: 'ArrowDown' });
    const fired: number[] = [];
    for (let t = 0; t <= 640; t += 10) {
      input.poll(t);
      if (input.frame.navY === 1) fired.push(t);
    }
    expect(fired).toEqual([0, 350, 440, 530, 620]);
  });

  it('un bouton maintenu au changement d\'écran est ignoré jusqu\'à son relâchement', () => {
    let buttons = [PAD.A];
    const input = new InputManager(fakeTarget(), () => [pad(buttons)]);
    input.poll(0);
    input.suppressHeld();
    input.poll(16);
    expect(input.frame.held.confirm).toBe(false);
    expect(input.frame.pressed.confirm).toBe(false);
    buttons = [];
    input.poll(32);
    buttons = [PAD.A];
    input.poll(48);
    expect(input.frame.pressed.confirm).toBe(true);
  });

  it('perdre le focus de la fenêtre relâche toutes les touches', () => {
    const target = fakeTarget();
    const input = new InputManager(target, () => []);
    let blurred = false;
    input.onBlur = () => (blurred = true);
    target.emit('keydown', { code: 'KeyD' });
    target.emit('blur', {});
    input.poll(0);
    expect(blurred).toBe(true);
    expect(input.frame.moveX).toBe(0);
  });
});
