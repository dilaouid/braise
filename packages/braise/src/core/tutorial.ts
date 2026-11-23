import type { DialogueLine, GameData, Point, RegionDef, TutorialDef, TutorialStep } from '../content/index.ts';
import { MAP_THICKET, MAP_WALL } from '../content/tutorial.ts';
import { addPickup, spawnEnemy } from './combat.ts';
import { resumeRun } from './levelup.ts';
import { findPath, isSolidAt } from './map.ts';
import { emit, facingFromVector } from './stores.ts';
import {
  EV, PK_GEM, PK_GOLD, PK_RED_GEM, TILE_GATE, TILE_THICKET,
  type GameMap, type Guide, type Prop, type Run, type TutorialNotes, type TutorialState,
} from './types.ts';

function isGateChar(ch: string): boolean {
  return ch >= '1' && ch <= '9';
}

/** Construit la carte fixe du tutoriel à partir de sa grille de caractères. */
export function buildTutorialMap(def: TutorialDef, tile: number): GameMap {
  const size = def.size;
  const solid = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = def.rows[y]!;
    for (let x = 0; x < size; x++) {
      const ch = row[x]!;
      solid[y * size + x] = ch === MAP_WALL ? 1 : ch === MAP_THICKET ? TILE_THICKET : isGateChar(ch) ? TILE_GATE : 0;
    }
  }
  // Un bloc de mur sur chaque tuile pleine qui touche une tuile de sol ; le reste est dans le noir.
  const props: Prop[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (solid[y * size + x] !== 1) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (solid[ny * size + nx] !== 1) {
            edge = true;
            break;
          }
        }
      }
      if (edge) props.push({ decor: 0, x: (x + 0.5) * tile, y: (y + 0.85) * tile });
    }
  }
  return { size, tile, solid, corners: new Uint8Array((size + 1) * (size + 1)), props, pois: [], coverage: 0 };
}

/** La région du tutoriel : celle du Bois, avec le décor de la ruine et le Guetteur pour boss. */
export function tutorialRegion(data: GameData, base: RegionDef): RegionDef {
  const look = data.tutorial.look;
  const boss = data.tutorial.steps.find((s): s is Extract<TutorialStep, { do: 'spawn' }> => s.do === 'spawn' && s.boss);
  return {
    ...base,
    tileset: look.tileset,
    darkness: look.darkness,
    music: look.music,
    decor: [{ sprite: look.wall, weight: 1 }],
    borderDecor: look.wall,
    bossIdx: boss ? boss.kind : base.bossIdx,
    waves: [],
  };
}

function emptyNotes(): TutorialNotes {
  return { dash: 0, flask: 0, card: 0, find: 0, buy: 0, boon: 0, totem: 0, boss: 0, shopClosed: 0 };
}

/** L'état de départ du tutoriel. */
export function newTutorialState(def: TutorialDef): TutorialState {
  const gates: TutorialState['gates'] = [];
  for (let y = 0; y < def.size; y++) {
    const row = def.rows[y]!;
    for (let x = 0; x < def.size; x++) if (isGateChar(row[x]!)) gates.push({ id: Number(row[x]), idx: y * def.size + x });
  }
  const g = def.guideStart;
  const guide: Guide = { x: g.x, y: g.y, px: g.x, py: g.y, tx: g.x, ty: g.y, path: [], pathI: 0, facing: 0, moving: false, pose: '' };
  return {
    def, step: 0, entered: false, guide,
    heroPose: '', emoteMoon: '', emoteCream: '',
    dialogue: null, line: 0, lineT: 0,
    banner: null, bannerGlyph: null, bark: null, barkT: 0,
    notes: emptyNotes(), base: emptyNotes(), waitT: 0,
    checkpointStep: 0, checkpointX: def.start.x, checkpointY: def.start.y,
    gates, deaths: 0, done: false,
  };
}

// ── Dialogue ─────────────────────────────────────────────────────────────────

/** La ligne de dialogue affichée, ou null. */
export function currentLine(run: Run): DialogueLine | null {
  const tu = run.tutorial;
  if (!tu || tu.dialogue === null) return null;
  return run.data.dialogues[tu.dialogue]?.[tu.line] ?? null;
}

function closeDialogue(run: Run, tu: TutorialState): void {
  tu.dialogue = null;
  tu.line = 0;
  tu.lineT = 0;
  tu.heroPose = '';
  tu.guide.pose = '';
  tu.emoteMoon = '';
  tu.emoteCream = '';
  // Ce qui attendait (un niveau, une trouvaille) s'ouvre maintenant.
  resumeRun(run);
}

