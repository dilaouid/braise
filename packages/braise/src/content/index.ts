import expeditionJson from '../../content/tuning/expedition.json';
import heroesJson from '../../content/tuning/heroes.json';
import weaponsJson from '../../content/weapons.json';
import evolutionsJson from '../../content/evolutions.json';
import relicsJson from '../../content/relics.json';
import enemiesJson from '../../content/enemies.json';
import altarJson from '../../content/altar.json';
import flamesJson from '../../content/flames.json';
import findsJson from '../../content/finds.json';
import dialoguesJson from '../../content/dialogues.json';
import tutorialJson from '../../content/tutorial.json';
import campJson from '../../content/camp.json';
import lanternJson from '../../content/lantern.json';
import memoriesJson from '../../content/memories.json';
import boisJson from '../../content/regions/bois-des-cendres.json';
import maraisJson from '../../content/regions/marais-des-lanternes.json';
import lameCendreJson from '../../content/classes/lame-cendre.json';
import frJson from '../../content/i18n/fr.json';
import { z } from 'zod';
import {
  altarBoostSchema, campSchema, classSchema, findSchema, enemySchema, evolutionSchema, expeditionTuningSchema, heroTuningSchema,
  flamesSchema, lanternSchema, memoriesSchema, regionSchema, relicSchema, weaponSchema, RARITY_NAMES,
  type AltarBoostRaw, type Attribute, type CampDef, type FindDef, type ClassRaw, type EnemyRaw, type ExpeditionTuning, type FlamesRaw, type HeroTuning,
  type PieceEffect, type RegionRaw, type RunModsRaw, type StatBonus, type WeaponParamsRaw,
} from './schema.ts';
import { CINEMATICS_RAW } from './cinematic.ts';
import { SCENES_RAW, compileScenes, type SceneDef } from './scene.ts';
import { compileTutorial, type DialogueLine, type TutorialDef } from './tutorial.ts';

export type { DialogueLine, TutorialDef, TutorialStep, Point } from './tutorial.ts';
export type {
  Attribute, StatBonus, ExpeditionTuning, HeroTuning, AltarBoostRaw, CampDef, CampObject, FindDef, PieceEffect, RunModsRaw,
  TalentNodeRaw,
} from './schema.ts';

/** Les types de dégâts, dans l'ordre de leur indice. */
export const DAMAGE_TYPES = ['physical', 'fire', 'lightning', 'frost'] as const;
export const DMG_PHYSICAL = 0;
export const DMG_FIRE = 1;
export const DMG_LIGHTNING = 2;
export const DMG_FROST = 3;

/** Paramètres d'arme, tous renseignés (les absents valent 0 ou faux). */
export type WeaponParams = { [K in keyof WeaponParamsRaw]-?: NonNullable<WeaponParamsRaw[K]> };

const PARAM_DEFAULTS: WeaponParams = {
  damage: 1, cooldown: 1, arc: 0, range: 0, strikes: 1, bleed: false, healEvery: 0,
  count: 1, pierce: 0, speed: 0, radius: 4, spread: 0, stagger: 0, homing: 0, fade: 0, burn: false,
  endZoneRadius: 0, endZoneDamage: 0, sprite: '',
  active: 0, pause: 0, hitInterval: 0.5, orbRadius: 6, turnTime: 2, rings: 1, ringGap: 0, sparkEvery: 0, sparkDamage: 0,
  impactRadius: 0, flight: 0.5, puddleRadius: 0, puddleDuration: 0, puddleDamage: 0, puddleTick: 0.5, puddleGrow: 0,
  knockback: 0, stun: 0, waves: 1, fissures: 0, fissureLength: 0, fissureWidth: 0, fissureDamage: 0,
  freeze: false, shock: false, band: 0, bite: 0, jumps: 0, jumpRange: 0, jumpsIntoLight: false, splash: 0, splashShare: 0.5,
  radiusShare: 0, life: 0, max: 0, scatter: 0, linkRange: 0, linkDamage: 0, linkWidth: 0, width: 0, minLength: 0, crossRadius: 0, crossDamage: 0,
  zapEvery: 0, zapCount: 0, zapRange: 0, zapDamage: 0, snapDamage: 0,
};

