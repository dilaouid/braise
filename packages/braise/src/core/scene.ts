import type { DialogueLine } from '../content/index.ts';
import { CAMP_CREAM, CAMP_MOON, type SceneDef } from '../content/scene.ts';
import { facingFromVector } from './stores.ts';

/** Vitesse de marche dans une scène, en pixels par seconde : une promenade, pas une course. */
export const SCENE_WALK_SPEED = 46;

/** Un personnage de la scène : où il est, où il va, ce qu'il montre. */
export interface SceneActor {
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: number;
  moving: boolean;
  /** Pose de la ligne de dialogue en cours ('' : aucune). */
  pose: string;
  /** Bulle au-dessus de la tête ('' : aucune). */
  emote: string;
}

export interface SceneState {
  def: SceneDef;
  dialogues: Record<string, DialogueLine[]>;
  moon: SceneActor;
  cream: SceneActor;
  fire: boolean;
  /** Étape en cours, et temps passé dedans. */
  step: number;
  stepT: number;
  /** Le dialogue en cours (étape `say`), et sa ligne. */
  dialogue: string | null;
  line: number;
  lineT: number;
  /** Vrai quand l'étape vient de commencer : `enterStep` n'a pas encore été appelé. */
  fresh: boolean;
  /** Le feu vient de s'allumer pendant ce pas : l'appelant joue le son. */
  kindled: boolean;
  done: boolean;
}

function actor(x: number, y: number): SceneActor {
  return { x, y, tx: x, ty: y, facing: 0, moving: false, pose: '', emote: '' };
}

export function newScene(def: SceneDef, dialogues: Record<string, DialogueLine[]>): SceneState {
  return {
    def, dialogues,
    moon: actor(def.moon[0], def.moon[1]),
    cream: actor(def.cream[0], def.cream[1]),
    fire: def.fire,
    step: 0, stepT: 0, dialogue: null, line: 0, lineT: 0, fresh: true, kindled: false, done: false,
  };
}

/** La ligne de dialogue en cours, ou rien. */
export function sceneLine(s: SceneState): DialogueLine | null {
  if (s.dialogue === null) return null;
  return s.dialogues[s.dialogue]?.[s.line] ?? null;
}

function applyLine(s: SceneState): void {
  const line = sceneLine(s);
  s.moon.pose = line?.poseMoon ?? '';
  s.cream.pose = line?.poseCream ?? '';
  s.moon.emote = line?.emoteMoon ?? '';
  s.cream.emote = line?.emoteCream ?? '';
  // Pendant qu'ils se parlent, ils se font face.
  if (line) {
    s.moon.facing = facingFromVector(s.cream.x - s.moon.x, s.cream.y - s.moon.y);
    s.cream.facing = facingFromVector(s.moon.x - s.cream.x, s.moon.y - s.cream.y);
  }
}

function nextStep(s: SceneState): void {
  s.step++;
  s.stepT = 0;
  s.fresh = true;
  s.dialogue = null;
  s.line = 0;
  s.lineT = 0;
  applyLine(s);
}

function enterStep(s: SceneState): void {
  s.fresh = false;
  const step = s.def.steps[s.step];
  if (!step) {
    finishScene(s);
    return;
  }
  if (step.do === 'move') {
    if (step.moon) [s.moon.tx, s.moon.ty] = step.moon;
    if (step.cream) [s.cream.tx, s.cream.ty] = step.cream;
  } else if (step.do === 'say') {
    s.dialogue = step.dialogue;
    s.line = 0;
    s.lineT = 0;
    applyLine(s);
  } else if (step.do === 'kindle') {
    if (!s.fire) s.kindled = true;
    s.fire = true;
    nextStep(s);
  }
}

/** Fait marcher un personnage vers sa cible ; rend vrai s'il est arrivé. */
function walk(a: SceneActor, dt: number): boolean {
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= 0.5) {
    a.x = a.tx;
    a.y = a.ty;
    a.moving = false;
    return true;
  }
  const step = Math.min(d, SCENE_WALK_SPEED * dt);
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  a.facing = facingFromVector(dx, dy);
  a.moving = true;
  return false;
}

/** Fait passer `dt` secondes. Une réplique attend `advanceScene` ; une ligne muette passe seule. */
export function stepScene(s: SceneState, dt: number): void {
  s.kindled = false;
  // Plusieurs étapes instantanées peuvent s'enchaîner dans le même pas.
  for (let guard = 0; guard < 16 && !s.done && s.fresh; guard++) enterStep(s);
  if (s.done) return;
  const step = s.def.steps[s.step]!;
  s.stepT += dt;
  if (step.do === 'move') {
    const a = walk(s.moon, dt);
    const b = walk(s.cream, dt);
    if (a && b) nextStep(s);
  } else if (step.do === 'wait') {
    if (s.stepT >= step.seconds) nextStep(s);
  } else if (step.do === 'say') {
    const line = sceneLine(s);
    if (!line) nextStep(s);
    else if (line.who < 0) {
      s.lineT += dt;
      if (s.lineT >= line.seconds) advanceScene(s);
    }
  }
  for (let guard = 0; guard < 16 && !s.done && s.fresh; guard++) enterStep(s);
}

/** Passe à la ligne suivante du dialogue en cours (A). Sans effet hors d'un dialogue. */
export function advanceScene(s: SceneState): void {
  if (s.done || s.dialogue === null) return;
  s.line++;
  s.lineT = 0;
  if (!sceneLine(s)) nextStep(s);
  else applyLine(s);
}

/** Finit la scène tout de suite (B maintenu, ou fin du script) : chacun à sa place au refuge. */
export function finishScene(s: SceneState): void {
  s.done = true;
  s.dialogue = null;
  s.fire = true;
  for (const [a, p] of [[s.moon, CAMP_MOON], [s.cream, CAMP_CREAM]] as const) {
    a.x = a.tx = p.x;
    a.y = a.ty = p.y;
    a.moving = false;
    a.pose = '';
    a.emote = '';
  }
}