function showLine(run: Run, tu: TutorialState, index: number): void {
  const lines = run.data.dialogues[tu.dialogue!];
  const line = lines?.[index];
  if (!line) {
    closeDialogue(run, tu);
    return;
  }
  tu.line = index;
  tu.lineT = 0;
  tu.heroPose = line.poseMoon;
  tu.guide.pose = line.poseCream;
  tu.emoteMoon = line.emoteMoon;
  tu.emoteCream = line.emoteCream;
  emit(run, EV.dialogueLine, run.hero.x, run.hero.y, line.who, index);
}

function openDialogue(run: Run, tu: TutorialState, id: string): void {
  tu.dialogue = id;
  run.phase = 'dialogue';
  // Les deux se regardent pendant qu'ils parlent.
  const g = tu.guide;
  g.moving = false;
  g.facing = facingFromVector(run.hero.x - g.x, run.hero.y - g.y);
  run.hero.facing = facingFromVector(g.x - run.hero.x, g.y - run.hero.y);
  run.hero.moving = false;
  showLine(run, tu, 0);
}

/** Passe à la ligne suivante ; après la dernière, la partie reprend. */
export function advanceDialogue(run: Run): void {
  const tu = run.tutorial;
  if (!tu || run.phase !== 'dialogue' || tu.dialogue === null) return;
  showLine(run, tu, tu.line + 1);
}

/** Passe tout le dialogue en cours. */
export function skipDialogue(run: Run): void {
  const tu = run.tutorial;
  if (!tu || run.phase !== 'dialogue' || tu.dialogue === null) return;
  closeDialogue(run, tu);
}

/** Fait passer le temps d'un dialogue : une ligne muette avance seule après sa durée. */
export function tickDialogue(run: Run, dt: number): void {
  const tu = run.tutorial;
  const line = currentLine(run);
  if (!tu || !line || run.phase !== 'dialogue') return;
  tu.lineT += dt;
  if (line.who < 0 && tu.lineT >= line.seconds) showLine(run, tu, tu.line + 1);
}

// ── Cream ────────────────────────────────────────────────────────────────────

/** Cream passe partout sauf dans les murs : la fumée et les Éteints endormis ne l'arrêtent pas. */
function guidePassable(tileValue: number): boolean {
  return tileValue === 0 || tileValue === TILE_GATE || tileValue === TILE_THICKET;
}

function tileIndex(map: GameMap, x: number, y: number): number {
  return Math.floor(y / map.tile) * map.size + Math.floor(x / map.tile);
}

function sendGuide(run: Run, guide: Guide, x: number, y: number): void {
  guide.tx = x;
  guide.ty = y;
  guide.path = findPath(run.map, tileIndex(run.map, guide.x, guide.y), tileIndex(run.map, x, y), guidePassable);
  guide.pathI = 0;
}

function updateGuide(run: Run, tu: TutorialState, dt: number): void {
  const g = tu.guide;
  const map = run.map;
  const speed = tu.def.tuning.guideSpeed;
  g.px = g.x;
  g.py = g.y;
  // Le prochain point : le centre de la tuile suivante du chemin, puis la cible exacte.
  let wx = g.tx;
  let wy = g.ty;
  if (g.pathI < g.path.length - 1) {
    const idx = g.path[g.pathI]!;
    wx = ((idx % map.size) + 0.5) * map.tile;
    wy = (Math.floor(idx / map.size) + 0.5) * map.tile;
  }
  const dx = wx - g.x;
  const dy = wy - g.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    const step = Math.min(d, speed * dt);
    g.x += (dx / d) * step;
    g.y += (dy / d) * step;
    g.moving = true;
    g.facing = facingFromVector(dx, dy);
    return;
  }
  if (g.pathI < g.path.length - 1) {
    g.pathI++;
    g.moving = true;
    return;
  }
  // Arrivé. Il ne reste jamais dans la lueur : si Moon s'approche, il s'écarte jusqu'au bord.
  g.moving = false;
  const hero = run.hero;
  const hx = g.x - hero.x;
  const hy = g.y - hero.y;
  const hd = Math.hypot(hx, hy);
  const keep = hero.stats.glow + tu.def.tuning.guideKeep;
  if (hd >= keep) {
    g.facing = facingFromVector(-hx, -hy);
    return;
  }
  const ux = hd > 0.01 ? hx / hd : 1;
  const uy = hd > 0.01 ? hy / hd : 0;
  const step = Math.min(keep - hd, speed * dt);
  // Tout droit si c'est libre, sinon le long du mur, d'un côté ou de l'autre.
  for (const [vx, vy] of [[ux, uy], [-uy, ux], [uy, -ux]] as const) {
    const nx = g.x + vx * step;
    const ny = g.y + vy * step;
    if (isSolidAt(map, nx, ny) || isSolidAt(map, nx + vx * 6, ny + vy * 6)) continue;
    g.x = nx;
    g.y = ny;
    g.tx = nx;
    g.ty = ny;
    g.path = [];
    g.pathI = 0;
    g.moving = true;
    g.facing = facingFromVector(vx, vy);
    return;
  }
  g.facing = facingFromVector(-hx, -hy);
}