export interface WeaponDef {
  id: string;
  index: number;
  icon: string;
  damageType: number;
  scale: Attribute;
  aim: 'nearest' | 'directed' | 'around' | 'orbit' | 'random' | 'placed';
  behavior: 'arc' | 'projectile' | 'orbit' | 'lob' | 'nova' | 'verge' | 'chain' | 'lamp' | 'wake';
  /** Indice de la relique liée. */
  relic: number;
  /** Indice de la forme évoluée, ou -1 pour une arme déjà évoluée. */
  evolution: number;
  evolved: boolean;
  /** Indice de l'arme d'origine pour une évolution, sinon -1. */
  from: number;
  starting: boolean;
  levels: WeaponParams[];
}

export interface RelicDef {
  id: string;
  index: number;
  icon: string;
  /** Indice de l'arme que la relique fait évoluer. */
  weapon: number;
  maxLevel: number;
  starting: boolean;
  perLevel: StatBonus;
  atLevels: Record<number, StatBonus>;
}

export interface EnemyDef extends EnemyRaw {
  index: number;
  weakIdx: number;
  resistIdx: number;
  kbResist: number;
  onDeathIndex: number;
  spawnerIndex: number;
  summonIndex: number;
  shedIndex: number;
}

export interface RegionDef extends Omit<RegionRaw, 'horde' | 'waves' | 'cinematics'> {
  /** Son rang à la porte. */
  index: number;
  enemyIdx: number[];
  eliteIdx: number[];
  bossIdx: number;
  /** Le boss qui revient une fois le premier battu (-1 : aucun). */
  rebornBossIdx: number;
  /** L'Éteint des vagues de braséro et de totem (-1 : celui du réglage commun). */
  waveEnemyIdx: number;
  cinematics: { first: string; reborn?: string | undefined } | null;
  /** Poids par indice d'ennemi, pour chaque tranche. */
  horde: Array<{ from: number; to: number; weights: Float32Array }>;
  waves: Array<{ at: number; shape: 'circle' | 'line' | 'corners' | 'side'; enemy: number; count: number }>;
}

export type ClassDef = ClassRaw & { startWeaponIndex: number };

/** Un souvenir gardé par un boss, et la cinématique qui le montre. */
export interface MemoryDef {
  id: string;
  /** Rang dans la liste du refuge. */
  index: number;
  boss: string;
  bossIdx: number;
  cinematic: string;
  /** La scène de route jouée après la cinématique ('' : aucune). */
  scene: string;
}

/** Une pièce de la Lanterne : une rune (un effet à trois niveaux) ou un verre (qui change les niveaux des autres). */
export interface PieceDef {
  id: string;
  index: number;
  icon: string;
  kind: 'rune' | 'glass';
  /** Les effets d'une rune aux niveaux I à III ; aucun pour un verre. */
  levels: PieceEffect[];
  malus: PieceEffect;
  /** Niveaux ajoutés aux runes des faces suivante, précédente et opposée. */
  shifts: { next: number; previous: number; opposite: number };
  /** Retire le malus de la pièce d'en face. */
  clearsOpposite: boolean;
}

/** La Lanterne : ses pièces, leurs chances de tomber, et ce qui ouvre ses faces. */
export interface LanternDef {
  pieces: PieceDef[];
  drops: { elite: number; reborn: number };
  winsForThird: number;
}

/** Les raretés des Flammes, de la plus commune à la plus rare : leur indice sert partout. */
export const RARITIES = RARITY_NAMES;

/** Une Flamme à une rareté : ce qu'elle donne. */
export interface FlameTier {
  stats: StatBonus;
  mods: RunModsRaw;
  /** Élites qui surgissent quand elle est prise. */
  elites: number;
}

/** Une lignée de Flammes. `tiers[r]` est nul pour une rareté qu'elle n'a pas. */
export interface FlameLine {
  id: string;
  icon: string;
  index: number;
  tiers: Array<FlameTier | null>;
  /** Sa première et sa dernière rareté. */
  first: number;
  last: number;
}

export interface FlamesDef extends Omit<FlamesRaw, 'lines'> {
  lines: FlameLine[];
}

