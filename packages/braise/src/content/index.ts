import expeditionJson from '../../content/tuning/expedition.json';
import heroesJson from '../../content/tuning/heroes.json';
import weaponsJson from '../../content/weapons.json';
import evolutionsJson from '../../content/evolutions.json';
import relicsJson from '../../content/relics.json';
import enemiesJson from '../../content/enemies.json';
import altarJson from '../../content/altar.json';
import boonsJson from '../../content/boons.json';
import findsJson from '../../content/finds.json';
import dialoguesJson from '../../content/dialogues.json';
import tutorialJson from '../../content/tutorial.json';
import boisJson from '../../content/regions/bois-des-cendres.json';
import lameCendreJson from '../../content/classes/lame-cendre.json';
import frJson from '../../content/i18n/fr.json';
import { z } from 'zod';
import {
  altarBoostSchema, boonSchema, classSchema, findSchema, enemySchema, evolutionSchema, expeditionTuningSchema, heroTuningSchema,
  regionSchema, relicSchema, weaponSchema,
  type AltarBoostRaw, type Attribute, type BoonDef, type FindDef, type ClassRaw, type EnemyRaw, type ExpeditionTuning, type HeroTuning,
  type RegionRaw, type StatBonus, type WeaponParamsRaw,
} from './schema.ts';
import { compileTutorial, type DialogueLine, type TutorialDef } from './tutorial.ts';

export type { DialogueLine, TutorialDef, TutorialStep, Point } from './tutorial.ts';
export type { Attribute, StatBonus, ExpeditionTuning, HeroTuning, AltarBoostRaw, BoonDef, FindDef } from './schema.ts';

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
  count: 1, pierce: 0, speed: 0, radius: 4, spread: 0, stagger: 0, homing: 0, burn: false,
  endZoneRadius: 0, endZoneDamage: 0, sprite: '',
  active: 0, pause: 0, hitInterval: 0.5, orbRadius: 6, turnTime: 2, rings: 1, ringGap: 0, sparkEvery: 0, sparkDamage: 0,
  impactRadius: 0, flight: 0.5, puddleRadius: 0, puddleDuration: 0, puddleDamage: 0, puddleTick: 0.5, puddleGrow: 0,
  knockback: 0, stun: 0, waves: 1, fissures: 0, fissureLength: 0, fissureWidth: 0, fissureDamage: 0,
};

export interface WeaponDef {
  id: string;
  index: number;
  icon: string;
  damageType: number;
  scale: Attribute;
  aim: 'nearest' | 'directed' | 'around' | 'orbit' | 'random' | 'placed';
  behavior: 'arc' | 'projectile' | 'orbit' | 'lob' | 'nova';
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
}

export interface RegionDef extends Omit<RegionRaw, 'horde' | 'waves'> {
  enemyIdx: number[];
  eliteIdx: number[];
  bossIdx: number;
  /** Poids par indice d'ennemi, pour chaque tranche. */
  horde: Array<{ from: number; to: number; weights: Float32Array }>;
  waves: Array<{ at: number; shape: 'circle' | 'line' | 'corners' | 'side'; enemy: number; count: number }>;
}

export type ClassDef = ClassRaw & { startWeaponIndex: number };

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
  /** Les buffs de totem. */
  boons: BoonDef[];
  /** Les trouvailles des trésors et des caches. */
  finds: FindDef[];
  /** Les dialogues, par identifiant. */
  dialogues: Record<string, DialogueLine[]>;
  /** La carte et le script du tutoriel. */
  tutorial: TutorialDef;
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
  boons: boonsJson as unknown,
  finds: findsJson as unknown,
  dialogues: dialoguesJson as unknown,
  tutorial: tutorialJson as unknown,
  regions: [boisJson] as unknown[],
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
  const boons = check(z.array(boonSchema), raw.boons, 'boons.json', errors);
  const finds = check(z.array(findSchema), raw.finds, 'finds.json', errors);
  const regionsRaw = raw.regions.map((r, i) => check(regionSchema, r, `regions[${i}]`, errors));
  const classesRaw = raw.classes.map((c, i) => check(classSchema, c, `classes[${i}]`, errors));
  if (!tuning || !heroTuning || !weaponsRaw || !evolutionsRaw || !relicsRaw || !enemiesRaw || !altar || !boons || !finds
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
  unique(boons.map((b) => b.id), 'boons.json');
  unique(finds.map((f) => f.id), 'finds.json');
  for (const d of [...boons, ...finds]) if (Object.keys(d.bonus).length === 0) errors.push(`${d.id}: aucun effet`);
  if (boons.length < tuning.events.totem.choices) errors.push('boons.json: moins de buffs que de choix par totem');

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
      if (w.behavior !== 'orbit' && w.levels[l]!.cooldown === undefined) errors.push(`${w.id}: niveau ${l + 1} sans rechargement`);
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
  }));
  for (const e of enemies) {
    if (e.behavior === 'shooter' && !e.shot) errors.push(`${e.id}: un tireur sans « shot »`);
    if (e.behavior === 'charger' && !e.charge) errors.push(`${e.id}: un chargeur sans « charge »`);
    if (e.behavior === 'spawner' && (!e.spawner || !e.slam)) errors.push(`${e.id}: il manque « spawner » ou « slam »`);
    if (e.behavior === 'boss-watcher' && (!e.charge || !e.slam)) errors.push(`${e.id}: il manque « charge » ou « slam »`);
    if (e.behavior === 'boss-stag' && (!e.charge || !e.roots || !e.summon || !e.phases)) errors.push(`${e.id}: boss incomplet`);
    // Toute attaque annoncée l'est au moins 0,7 s avant (document 02 §6.3).
    for (const t of [e.charge?.telegraph, e.slam?.telegraph, e.roots?.telegraph]) {
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
    regions[r.id] = {
      ...r,
      enemyIdx: r.enemies.map((e) => ref(enemyIndex, e, r.id)),
      eliteIdx: r.elites.map((e) => ref(enemyIndex, e, r.id)),
      bossIdx: ref(enemyIndex, r.boss, r.id),
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
  for (const d of [...boons, ...finds]) {
    needText(`${d.id}.name`);
    needText(`${d.id}.desc`);
  }
  for (const r of Object.values(regions)) needText(`${r.id}.name`);
  for (const c of Object.values(classes)) {
    needText(`${c.id}.name`);
    needText(`${c.skill.id}.name`);
    needText(`${c.skill.id}.desc`);
    needText(`${c.ultimate.id}.name`);
    needText(`${c.ultimate.id}.desc`);
  }

  const tuto = compileTutorial(raw.dialogues, raw.tutorial, {
    tile: tuning.tileSize, fr, enemyIndex, findIds: finds.map((f) => f.id), smithPrice: tuning.events.smith.basePrice,
  }, errors);

  if (errors.length > 0 || !tuto) return { data: null, errors };
  return {
    data: { tuning, heroTuning, weapons, relics, enemies, regions, classes, altar, boons, finds, dialogues: tuto.dialogues, tutorial: tuto.tutorial },
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