// ── Script ───────────────────────────────────────────────────────────────────

function smithPrice(run: Run): number {
  const ev = run.data.tuning.events.smith;
  return ev.basePrice + ev.priceStep * run.smithBuys;
}

function waitDone(run: Run, tu: TutorialState, step: Extract<TutorialStep, { do: 'wait' }>): boolean {
  const hero = run.hero;
  const n = tu.notes;
  const b = tu.base;
  switch (step.until) {
    case 'reach': return Math.hypot(hero.x - step.x, hero.y - step.y) < tu.def.tuning.reachRadius;
    case 'clear': return run.enemies.count === 0;
    case 'gems': {
      const p = run.pickups;
      for (let i = 0; i < p.count; i++) if (p.kind[i] === PK_GEM || p.kind[i] === PK_RED_GEM) return false;
      return true;
    }
    case 'card': return n.card > b.card;
    // Sans fiole, on ne peut pas demander d'en boire une.
    case 'healed': return n.flask > b.flask || hero.hp >= hero.stats.maxHp || hero.flasks <= 0;
    case 'full': return hero.hp >= hero.stats.maxHp;
    case 'find': return n.find > b.find;
    // Si la boutique a été refermée et que l'or ne suffit plus, la leçon est passée plutôt que bloquée.
    case 'buy': return n.buy > b.buy || (n.shopClosed > b.shopClosed && hero.gold < smithPrice(run));
    case 'boon': return n.boon > b.boon;
    case 'totem': return n.totem > b.totem;
    case 'boss': return n.boss > b.boss;
    case 'time': return tu.waitT >= step.seconds;
  }
}

/** Joue l'étape en cours. Renvoie vrai si elle est finie. */
function runStep(run: Run, tu: TutorialState, step: TutorialStep, dt: number): boolean {
  const hero = run.hero;
  switch (step.do) {
    case 'say':
      if (!tu.entered) {
        tu.entered = true;
        openDialogue(run, tu, step.dialogue);
        return false;
      }
      return tu.dialogue === null;
    case 'wait':
      if (!tu.entered) {
        tu.entered = true;
        tu.base = { ...tu.notes };
        tu.waitT = 0;
      }
      tu.waitT += dt;
      return waitDone(run, tu, step);
    case 'bark':
      tu.bark = step.text;
      tu.barkT = tu.def.tuning.barkSeconds;
      emit(run, EV.bark, tu.guide.x, tu.guide.y);
      return true;
    case 'guide':
      sendGuide(run, tu.guide, step.x, step.y);
      return true;
    case 'banner':
      tu.banner = step.text;
      tu.bannerGlyph = step.text === null ? null : step.glyph;
      return true;
    case 'spawn': {
      const e = run.enemies;
      for (const p of step.points) {
        for (let k = 0; k < step.count; k++) {
          // Plusieurs ennemis au même repère : un peu écartés, pour ne pas naître empilés.
          const ox = step.count > 1 ? (run.rngSpawn.float() - 0.5) * 24 : 0;
          const oy = step.count > 1 ? (run.rngSpawn.float() - 0.5) * 24 : 0;
          const i = spawnEnemy(run, step.kind, p.x + ox, p.y + oy, 1);
          if (i >= 0 && step.boss) {
            e.timer2[i] = 1.5;
            run.director.bossUid = e.uid[i]!;
            run.director.bossPhase = 1;
            emit(run, EV.bossSpawn, p.x, p.y, step.kind);
          }
        }
      }
      return true;
    }
    case 'gate': {
      const map = run.map;
      for (const gate of tu.gates) {
        if (gate.id !== step.id || map.solid[gate.idx] !== TILE_GATE) continue;
        map.solid[gate.idx] = 0;
        emit(run, EV.gateOpen, ((gate.idx % map.size) + 0.5) * map.tile, (Math.floor(gate.idx / map.size) + 0.5) * map.tile, step.id);
      }
      // Le champ de distances des ennemis doit tenir compte du passage ouvert.
      run.flowTileX = -1;
      return true;
    }
    case 'hurt': {
      const target = Math.max(1, Math.min(hero.hp, hero.stats.maxHp * step.share));
      const lost = hero.hp - target;
      hero.hp = target;
      if (lost > 0) emit(run, EV.heroHurt, hero.x, hero.y, lost);
      return true;
    }
    case 'gold':
      addPickup(run, PK_GOLD, step.x, step.y, step.amount);
      return true;
    case 'gem': {
      // Un gros éclat : juste ce qu'il faut pour gagner un niveau.
      const need = (hero.xpNext - hero.xp) / (1 + hero.stats.wisdom);
      addPickup(run, PK_GEM, step.x, step.y, Math.ceil(need * 100) / 100 + 0.01);
      return true;
    }
    case 'place':
      run.map.pois.push({ kind: step.kind, x: step.x, y: step.y, state: 0, progress: 0, discovered: true, guardUid: 0, offers: null, armed: true });
      return true;
    case 'checkpoint':
      tu.checkpointStep = tu.step;
      tu.checkpointX = step.x;
      tu.checkpointY = step.y;
      return true;
    case 'end':
      tu.done = true;
      tu.banner = null;
      tu.bannerGlyph = null;
      run.outcome = 'victory';
      run.phase = 'victory';
      return false;
  }
}