/** Toutes les données du jeu, validées et indexées. */
export interface GameData {
  tuning: ExpeditionTuning;
  heroTuning: HeroTuning;
  weapons: WeaponDef[];
  relics: RelicDef[];
  enemies: EnemyDef[];
  regions: Record<string, RegionDef>;
  classes: Record<string, ClassDef>;
  altar: AltarBoostRaw[];
  /** Les Flammes des totems. */
  flames: FlamesDef;
  /** Les trouvailles des trésors et des caches. */
  finds: FindDef[];
  /** Les dialogues, par identifiant. */
  dialogues: Record<string, DialogueLine[]>;
  /** La carte et le script du tutoriel. */
  tutorial: TutorialDef;
  /** Les souvenirs que rendent les boss, dans l'ordre du refuge. */
  memories: MemoryDef[];
  /** Le nombre d'emplacements de souvenirs montrés au refuge. */
  memoriesTotal: number;
  /** Le refuge. */
  camp: CampDef;
  /** Les pièces de la Lanterne. */
  lantern: LanternDef;
  /** Les scènes de route, par identifiant. */
  scenes: Record<string, SceneDef>;
}

/** Les données brutes telles qu'elles sont dans `content/`. */
export const RAW = {
  expedition: expeditionJson as unknown,
  heroes: heroesJson as unknown,
  weapons: weaponsJson as unknown,
  evolutions: evolutionsJson as unknown,
  relics: relicsJson as unknown,
  enemies: enemiesJson as unknown,
  altar: altarJson as unknown,
  flames: flamesJson as unknown,
  finds: findsJson as unknown,
  dialogues: dialoguesJson as unknown,
  tutorial: tutorialJson as unknown,
  memories: memoriesJson as unknown,
  lantern: lanternJson as unknown,
  camp: campJson as unknown,
  scenes: SCENES_RAW,
  regions: [boisJson, maraisJson] as unknown[],
  classes: [lameCendreJson] as unknown[],
  fr: frJson as unknown as Record<string, string>,
};

/** Le fichier de langue français. */
export const FR: Record<string, string> = RAW.fr;

function check<T>(schema: z.ZodType<T>, value: unknown, file: string, errors: string[]): T | null {
  const res = schema.safeParse(value);
  if (res.success) return res.data;
  for (const issue of res.error.issues) errors.push(`${file}: ${issue.path.join('.')} — ${issue.message}`);
  return null;
}

/** Les comportements sans rechargement : une arme permanente, ou déclenchée par la ruée. */
const NO_COOLDOWN: string[] = ['orbit', 'verge', 'wake'];

/** Ce qu'un comportement ne peut pas laisser à zéro. */
const REQUIRED_PARAMS: Record<string, Array<keyof WeaponParamsRaw>> = {
  verge: ['band', 'hitInterval'],
  chain: ['range', 'jumpRange'],
  lamp: ['radiusShare', 'life', 'max', 'hitInterval'],
  wake: ['width', 'life', 'max', 'hitInterval'],
};

function fill(p: WeaponParamsRaw): WeaponParams {
  return { ...PARAM_DEFAULTS, ...p } as WeaponParams;
}

/**
 * Valide toutes les données et leurs références croisées, puis les indexe.
 * Renvoie les données et la liste des erreurs (vide si tout est juste).
 */