/** Fait avancer Cream et le script. Appelé à la fin de chaque pas de simulation. */
export function updateTutorial(run: Run, dt: number): void {
  const tu = run.tutorial;
  if (!tu || tu.done) return;
  updateGuide(run, tu, dt);
  if (tu.barkT > 0) {
    tu.barkT -= dt;
    if (tu.barkT <= 0) tu.bark = null;
  }
  // Les étapes instantanées s'enchaînent dans le même pas ; une étape qui attend arrête la boucle.
  for (let guard = 0; guard < 64; guard++) {
    const step = tu.def.steps[tu.step];
    if (!step) return;
    if (!runStep(run, tu, step, dt)) return;
    tu.step++;
    tu.entered = false;
    if (run.phase !== 'playing') return;
  }
}

/** Le boss du tutoriel est tombé : ce qui reste s'effondre, sans portail ni butin. */
export function tutorialBossDead(run: Run): void {
  const e = run.enemies;
  for (let i = 0; i < e.count; i++) emit(run, EV.kill, e.x[i]!, e.y[i]!, e.kind[i]!);
  e.count = 0;
  run.enemyShots.count = 0;
  run.telegraphs.count = 0;
  run.director.bossUid = 0;
  run.director.bossPhase = 0;
  if (run.tutorial) run.tutorial.notes.boss++;
}

/**
 * Moon est tombé pendant le tutoriel : il reprend à l'entrée de la salle, avec toute sa vie, et la
 * salle recommence. Ce qu'il a gagné (niveau, cartes, or, lieux finis) reste.
 */
export function tutorialRespawn(run: Run): void {
  const tu = run.tutorial;
  if (!tu) return;
  const hero = run.hero;
  hero.x = tu.checkpointX;
  hero.y = tu.checkpointY;
  hero.px = hero.x;
  hero.py = hero.y;
  hero.hp = hero.stats.maxHp;
  hero.flasks = hero.stats.flasks;
  hero.invuln = tu.def.tuning.respawnInvuln;
  hero.dashT = 0;
  run.enemies.count = 0;
  run.enemyShots.count = 0;
  run.telegraphs.count = 0;
  run.zones.count = 0;
  run.director.bossUid = 0;
  run.director.bossPhase = 0;
  // Un lieu commencé (le totem en cours de charge) repart de zéro ; un lieu fini le reste.
  for (const poi of run.map.pois) {
    if (poi.state === 1) {
      poi.state = 0;
      poi.progress = 0;
    }
  }
  run.flowTileX = -1;
  tu.step = tu.checkpointStep;
  tu.entered = false;
  tu.banner = null;
  tu.bannerGlyph = null;
  tu.bark = tu.def.deathBarks[tu.deaths % tu.def.deathBarks.length]!;
  tu.barkT = tu.def.tuning.barkSeconds;
  tu.deaths++;
  emit(run, EV.tutoRespawn, hero.x, hero.y);
}

/** Là où l'étape en cours attend le joueur, s'il y a un endroit précis (pour le robot et la flèche). */
export function tutorialTarget(run: Run): Point | null {
  const tu = run.tutorial;
  if (!tu || tu.done) return null;
  const step = tu.def.steps[tu.step];
  if (!step || step.do !== 'wait' || !step.hasAt) return null;
  return { x: step.x, y: step.y };
}