export function compileContent(raw: typeof RAW = RAW): { data: GameData | null; errors: string[] } {
  const errors: string[] = [];
  const tuning = check(expeditionTuningSchema, raw.expedition, 'tuning/expedition.json', errors);
  const heroTuning = check(heroTuningSchema, raw.heroes, 'tuning/heroes.json', errors);
  const weaponsRaw = check(z.array(weaponSchema), raw.weapons, 'weapons.json', errors);
  const evolutionsRaw = check(z.array(evolutionSchema), raw.evolutions, 'evolutions.json', errors);
  const relicsRaw = check(z.array(relicSchema), raw.relics, 'relics.json', errors);
  const enemiesRaw = check(z.array(enemySchema), raw.enemies, 'enemies.json', errors);
  const altar = check(z.array(altarBoostSchema), raw.altar, 'altar.json', errors);
  const flamesRaw = check(flamesSchema, raw.flames, 'flames.json', errors);
  const finds = check(z.array(findSchema), raw.finds, 'finds.json', errors);
  const memoriesRaw = check(memoriesSchema, raw.memories, 'memories.json', errors);
  const camp = check(campSchema, raw.camp, 'camp.json', errors);
  const lanternRaw = check(lanternSchema, raw.lantern, 'lantern.json', errors);
  const regionsRaw = raw.regions.map((r, i) => check(regionSchema, r, `regions[${i}]`, errors));
  const classesRaw = raw.classes.map((c, i) => check(classSchema, c, `classes[${i}]`, errors));
  if (!tuning || !heroTuning || !weaponsRaw || !evolutionsRaw || !relicsRaw || !enemiesRaw || !altar || !flamesRaw || !finds || !memoriesRaw || !lanternRaw || !camp
    || regionsRaw.includes(null) || classesRaw.includes(null)) {
    return { data: null, errors };
  }

  const unique = (ids: string[], file: string): void => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`${file}: identifiant en double « ${i} »`);
      seen.add(i);
    }
  };
  unique([...weaponsRaw.map((w) => w.id), ...evolutionsRaw.map((e) => e.id)], 'weapons.json + evolutions.json');
  unique(relicsRaw.map((r) => r.id), 'relics.json');
  unique(enemiesRaw.map((e) => e.id), 'enemies.json');
  unique(altar.map((a) => a.id), 'altar.json');
  for (const a of altar) {
    if (a.requires !== undefined && !altar.some((b) => b.id === a.requires)) errors.push(`${a.id}: référence inconnue « ${a.requires} »`);
    if (a.unlock === undefined && a.weapon === undefined && Object.keys(a.perRank).length === 0) errors.push(`${a.id}: aucun effet`);
  }
  for (const rarity of ['epic', 'legendary', 'mythic'] as const) {
    if (altar.filter((a) => a.unlock === rarity).length !== 1) errors.push(`altar.json: il faut un seul boost pour ouvrir « ${rarity} »`);
  }
  unique(flamesRaw.lines.map((l) => l.id), 'flames.json');
  unique(finds.map((f) => f.id), 'finds.json');
  for (const d of finds) if (Object.keys(d.bonus).length === 0) errors.push(`${d.id}: aucun effet`);
  if (flamesRaw.lines.length < tuning.events.totem.choices) errors.push('flames.json: moins de lignées que de choix par totem');
  if (flamesRaw.costs[0] !== 0) errors.push('flames.json: la première rareté ne coûte rien');
  const flameLines: FlameLine[] = flamesRaw.lines.map((l, index) => {
    const tiers: Array<FlameTier | null> = RARITIES.map(() => null);
    for (const t of l.tiers) {
      const r = RARITIES.indexOf(t.rarity);
      if (tiers[r]) errors.push(`${l.id}: rareté « ${t.rarity} » en double`);
      if (Object.keys(t.stats).length + Object.keys(t.mods).length + t.elites === 0) errors.push(`${l.id}: rareté « ${t.rarity} » sans effet`);
      tiers[r] = { stats: t.stats, mods: t.mods, elites: t.elites };
    }
    const first = tiers.findIndex((t) => t !== null);
    const last = tiers.length - 1 - [...tiers].reverse().findIndex((t) => t !== null);
    if (first < 0) errors.push(`${l.id}: aucune rareté`);
    else for (let r = first; r <= last; r++) if (!tiers[r]) errors.push(`${l.id}: il manque la rareté « ${RARITIES[r]} »`);
    return { id: l.id, icon: l.icon, index, tiers, first, last: first < 0 ? -1 : last };
  });

  const weaponIndex = new Map<string, number>();
  weaponsRaw.forEach((w, i) => weaponIndex.set(w.id, i));
  evolutionsRaw.forEach((e, i) => weaponIndex.set(e.id, weaponsRaw.length + i));
  const relicIndex = new Map<string, number>();
  relicsRaw.forEach((r, i) => relicIndex.set(r.id, i));
  const enemyIndex = new Map<string, number>();
  enemiesRaw.forEach((e, i) => enemyIndex.set(e.id, i));

  const ref = (map: Map<string, number>, key: string, where: string): number => {
    const v = map.get(key);
    if (v === undefined) {
      errors.push(`${where}: référence inconnue « ${key} »`);
      return -1;
    }
    return v;
  };

  const weapons: WeaponDef[] = [];
  for (const w of weaponsRaw) {
    weapons.push({
      id: w.id, index: weapons.length, icon: w.icon,
      damageType: DAMAGE_TYPES.indexOf(w.damageType), scale: w.scale, aim: w.aim, behavior: w.behavior,
      relic: ref(relicIndex, w.relic, w.id), evolution: ref(weaponIndex, w.evolution, w.id),
      evolved: false, from: -1, starting: w.starting, levels: w.levels.map(fill),
    });
    for (let l = 0; l < w.levels.length; l++) {
      if (!NO_COOLDOWN.includes(w.behavior) && w.levels[l]!.cooldown === undefined) errors.push(`${w.id}: niveau ${l + 1} sans rechargement`);
    }
  }
  for (const e of evolutionsRaw) {
    const from = ref(weaponIndex, e.from, e.id);
    const relic = ref(relicIndex, e.relic, e.id);
    weapons.push({
      id: e.id, index: weapons.length, icon: e.icon,
      damageType: DAMAGE_TYPES.indexOf(e.damageType), scale: e.scale, aim: e.aim, behavior: e.behavior,
      relic, evolution: -1, evolved: true, from, starting: false, levels: [fill(e.params)],
    });
    // Une évolution et son arme d'origine doivent se citer l'une l'autre, avec la même relique.
    if (from >= 0) {
      const base = weaponsRaw[from];
      if (base && base.evolution !== e.id) errors.push(`${e.id}: « ${base.id} » évolue vers « ${base.evolution} »`);
      if (base && base.relic !== e.relic) errors.push(`${e.id}: relique différente de celle de « ${base.id} »`);
    }
  }
  for (const raw of [...weaponsRaw.map((w) => ({ id: w.id, behavior: w.behavior, levels: w.levels })), ...evolutionsRaw.map((w) => ({ id: w.id, behavior: w.behavior, levels: [w.params] }))]) {
    raw.levels.forEach((level, l) => {
      for (const key of REQUIRED_PARAMS[raw.behavior] ?? []) if (level[key] === undefined) errors.push(`${raw.id}: niveau ${l + 1} sans « ${key} »`);
    });
  }
  for (const w of weapons) {
    if (!w.evolved && w.evolution >= 0 && !weapons[w.evolution]!.evolved) errors.push(`${w.id}: son évolution n'est pas dans evolutions.json`);
  }

  const relics: RelicDef[] = relicsRaw.map((r, index) => {
    const atLevels: Record<number, StatBonus> = {};
    for (const [k, v] of Object.entries(r.atLevels ?? {})) atLevels[Number(k)] = v;
    const weapon = ref(weaponIndex, r.weapon, r.id);
    if (weapon >= 0 && weaponsRaw[weapon] && weaponsRaw[weapon]!.relic !== r.id) {
      errors.push(`${r.id}: l'arme « ${r.weapon} » cite une autre relique`);
    }
    return { id: r.id, index, icon: r.icon, weapon, maxLevel: r.maxLevel, starting: r.starting, perLevel: r.perLevel, atLevels };
  });

  const enemies: EnemyDef[] = enemiesRaw.map((e, index) => ({
    ...e,
    index,
    weakIdx: e.weak ? DAMAGE_TYPES.indexOf(e.weak) : -1,
    resistIdx: e.resist ? DAMAGE_TYPES.indexOf(e.resist) : -1,
    kbResist: e.knockbackResist ?? 0,
    onDeathIndex: e.onDeath ? ref(enemyIndex, e.onDeath.spawn, e.id) : -1,
    spawnerIndex: e.spawner ? ref(enemyIndex, e.spawner.enemy, e.id) : -1,
    summonIndex: e.summon ? ref(enemyIndex, e.summon.enemy, e.id) : -1,
    shedIndex: e.shed ? ref(enemyIndex, e.shed.enemy, e.id) : -1,
  }));
  for (const e of enemies) {
    if (e.behavior === 'shooter' && !e.shot) errors.push(`${e.id}: un tireur sans « shot »`);
    if (e.behavior === 'charger' && !e.charge) errors.push(`${e.id}: un chargeur sans « charge »`);
    if (e.behavior === 'spawner' && (!e.spawner || !e.slam)) errors.push(`${e.id}: il manque « spawner » ou « slam »`);
    if (e.behavior === 'boss-watcher' && (!e.charge || !e.slam)) errors.push(`${e.id}: il manque « charge » ou « slam »`);
    if (e.behavior === 'boss-stag' && (!e.charge || !e.roots || !e.summon || !e.phases || !e.slam || !e.stomp || !e.stalk || !e.volley || !e.pauses)) {
      errors.push(`${e.id}: boss incomplet`);
    }
    if (e.behavior === 'wisp' && !e.wisp) errors.push(`${e.id}: une lueur sans « wisp »`);
    if (e.behavior === 'leaper' && !e.leap) errors.push(`${e.id}: un bondisseur sans « leap »`);
    if (e.behavior === 'grabber' && !e.grab) errors.push(`${e.id}: une main sans « grab »`);
    if (e.behavior === 'ferryman' && (!e.ferry || !e.slam || !e.charge)) errors.push(`${e.id}: il manque « ferry », « slam » ou « charge »`);
    if (e.behavior === 'beacon' && (!e.blind || !e.spawner)) errors.push(`${e.id}: il manque « blind » ou « spawner »`);
    if (e.behavior === 'toller' && (!e.stomp || !e.summon)) errors.push(`${e.id}: il manque « stomp » ou « summon »`);
    if (e.behavior === 'boss-lady' && (!e.hands || !e.sweep || !e.lanterns || !e.dive || !e.embrace || !e.tide || !e.slam || !e.summon || !e.phases || !e.pauses || !e.emerge)) {
      errors.push(`${e.id}: boss incomplet`);
    }
    // Toute attaque annoncée l'est au moins 0,7 s avant (document 02 §6.3). La mèche d'une Lueur fait exception : elle se voit enfler.
    for (const t of [
      e.charge?.telegraph, e.slam?.telegraph, e.roots?.telegraph, e.stomp?.telegraph, e.stalk?.telegraph, e.volley?.windup,
      e.leap?.telegraph, e.deathBurst?.telegraph, e.grab?.telegraph, e.hands?.telegraph, e.sweep?.telegraph, e.lanterns?.telegraph,
      e.dive?.telegraph, e.embrace?.telegraph,
    ]) {
      if (t !== undefined && t < tuning.boss.minTelegraph) errors.push(`${e.id}: annonce de ${t} s, inférieure à ${tuning.boss.minTelegraph} s`);
    }
  }

  const regions: Record<string, RegionDef> = {};
  for (const r of regionsRaw as RegionRaw[]) {
    const horde = r.horde.map((slice) => {
      const weights = new Float32Array(enemies.length);
      for (const [key, w] of Object.entries(slice.weights)) {
        const idx = ref(enemyIndex, key, `${r.id} (horde)`);
        if (idx >= 0) weights[idx] = w as number;
      }
      return { from: slice.from, to: slice.to, weights };
    });
    if (r.requires !== undefined && !(regionsRaw as RegionRaw[]).some((o) => o.id === r.requires && o.id !== r.id)) {
      errors.push(`${r.id}: région inconnue « ${r.requires} »`);
    }
    regions[r.id] = {
      ...r,
      index: Object.keys(regions).length,
      waveEnemyIdx: r.waveEnemy ? ref(enemyIndex, r.waveEnemy, r.id) : -1,
      enemyIdx: r.enemies.map((e) => ref(enemyIndex, e, r.id)),
      eliteIdx: r.elites.map((e) => ref(enemyIndex, e, r.id)),
      bossIdx: ref(enemyIndex, r.boss, r.id),
      rebornBossIdx: r.rebornBoss ? ref(enemyIndex, r.rebornBoss, r.id) : -1,
      cinematics: r.cinematics ?? null,
      horde,
      waves: r.waves.map((w) => ({ at: w.at, shape: w.shape, enemy: ref(enemyIndex, w.enemy, `${r.id} (vague)`), count: w.count })),
    };
  }
  ref(enemyIndex, tuning.events.brazier.waveEnemy, 'tuning/expedition.json (braséro)');
  ref(enemyIndex, tuning.events.totem.waveEnemy, 'tuning/expedition.json (totem)');

  const classes: Record<string, ClassDef> = {};
  for (const c of classesRaw as ClassRaw[]) {
    const total = c.attributes.str + c.attributes.agi + c.attributes.spi + c.attributes.vig + c.attributes.luck;
    if (total !== 25) errors.push(`${c.id}: ${total} points d'attribut au niveau 1 au lieu de 25`);
    classes[c.id] = { ...c, startWeaponIndex: ref(weaponIndex, c.startWeapon, c.id) };
  }

  for (const b of altar) {
    if (b.weapon === undefined) continue;
    const opened = weapons[ref(weaponIndex, b.weapon, b.id)];
    if (b.unlock !== undefined) errors.push(`${b.id}: ouvre une rareté et une arme à la fois`);
    if (altar.some((o) => o !== b && o.weapon === b.weapon)) errors.push(`${b.id}: « ${b.weapon} » s'achète deux fois`);
    if (opened && (opened.starting || opened.evolved)) errors.push(`${b.id}: « ${b.weapon} » ne s'achète pas (arme de départ ou évolution)`);
  }

  // Chaque identifiant a ses textes.
  const fr = raw.fr;
  const needText = (key: string): void => {
    if (typeof fr[key] !== 'string' || fr[key] === '') errors.push(`i18n/fr.json: texte manquant « ${key} »`);
  };
  for (const w of weapons) {
    needText(`${w.id}.name`);
    needText(`${w.id}.desc`);
    if (!w.evolved) for (let l = 2; l <= w.levels.length; l++) needText(`${w.id}.level.${l}`);
  }
  for (const r of relics) {
    needText(`${r.id}.name`);
    needText(`${r.id}.desc`);
  }
  for (const e of enemies) needText(`${e.id}.name`);
  for (const a of altar) {
    needText(`${a.id}.name`);
    needText(`${a.id}.desc`);
  }
  for (const d of finds) {
    needText(`${d.id}.name`);
    needText(`${d.id}.desc`);
  }
  for (const r of RARITIES) needText(`rarity.${r}`);
  for (const l of flameLines) {
    needText(`${l.id}.name`);
    l.tiers.forEach((t, r) => {
      if (t) needText(`${l.id}.${RARITIES[r]}`);
    });
  }
  for (const r of Object.values(regions)) needText(`${r.id}.name`);
  for (const c of Object.values(classes)) {
    needText(`${c.id}.name`);
    for (const key of ['who', 'trait.name', 'trait.bonus', 'trait.malus']) needText(`${c.id}.${key}`);
    needText(`${c.skill.id}.name`);
    needText(`${c.skill.id}.desc`);
    needText(`${c.ultimate.id}.name`);
    needText(`${c.ultimate.id}.desc`);
    // L'arbre : 6 nœuds par branche (2 à l'étage 1, 2 au 2, 1 au 3, 1 maître), chacun avec ses textes.
    const tree = c.tree;
    unique(tree.nodes.map((n) => n.id), `${c.id} (arbre)`);
    for (const branch of tree.branches) {
      needText(`talents.branch.${branch}`);
      const perTier = [1, 2, 3, 4].map((tier) => tree.nodes.filter((n) => n.branch === branch && n.tier === tier).length);
      if (perTier.join() !== '2,2,1,1') errors.push(`${c.id}: la branche « ${branch} » a ${perTier.join(' / ')} nœuds par étage au lieu de 2 / 2 / 1 / 1`);
    }
    for (const n of tree.nodes) {
      needText(`${n.id}.name`);
      needText(`${n.id}.desc`);
      if (!tree.branches.includes(n.branch)) errors.push(`${n.id}: branche inconnue « ${n.branch} »`);
      if ((n.perRank === undefined) === (n.levels === undefined)) errors.push(`${n.id}: il faut « perRank » ou « levels », pas les deux`);
      if (n.levels !== undefined && n.levels.length !== n.ranks) errors.push(`${n.id}: ${n.levels.length} niveaux pour ${n.ranks} rangs`);
    }
  }

  const memories: MemoryDef[] = memoriesRaw.memories.map((m, index) => ({
    id: m.id, index, boss: m.boss, bossIdx: ref(enemyIndex, m.boss, m.id), cinematic: m.cinematic, scene: m.scene ?? '',
  }));
  unique(memories.map((m) => m.id), 'memories.json');
  if (memoriesRaw.total < memories.length) errors.push(`memories.json: ${memories.length} souvenirs pour ${memoriesRaw.total} emplacements`);
  const keepers = new Set<string>();
  for (const m of memories) {
    if (keepers.has(m.boss)) errors.push(`memories.json: « ${m.boss} » garde plus d'un souvenir`);
    keepers.add(m.boss);
    if (m.bossIdx >= 0 && enemies[m.bossIdx]!.rank !== 'boss') errors.push(`${m.id}: « ${m.boss} » n'est pas un boss`);
    if (CINEMATICS_RAW[m.cinematic] === undefined) errors.push(`${m.id}: cinématique inconnue « ${m.cinematic} »`);
    needText(`${m.id}.name`);
  }

  unique(camp.objects.map((o) => o.id), 'camp.json');
  const inside = (x: number, y: number, e: { x: number; y: number; rx: number; ry: number }): boolean =>
    e.rx > 0 && e.ry > 0 && Math.hypot((x - e.x) / e.rx, (y - e.y) / e.ry) < 1;
  for (const o of camp.objects) {
    if (o.reach > 0) needText(`camp.object.${o.id}`);
    if (!inside(o.stand[0], o.stand[1], camp.bounds)) errors.push(`camp.json: « ${o.id} », point d'arrêt hors de la clairière`);
    for (const other of camp.objects) {
      if (inside(o.stand[0], o.stand[1], { x: other.x, y: other.y, ...other.solid })) errors.push(`camp.json: « ${o.id} », point d'arrêt dans « ${other.id} »`);
    }
  }

  const pieces: PieceDef[] = [
    ...lanternRaw.runes.map((r) => ({ ...r, kind: 'rune' as const, shifts: { next: 0, previous: 0, opposite: 0 }, clearsOpposite: false })),
    ...lanternRaw.glasses.map((g) => ({ ...g, kind: 'glass' as const, levels: [] })),
  ].map((p, index) => ({ ...p, index }));
  const isEmpty = (e: PieceEffect): boolean => Object.keys(e.stats).length === 0 && Object.keys(e.mods).length === 0;
  unique(pieces.map((p) => p.id), 'lantern.json');
  for (const p of pieces) {
    needText(`${p.id}.name`);
    needText(`${p.id}.malus`);
    if (p.kind === 'rune') {
      p.levels.forEach((l, i) => {
        if (isEmpty(l)) errors.push(`${p.id}: niveau ${i + 1} sans effet`);
        needText(`${p.id}.bonus.${i + 1}`);
      });
      if (isEmpty(p.malus)) errors.push(`${p.id}: aucun malus`);
    } else {
      needText(`${p.id}.bonus`);
      if (!p.clearsOpposite && Math.max(p.shifts.next, p.shifts.previous, p.shifts.opposite) <= 0) errors.push(`${p.id}: aucun effet`);
    }
  }

  const tuto = compileTutorial(raw.dialogues, raw.tutorial, {
    tile: tuning.tileSize, fr, enemyIndex, findIds: finds.map((f) => f.id), smithPrice: tuning.events.smith.basePrice,
  }, errors);

  const scenes = tuto ? compileScenes(raw.scenes, new Set(Object.keys(tuto.dialogues)), errors) : {};
  for (const m of memories) if (m.scene !== '' && raw.scenes[m.scene] === undefined) errors.push(`${m.id}: scène inconnue « ${m.scene} »`);

  if (errors.length > 0 || !tuto) return { data: null, errors };
  return {
    data: { tuning, heroTuning, weapons, relics, enemies, regions, classes, altar, flames: { ...flamesRaw, lines: flameLines }, finds, dialogues: tuto.dialogues, tutorial: tuto.tutorial, memories, memoriesTotal: memoriesRaw.total, scenes, camp,
      lantern: { pieces, drops: lanternRaw.drops, winsForThird: lanternRaw.winsForThird } },
    errors,
  };
}

let cached: GameData | null = null;

/** Les données du jeu. Lève une erreur lisible si une donnée est fausse. */
export function loadGameData(): GameData {
  if (cached) return cached;
  const { data, errors } = compileContent();
  if (!data) throw new Error(`Données invalides :\n${errors.join('\n')}`);
  cached = data;
  return data;
}
