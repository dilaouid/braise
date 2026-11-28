import { z } from 'zod';

/** Les schémas des fichiers de `content/`. Les types du jeu en sont déduits. */

export const attributeSchema = z.enum(['str', 'agi', 'spi', 'vig', 'luck']);
export const damageTypeSchema = z.enum(['physical', 'fire', 'lightning', 'frost']);
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}\\.[a-z0-9-]+$`));
const weaponId = id('weapon');
const relicId = id('relic');
const enemyId = z.string().regex(/^(enemy|elite|boss)\.[a-z0-9-]+$/);

/** Les paramètres d'une arme à un niveau donné. Chaque comportement lit ceux qui le concernent. */
export const weaponParamsSchema = z
  .object({
    damage: z.number().positive(),
    cooldown: z.number().positive().optional(),
    // arc
    arc: z.number().optional(),
    range: z.number().optional(),
    strikes: z.number().int().optional(),
    bleed: z.boolean().optional(),
    healEvery: z.number().int().optional(),
    // projectile
    count: z.number().int().optional(),
    pierce: z.number().int().optional(),
    speed: z.number().optional(),
    radius: z.number().optional(),
    spread: z.number().optional(),
    stagger: z.number().optional(),
    homing: z.number().optional(),
    /** Part des dégâts perdue au bout de la portée : le tir faiblit à mesure qu'il vole. */
    fade: z.number().min(0).max(1).optional(),
    burn: z.boolean().optional(),
    endZoneRadius: z.number().optional(),
    endZoneDamage: z.number().optional(),
    sprite: z.string().optional(),
    // orbite
    active: z.number().optional(),
    pause: z.number().optional(),
    hitInterval: z.number().optional(),
    orbRadius: z.number().optional(),
    turnTime: z.number().optional(),
    rings: z.number().int().optional(),
    ringGap: z.number().optional(),
    sparkEvery: z.number().optional(),
    sparkDamage: z.number().optional(),
    // lobé
    impactRadius: z.number().optional(),
    flight: z.number().optional(),
    puddleRadius: z.number().optional(),
    puddleDuration: z.number().optional(),
    puddleDamage: z.number().optional(),
    puddleTick: z.number().optional(),
    puddleGrow: z.number().optional(),
    // onde
    knockback: z.number().optional(),
    stun: z.number().optional(),
    waves: z.number().int().optional(),
    fissures: z.number().int().optional(),
    fissureLength: z.number().optional(),
    fissureWidth: z.number().optional(),
    fissureDamage: z.number().optional(),
    // lumière et ruée (Lisière, Guet d'orage, Veilleuses, Sillage)
    freeze: z.boolean().optional(),
    shock: z.boolean().optional(),
    /** Épaisseur du bord coupant. */
    band: z.number().positive().optional(),
    /** Part de dégâts en plus quand toute la Lueur manque. */
    bite: z.number().nonnegative().optional(),
    jumps: z.number().int().nonnegative().optional(),
    jumpRange: z.number().positive().optional(),
    jumpsIntoLight: z.boolean().optional(),
    /** Rayon de l'éclat d'un éclair à chaque impact : les Éteints voisins prennent `splashShare` des dégâts. */
    splash: z.number().positive().optional(),
    splashShare: z.number().positive().max(1).optional(),
    /** Rayon d'une Veilleuse, en part du disque de lumière. */
    radiusShare: z.number().positive().optional(),
    /** Durée d'une Veilleuse ou d'un fil. */
    life: z.number().positive().optional(),
    /** Combien de Veilleuses ou de fils vivent à la fois. */
    max: z.number().int().positive().optional(),
    /** Distance des Veilleuses posées en plus de la première. */
    scatter: z.number().nonnegative().optional(),
    linkRange: z.number().positive().optional(),
    linkDamage: z.number().positive().optional(),
    linkWidth: z.number().positive().optional(),
    width: z.number().positive().optional(),
    /** Une ruée plus courte ne tend pas de fil. */
    minLength: z.number().nonnegative().optional(),
    crossRadius: z.number().positive().optional(),
    crossDamage: z.number().positive().optional(),
    /** Toutes les `zapEvery` secondes, chaque fil lance `zapCount` éclairs de `zapDamage` aux Éteints à `zapRange` px de lui. */
    zapEvery: z.number().positive().optional(),
    zapCount: z.number().int().positive().optional(),
    zapRange: z.number().positive().optional(),
    zapDamage: z.number().positive().optional(),
    /** Le fil qui se rompt éclate sur toute sa longueur. */
    snapDamage: z.number().positive().optional(),
  })
  .strict();

const aimSchema = z.enum(['nearest', 'directed', 'around', 'orbit', 'random', 'placed']);
const behaviorSchema = z.enum(['arc', 'projectile', 'orbit', 'lob', 'nova', 'verge', 'chain', 'lamp', 'wake']);

export const weaponSchema = z
  .object({
    id: weaponId,
    icon: z.string(),
    damageType: damageTypeSchema,
    scale: attributeSchema,
    aim: aimSchema,
    behavior: behaviorSchema,
    relic: relicId,
    evolution: weaponId,
    starting: z.boolean(),
    levels: z.array(weaponParamsSchema).length(6),
  })
  .strict();

export const evolutionSchema = z
  .object({
    id: weaponId,
    icon: z.string(),
    from: weaponId,
    relic: relicId,
    damageType: damageTypeSchema,
    scale: attributeSchema,
    aim: aimSchema,
    behavior: behaviorSchema,
    params: weaponParamsSchema,
  })
  .strict();

/** Les statistiques qu'une source (relique, boost, attribut) peut modifier. */
export const statBonusSchema = z
  .object({
    power: z.number().optional(),
    cadence: z.number().optional(),
    zone: z.number().optional(),
    duration: z.number().optional(),
    projectiles: z.number().optional(),
    projectileSpeed: z.number().optional(),
    critChance: z.number().optional(),
    critMult: z.number().optional(),
    maxHp: z.number().optional(),
    maxHpShare: z.number().optional(),
    regen: z.number().optional(),
    armor: z.number().optional(),
    speedShare: z.number().optional(),
    glowShare: z.number().optional(),
    luck: z.number().optional(),
    wisdom: z.number().optional(),
    greed: z.number().optional(),
    knockback: z.number().optional(),
    eliteDamage: z.number().optional(),
    rerolls: z.number().optional(),
    banishes: z.number().optional(),
    revives: z.number().optional(),
    flasks: z.number().optional(),
    cards: z.number().optional(),
  })
  .strict();

/** Une trouvaille : un bonus de statistiques pour la partie. */
export const findSchema = z.object({ id: z.string().regex(/^find\.[a-z-]+$/), icon: z.string(), bonus: statBonusSchema }).strict();

/** Ce qu'une pièce de la Lanterne change aux règles d'une partie. Une clé absente ne change rien. */
export const runModsSchema = z
  .object({
    /** Un point de vie rendu toutes les N gemmes (0 : jamais). */
    gemsPerHeal: z.number().int().positive().optional(),
    /** La fiole ne sert plus. */
    noFlask: z.boolean().optional(),
    /** Dégâts du coup qui donne sa Brûlure à la ruée, et son rayon. */
    dashBurn: z.number().positive().optional(),
    dashBurnRadius: z.number().positive().optional(),
    dashCooldownMult: z.number().positive().optional(),
    /** Puissance en plus sous cette part des points de vie. */
    lowHpPower: z.number().positive().optional(),
    lowHpShare: z.number().positive().max(1).optional(),
    healMult: z.number().nonnegative().optional(),
    threatMult: z.number().positive().optional(),
    ultChargeMult: z.number().positive().optional(),
    skillCooldownMult: z.number().positive().optional(),
    /** Puissance gagnée par élite battu. */
    eliteKillPower: z.number().positive().optional(),
    eliteHpMult: z.number().positive().optional(),
    /** Part des points de vie rendue par la première résurrection (0 : la part habituelle). */
    firstReviveShare: z.number().positive().max(1).optional(),
    /** Charges de ruée en plus de la première. */
    dashCharges: z.number().int().positive().optional(),
    /** Dégâts par tic des braises que la ruée laisse au sol. */
    dashTrail: z.number().positive().optional(),
    /** Dégâts par tic de la Brûlure donnée aux Éteints dans le disque de lumière. */
    haloBurn: z.number().positive().optional(),
    /** Chance de critique gagnée par point de Lueur sous 100 %. */
    shadowCrit: z.number().positive().optional(),
    /** Toutes les N secondes, les gemmes de la carte volent vers le héros. */
    recallEvery: z.number().positive().optional(),
    /** Ce que rend une fiole, multiplié. */
    flaskHealMult: z.number().positive().optional(),
    /** Toutes les N secondes, une fiole se remplit seule. */
    flaskRefillEvery: z.number().positive().optional(),
    /** Une fois par partie, un coup mortel laisse 1 point de vie et 3 s d'invulnérabilité. */
    lastStand: z.boolean().optional(),
    /** Secondes retirées à la recharge de la ruée. */
    dashCooldownCut: z.number().positive().optional(),
    /** Secondes d'élan en plus après une esquive juste. */
    dodgeExtra: z.number().positive().optional(),
    /** Chance de critique en plus pendant 2 s après une ruée. */
    dashCrit: z.number().positive().optional(),
    /** Une esquive juste recharge toute la ruée. */
    dodgeRefill: z.boolean().optional(),
    /** Puissance en plus sur un Éteint éclairé. */
    litPower: z.number().positive().optional(),
    /** Part de ce que la brume et la Lanterne-mère étouffent, qu'on ne subit pas (0 à 1). */
    fogResist: z.number().positive().max(1).optional(),
    /** Toutes les N secondes, la Lueur double pendant 4 s. */
    beaconPulse: z.number().positive().optional(),
  })
  .strict();

/** Un nœud de l'arbre d'une classe : un bonus par rang (`perRank`), ou l'effet total à chaque rang (`levels`). */
export const talentNodeSchema = z
  .object({
    id: z.string().regex(/^talent\.[a-z-]+$/),
    icon: z.string(),
    branch: z.string(),
    tier: z.number().int().min(1).max(4),
    ranks: z.number().int().positive(),
    perRank: statBonusSchema.optional(),
    levels: z.array(z.object({ stats: statBonusSchema.default({}), mods: runModsSchema.default({}) }).strict()).optional(),
  })
  .strict();

/** L'arbre de talents d'une classe : trois branches, leurs nœuds. */
export const treeSchema = z.object({ branches: z.array(z.string()).length(3), nodes: z.array(talentNodeSchema) }).strict();

export const RARITY_NAMES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export const raritySchema = z.enum(RARITY_NAMES);

const flameTierSchema = z
  .object({
    rarity: raritySchema,
    stats: statBonusSchema.default({}),
    mods: runModsSchema.default({}),
    /** Élites qui surgissent quand la Flamme est prise. */
    elites: z.number().int().min(0).default(0),
  })
  .strict();

/** Les Flammes des totems : des lignées, chacune en plusieurs raretés, et le prix en Lueur pour les nourrir. */
export const flamesSchema = z
  .object({
    /** Points de Lueur pour atteindre chaque rareté depuis la précédente ; le premier vaut 0. */
    costs: z.array(z.number().min(0)).length(RARITY_NAMES.length),
    /** Part de la Lueur de base sous laquelle on ne peut plus nourrir. */
    floor: z.number().min(0).max(1),
    /** Flammes de chaque rareté qu'une partie peut porter ; 0 : sans limite. */
    caps: z.array(z.number().int().min(0)).length(RARITY_NAMES.length),
    /** La Chance fait arriver une carte déjà nourrie d'un cran. */
    fed: z.object({ perLuck: z.number().min(0), max: z.number().min(0).max(1) }).strict(),
    /** Points de Lueur brûlée que rembourse un braséro rallumé. */
    brazierRefund: z.number().min(0),
    halo: z.object({ tick: z.number().positive() }).strict(),
    trail: z.object({ radius: z.number().positive(), duration: z.number().positive(), tick: z.number().positive(), spacing: z.number().positive() }).strict(),
    lines: z.array(z.object({ id: z.string().regex(/^flame\.[a-z-]+$/), icon: z.string(), tiers: z.array(flameTierSchema) }).strict()),
  })
  .strict();

const pieceEffectSchema = z.object({ stats: statBonusSchema.default({}), mods: runModsSchema.default({}) }).strict();

const runeSchema = z
  .object({ id: z.string().regex(/^rune\.[a-z-]+$/), icon: z.string(), levels: z.array(pieceEffectSchema).length(3), malus: pieceEffectSchema })
  .strict();

const glassSchema = z
  .object({
    id: z.string().regex(/^glass\.[a-z-]+$/),
    icon: z.string(),
    /** Niveaux ajoutés aux runes des faces suivante, précédente et opposée. */
    shifts: z
      .object({ next: z.number().int().default(0), previous: z.number().int().default(0), opposite: z.number().int().default(0) })
      .strict()
      .default({ next: 0, previous: 0, opposite: 0 }),
    /** Retire le malus de la pièce d'en face. */
    clearsOpposite: z.boolean().default(false),
    malus: pieceEffectSchema.default({ stats: {}, mods: {} }),
  })
  .strict();

export const lanternSchema = z
  .object({
    drops: z.object({ elite: z.number().min(0).max(1), reborn: z.number().min(0).max(1) }).strict(),
    /** Victoires avec une pièce posée qui ouvrent la troisième face. */
    winsForThird: z.number().int().positive(),
    runes: z.array(runeSchema),
    glasses: z.array(glassSchema),
  })
  .strict();

const pointSchema = z.tuple([z.number(), z.number()]);

/** Le refuge : où Moon marche, et ce qu'il peut y ouvrir. Positions en pixels de l'image (640 × 360). */
export const campSchema = z
  .object({
    /** Vitesse de Moon, en pixels par seconde. */
    speed: z.number().positive(),
    /** La clairière : une ellipse. */
    bounds: z.object({ x: z.number(), y: z.number(), rx: z.number().positive(), ry: z.number().positive() }).strict(),
    objects: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z-]+$/),
          x: z.number(),
          y: z.number(),
          /** Sa place à l'image, pour la souris et la croix : largeur et hauteur, posées sur (x, y). */
          box: pointSchema,
          /** Distance à laquelle Moon l'ouvre ; 0 : un décor. */
          reach: z.number().nonnegative(),
          /** Où Moon s'arrête quand il y va de lui-même. */
          stand: pointSchema,
          /** L'obstacle au sol : une ellipse. */
          solid: z.object({ rx: z.number().nonnegative(), ry: z.number().nonnegative() }).strict(),
        })
        .strict(),
    ),
  })
  .strict();

/** Un prix qui monte à chaque achat. */
const priceSchema = z.object({ base: z.number().int().nonnegative(), step: z.number().int().nonnegative() }).strict();

export const relicSchema = z
  .object({
    id: relicId,
    icon: z.string(),
    weapon: weaponId,
    maxLevel: z.number().int().positive(),
    starting: z.boolean(),
    perLevel: statBonusSchema,
    atLevels: z.record(z.string(), statBonusSchema).optional(),
  })
  .strict();

/** Une flaque de vase laissée au sol : elle ralentit le héros qui la traverse. */
const mireSchema = z.object({ radius: z.number().positive(), duration: z.number().positive() }).strict();

const chargeSchema = z
  .object({
    damage: z.number(),
    telegraph: z.number(),
    speed: z.number(),
    distance: z.number(),
    width: z.number(),
    cooldown: z.number(),
    repeats: z.number().int(),
    triggerRange: z.number(),
  })
  .strict();

export const enemySchema = z
  .object({
    id: enemyId,
    sprite: z.string(),
    family: z.enum(['walker', 'fast', 'tank', 'shooter', 'swarm', 'elite', 'boss']),
    behavior: z.enum([
      'chase', 'zigzag', 'shooter', 'swarm', 'charger', 'spawner', 'boss-stag', 'boss-watcher',
      'wisp', 'leaper', 'grabber', 'ferryman', 'beacon', 'toller', 'boss-lady',
    ]),
    rank: z.enum(['normal', 'elite', 'boss']),
    hp: z.number().positive(),
    damage: z.number(),
    speed: z.number(),
    cost: z.number(),
    entryMinute: z.number(),
    xp: z.number(),
    xpChance: z.number().optional(),
    radius: z.number().positive(),
    flying: z.boolean(),
    weak: damageTypeSchema.nullable(),
    resist: damageTypeSchema.nullable(),
    knockbackResist: z.number().optional(),
    /** Ses dégâts ne suivent pas l'échelle par minute, seulement celle de la Veillée. */
    flatDamage: z.boolean().optional(),
    pack: z.number().int().optional(),
    shot: z
      .object({
        damage: z.number(), speed: z.number(), interval: z.number(), keepDistance: z.number(), radius: z.number(), life: z.number(),
        /** Secondes de vase (ralenti) que le projectile laisse au héros. */
        slow: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    /** Secondes sans régénération que laisse chaque morsure. */
    drain: z.number().positive().optional(),
    /** Multiplicateur de vitesse dans l'eau profonde. */
    waterSpeed: z.number().positive().optional(),
    /** Une Lueur : arrivée près du héros, elle enfle puis éclate en flaque de vase. */
    wisp: z
      .object({ triggerRange: z.number(), fuse: z.number(), radius: z.number(), damage: z.number(), mire: mireSchema })
      .strict()
      .optional(),
    /** Un bond annoncé par un cercle à l'arrivée. */
    leap: z
      .object({ range: z.number(), minRange: z.number(), cooldown: z.number(), telegraph: z.number(), radius: z.number(), damage: z.number() })
      .strict()
      .optional(),
    /** À sa mort, il éclate : un cercle annoncé, qui frappe et laisse (ou non) de la vase. */
    deathBurst: z.object({ radius: z.number(), damage: z.number(), telegraph: z.number(), mire: mireSchema.optional() }).strict().optional(),
    /**
     * Une main qui nage sous l'eau vers le héros (`swim`), ressort là où il se tient quand il est à moins de `rise`,
     * reste dressée `linger` secondes, puis replonge. Elle le retient `slow` secondes. Jamais plus de `maxRising` à la fois.
     */
    grab: z
      .object({
        radius: z.number(), telegraph: z.number(), damage: z.number(), slow: z.number(), cooldown: z.number(),
        swim: z.number(), rise: z.number(), linger: z.number(), maxRising: z.number().int().positive(),
      })
      .strict()
      .optional(),
    /** Le Passeur : il disparaît dans la brume et reparaît derrière le héros. */
    ferry: z.object({ behind: z.number(), cooldown: z.number(), recover: z.number() }).strict().optional(),
    /** Tant qu'il vit, la lueur du héros est multipliée par `glowMult` ; il lâche des éclats en couronne. */
    blind: z
      .object({
        glowMult: z.number().positive().max(1), flashEvery: z.number(), shots: z.number().int(), shotSpeed: z.number(), shotDamage: z.number(),
        shotRadius: z.number(), shotLife: z.number(),
      })
      .strict()
      .optional(),
    /** Les mains de vase de la Dame : des cercles posés sous le héros. */
    hands: z
      .object({ damage: z.number(), telegraph: z.number(), count: z.number().int(), interval: z.number(), radius: z.number(), slow: z.number() })
      .strict()
      .optional(),
    /** Un balayage en secteur devant elle (`arc` : l'ouverture, en radians ; `gap` : le délai du second balayage). */
    sweep: z.object({ damage: z.number(), telegraph: z.number(), radius: z.number(), arc: z.number(), gap: z.number() }).strict().optional(),
    /** Des lanternes noyées jetées autour du héros : elles frappent et laissent de la vase. La deuxième tombe `lead` px devant lui. */
    lanterns: z
      .object({
        damage: z.number(), telegraph: z.number(), count: z.number().int(), stagger: z.number(), radius: z.number(), scatter: z.number(),
        lead: z.number(), mire: mireSchema,
      })
      .strict()
      .optional(),
    /**
     * La gerbe de vase : entre ses coups, des anneaux de `shots` projectiles partent d'elle toutes les `every` secondes
     * (une valeur par phase), chacun tourné de `turn` radians par rapport au précédent.
     */
    spray: z
      .object({
        damage: z.number(), speed: z.number(), radius: z.number(), life: z.number(), turn: z.number(),
        every: z.array(z.number().positive()).length(3), shots: z.array(z.number().int().positive()).length(3),
      })
      .strict()
      .optional(),
    /** Distancée de plus de `range` px, elle glisse sur l'eau à `speed` px/s pour revenir sur le héros. */
    glide: z.object({ range: z.number().positive(), speed: z.number().positive() }).strict().optional(),
    /** Elle plonge, suit le héros sous l'eau, puis resurgit. */
    dive: z
      .object({
        damage: z.number(), telegraph: z.number(), seconds: z.number(), speed: z.number(), radius: z.number(), rings: z.number().int(),
        ringWidth: z.number(), stagger: z.number(),
      })
      .strict()
      .optional(),
    /** Ses bras s'allongent en ligne : le héros touché est tiré vers elle. */
    embrace: z
      .object({ damage: z.number(), telegraph: z.number(), length: z.number(), width: z.number(), pull: z.number(), slow: z.number() })
      .strict()
      .optional(),
    /** La marée : l'arène se remplit d'eau par le bord, sauf des îlots. */
    tide: z
      .object({
        rise: z.number(), hold: z.number(), ebb: z.number(), islets: z.number().int().positive(), isletRadius: z.number(),
        damage: z.number(), tick: z.number(), cooldown: z.number(),
      })
      .strict()
      .optional(),
    /** Le temps qu'elle met à sortir de l'eau à son arrivée. */
    emerge: z.number().positive().optional(),
    /** Le temps qu'elle met à sombrer une fois vaincue : son butin ne paraît qu'après. */
    sink: z.number().positive().optional(),
    onDeath: z.object({ spawn: enemyId, count: z.number().int() }).strict().optional(),
    charge: chargeSchema.optional(),
    spawner: z.object({ enemy: enemyId, interval: z.number(), max: z.number().int() }).strict().optional(),
    slam: z
      .object({ damage: z.number(), radius: z.number(), telegraph: z.number(), cooldown: z.number(), triggerRange: z.number() })
      .strict()
      .optional(),
    phases: z.array(z.number()).optional(),
    roots: z
      .object({ damage: z.number(), telegraph: z.number(), lines: z.number().int(), length: z.number(), width: z.number(), cooldown: z.number() })
      .strict()
      .optional(),
    summon: z.object({ enemy: enemyId, count: z.number().int(), cooldown: z.number() }).strict().optional(),
    phase3Haste: z.number().optional(),
    /** Des éclats qui deviennent des ennemis chaque fois que le boss perd `every` de sa vie. */
    shed: z.object({ enemy: enemyId, every: z.number().positive().max(1), count: z.number().int().positive(), maxPerStep: z.number().int().positive() }).strict().optional(),
    /** À sa première mort, le boss retombe en poussière `duration` secondes, puis se relève avec `share` de sa vie. */
    reform: z.object({ share: z.number().positive().max(1), duration: z.number().positive() }).strict().optional(),
    /** Multiplie l'or et les Cendres que laisse un boss. */
    loot: z.number().positive().optional(),
    /** Le souffle entre deux attaques du boss, une valeur par phase. */
    pauses: z.array(z.number()).optional(),
    /** Des anneaux qui partent du boss l'un après l'autre. */
    stomp: z
      .object({ damage: z.number(), telegraph: z.number(), rings: z.number().int(), ringWidth: z.number(), stagger: z.number() })
      .strict()
      .optional(),
    /** Des cercles posés l'un après l'autre là où se tient le héros. */
    stalk: z
      .object({ damage: z.number(), telegraph: z.number(), count: z.number().int(), interval: z.number(), radius: z.number() })
      .strict()
      .optional(),
    /** Des éventails de projectiles. */
    volley: z
      .object({
        damage: z.number(), windup: z.number(), waves: z.number().int(), shots: z.number().int(), spread: z.number(),
        speed: z.number(), interval: z.number(), radius: z.number(), life: z.number(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const regionSchema = z
  .object({
    id: id('region'),
    level: z.number().int(),
    tileset: z.string(),
    darkness: z.object({ color: z.string(), opacity: z.number() }).strict(),
    music: z.object({ calm: z.string(), boss: z.string() }).strict(),
    enemies: z.array(enemyId).min(1),
    elites: z.array(enemyId).min(1),
    /** La région dont le boss doit être battu avant que celle-ci s'ouvre. */
    requires: id('region').optional(),
    /** L'image de sa carte, à la porte. */
    art: z.string().optional(),
    /** Ce qui remplace le chemin : de l'eau profonde, qui ralentit le héros. */
    water: z.object({ threshold: z.number().min(0).max(1), slow: z.number().min(0).max(0.9) }).strict().optional(),
    /** La brume : elle réduit la lueur du héros, hors de la lumière d'une lanterne ravivée. */
    fog: z.object({ glowMult: z.number().positive().max(1) }).strict().optional(),
    /**
     * Les lanternes noyées que le passage du héros ravive pour `seconds` : un refuge. Dans leur lumière, le héros se
     * soigne (`heal`, part des PV max par seconde) et les Éteints brûlent (`scorch`, part de leurs PV max à chaque
     * `tick` ; `eliteScorch` pour les élites, rien pour les boss) et ralentissent. Éteinte, elle se repose `rest` secondes.
     */
    beacons: z
      .object({
        count: z.number().int().positive(), sprite: z.string(), radius: z.number().positive(), reach: z.number().positive(),
        seconds: z.number().positive(), rest: z.number().nonnegative(), heal: z.number().nonnegative(),
        scorch: z.number().nonnegative(), eliteScorch: z.number().nonnegative(), tick: z.number().positive(),
      })
      .strict()
      .optional(),
    /** L'Éteint des vagues de braséro et de totem, à la place de celui du réglage commun. */
    waveEnemy: enemyId.optional(),
    boss: enemyId,
    /** Le boss qui revient une fois le premier battu. */
    rebornBoss: enemyId.optional(),
    /** La cinématique jouée avant chaque départ : boss jamais battu, puis boss reformé. */
    cinematics: z.object({ first: z.string(), reborn: z.string().optional() }).strict().optional(),
    decor: z.array(z.object({ sprite: z.string(), weight: z.number() }).strict()).min(1),
    borderDecor: z.string(),
    horde: z.array(z.object({ from: z.number(), to: z.number(), weights: z.record(enemyId, z.number()) }).strict()).min(1),
    waves: z.array(
      z
        .object({
          at: z.number(),
          shape: z.enum(['circle', 'line', 'corners', 'side']),
          enemy: enemyId,
          count: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export const classSchema = z
  .object({
    id: id('class'),
    sprite: z.string(),
    mainAttribute: attributeSchema,
    attributes: z.object({ str: z.number(), agi: z.number(), spi: z.number(), vig: z.number(), luck: z.number() }).strict(),
    growth: z.object({ every: attributeSchema, even: attributeSchema, odd: attributeSchema }).strict(),
    freeProfile: z.array(attributeSchema).min(1),
    startWeapon: weaponId,
    /** Le trait du personnage : toujours un bonus et un malus. « lit » : les dégâts changent selon que la cible est dans sa lumière ou non. */
    trait: z.object({ kind: z.literal('lit'), inside: z.number().positive(), outside: z.number().negative() }).strict(),
    skill: z
      .object({
        id: id('skill'),
        icon: z.string(),
        kind: z.literal('emberCry'),
        cooldown: z.number(),
        radius: z.number(),
        knockback: z.number(),
        damageBonus: z.number(),
        duration: z.number(),
        autoRange: z.number(),
      })
      .strict(),
    ultimate: z
      .object({
        id: id('ultimate'),
        icon: z.string(),
        kind: z.literal('whirl'),
        duration: z.number(),
        radius: z.number(),
        ticksPerSecond: z.number(),
        damage: z.number(),
        damageType: damageTypeSchema,
        scale: attributeSchema,
        autoRange: z.number(),
      })
      .strict(),
    /** L'arbre de talents : le point de talent de chaque niveau s'y place. */
    tree: treeSchema,
  })
  .strict();

export const altarBoostSchema = z
  .object({
    id: id('altar'),
    icon: z.string(),
    row: z.number().int().min(1).max(5),
    /** 0 = illimité. */
    ranks: z.number().int().min(0),
    baseCost: z.number().positive(),
    growth: z.number().positive(),
    shards: z.number().int().min(0),
    perRank: statBonusSchema,
    /** La rareté de Flamme que ce boost ouvre, au lieu d'un bonus chiffré. */
    unlock: z.enum(['epic', 'legendary', 'mythic']).optional(),
    /** L'arme que ce boost ouvre, avec sa relique. */
    weapon: weaponId.optional(),
    /** Le boost qu'il faut posséder avant d'acheter celui-ci. */
    requires: id('altar').optional(),
  })
  .strict();

export const expeditionTuningSchema = z
  .object({
    durationMin: z.number(),
    mapTiles: z.number().int(),
    tileSize: z.number().int(),
    startClearingTiles: z.number(),
    borderTiles: z.number().int(),
    obstacleCoverage: z.tuple([z.number(), z.number()]),
    eliteMinutes: z.array(z.number()),
    hero: z
      .object({
        speed: z.number(), radius: z.number(), glow: z.number(),
        /** Ce que le disque de lumière dessiné ajoute à la Lueur, en pixels : Lueur + marge = rayon éclairé. */
        lightMargin: z.number().min(0),
        invulnAfterHit: z.number(),
        critChance: z.number(), critMult: z.number(), critCap: z.number(), armorCap: z.number(), speedCap: z.number(),
        reviveHpShare: z.number(), reviveKnockback: z.number(), reviveRadius: z.number(),
      })
      .strict(),
    dash: z.object({ distance: z.number(), duration: z.number(), cooldown: z.number() }).strict(),
    flask: z.object({ charges: z.number().int(), healShare: z.number() }).strict(),
    slots: z.object({ weapons: z.number().int(), relics: z.number().int() }).strict(),
    cardsPerLevel: z.number().int(),
    levelUpGuard: z.number(),
    bagSize: z.number().int(),
    enemyCap: z.object({ expedition: z.number().int(), abyss: z.number().int() }).strict(),
    spawnRing: z.tuple([z.number(), z.number()]),
    leashDistance: z.number(),
    gems: z
      .object({ small: z.number(), medium: z.number(), large: z.number(), mergeAbove: z.number().int(), magnetSpeed: z.number(), collectRadius: z.number() })
      .strict(),
    scale: z
      .object({ hpLin: z.number(), hpQuad: z.number(), hpVigil: z.number(), hpAbyss: z.number(), dmgLin: z.number(), dmgVigil: z.number(), dmgAbyss: z.number() })
      .strict(),
    threat: z.object({ base: z.number(), perMinute: z.number(), perVigil: z.number(), perAbyss: z.number() }).strict(),
    director: z
      .object({
        breathSeconds: z.number(), breathFactor: z.number(), forwardChance: z.number(),
        emptyBurstSeconds: z.number(), overflowHpMult: z.number(), waveWarning: z.number(),
      })
      .strict(),
    xp: z.object({ base: z.number(), linear: z.number(), quadratic: z.number() }).strict(),
    death: z.object({ keptShare: z.number() }).strict(),
    victoryBonus: z.number(),
    ultimate: z.object({ gaugeMax: z.number(), perKill: z.number(), perElite: z.number() }).strict(),
    statuses: z
      .object({
        burn: z.object({ tick: z.number(), duration: z.number(), damageShare: z.number() }).strict(),
        shock: z.object({ bonus: z.number(), duration: z.number() }).strict(),
        freeze: z
          .object({ slow: z.number(), duration: z.number(), stackWindow: z.number(), stacksToFreeze: z.number().int(), freezeDuration: z.number(), bossSlowCap: z.number() })
          .strict(),
        bleed: z.object({ tick: z.number(), duration: z.number(), maxStacks: z.number().int(), damageShare: z.number() }).strict(),
      })
      .strict(),
    weakness: z.number(),
    resistance: z.number(),
    ashes: z.object({ perMinute: z.number(), dropChance: z.number(), elite: z.number(), boss: z.number(), brazier: z.number() }).strict(),
    gold: z
      .object({ dropChance: z.number(), min: z.number().int(), max: z.number().int(), chest: z.tuple([z.number(), z.number()]), boss: z.number(), skipCard: z.number(), cardGold: z.number() })
      .strict(),
    drops: z.object({ emberDropFromElite: z.number(), flameCallChance: z.number() }).strict(),
    cardHealShare: z.number(),
    luckPity: z.number().int(),
    boss: z.object({ arenaRadiusTiles: z.number(), minTelegraph: z.number() }).strict(),
    /** L'esquive juste : une ruée qui traverse un coup au moment où il frappe. */
    dodge: z.object({ power: z.number(), duration: z.number(), ult: z.number(), dashRefund: z.number().min(0).max(1) }).strict(),
    /** Les états du héros : la vase ralentit, et colle encore un instant après qu'on en est sorti. */
    heroStatuses: z.object({ mireSlow: z.number().min(0).max(0.9), mireLinger: z.number().positive() }).strict(),
    events: z
      .object({
        poiMinFromCenterTiles: z.number(),
        poiMinApartTiles: z.number(),
        discoverTiles: z.number(),
        brazier: z.object({ count: z.number().int(), radius: z.number(), seconds: z.number(), waveCount: z.number().int(), waveEnemy: enemyId }).strict(),
        spring: z.object({ count: z.number().int(), radius: z.number() }).strict(),
        cache: z.object({ count: z.number().int(), triggerRadius: z.number(), openRadius: z.number(), ashes: z.number() }).strict(),
        totem: z
          .object({ count: z.number().int(), radius: z.number(), seconds: z.number(), waveCount: z.number().int(), waveEnemy: enemyId, choices: z.number().int().positive() })
          .strict(),
        smith: z
          .object({ count: z.number().int(), radius: z.number(), dwell: z.number(), offers: z.number().int().positive(), basePrice: z.number().int(), priceStep: z.number().int() })
          .strict(),
        herbalist: z
          .object({
            count: z.number().int(), radius: z.number(), dwell: z.number(),
            services: z.object({ flask: priceSchema, balm: priceSchema, reroll: priceSchema, banish: priceSchema }).strict(),
          })
          .strict(),
        treasure: z.object({ count: z.number().int(), radius: z.number() }).strict(),
        /** Délai avant qu'un Souvenir laissé par un boss puisse être pris, en secondes. */
    memoryArmSeconds: z.number().nonnegative(),
    bossWarningMinute: z.number(),
      })
      .strict(),
    damageNumberInterval: z.number(),
  })
  .strict();

export const heroTuningSchema = z
  .object({
    maxLevel: z.number().int(),
    pointsPerLevel: z.object({ auto: z.number().int(), free: z.number().int(), talent: z.number().int() }).strict(),
    /** Points à placer dans une branche pour ouvrir ses étages 1 à 4. */
    talentTiers: z.array(z.number().int().nonnegative()).length(4),
    xpCurve: z.object({ base: z.number(), linear: z.number(), quadratic: z.number() }).strict(),
    shardCurve: z.object({ base: z.number(), growth: z.number() }).strict(),
    baseHp: z.number(),
    attributes: z
      .object({
        str: z.object({ knockback: z.number() }).strict(),
        agi: z.object({ speed: z.number(), speedCap: z.number(), critChance: z.number() }).strict(),
        spi: z.object({ zone: z.number(), duration: z.number() }).strict(),
        vig: z.object({ hp: z.number(), regen: z.number(), armor: z.number() }).strict(),
        luck: z.object({ luck: z.number(), critChance: z.number() }).strict(),
      })
      .strict(),
    damagePerScalePoint: z.number(),
    rewards: z
      .object({ perMinute: z.number(), perRunLevelSq: z.number(), perElite: z.number(), perBoss: z.number(), vigilGrowth: z.number() })
      .strict(),
  })
  .strict();

/** Ceux qui parlent dans un dialogue, dans l'ordre de leurs indices. */
export const SPEAKERS = ['moon', 'cream'] as const;
/** Les bulles qu'on peut poser au-dessus d'un personnage. */
export const EMOTES = ['exclaim', 'question', 'dots', 'drop', 'note'] as const;

const speakerSchema = z.enum(SPEAKERS);
const emoteSchema = z.enum(EMOTES);

/** Une ligne de dialogue : une réplique (qui, portrait, texte) ou une ligne muette (une durée). */
export const dialogueLineSchema = z
  .object({
    who: speakerSchema.optional(),
    face: z.string().optional(),
    /** Clé du texte dans fr.json. */
    text: z.string().optional(),
    poses: z.object({ moon: z.string().optional(), cream: z.string().optional() }).strict().optional(),
    emotes: z.object({ moon: emoteSchema.optional(), cream: emoteSchema.optional() }).strict().optional(),
    sfx: z.string().optional(),
    seconds: z.number().positive().optional(),
  })
  .strict();

export const dialoguesSchema = z
  .object({
    faces: z.object({ moon: z.array(z.string()).min(1), cream: z.array(z.string()).min(1) }).strict(),
    poses: z.object({ moon: z.array(z.string()), cream: z.array(z.string()) }).strict(),
    dialogues: z.record(z.string(), z.array(dialogueLineSchema).min(1)),
  })
  .strict();

export const WAIT_CONDITIONS = [
  'reach', 'clear', 'gems', 'card', 'healed', 'full', 'find', 'buy', 'boon', 'totem', 'kindle', 'lit', 'evolve', 'boss', 'time',
] as const;
export const PLACE_KINDS = ['spring', 'treasure', 'smith', 'totem', 'brazier'] as const;
export const BANNER_GLYPHS = ['move', 'dash', 'flask', 'skill', 'confirm'] as const;

/** Une étape du script du tutoriel. Les repères sont cités par leur nom. */
export const tutorialStepSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('say'), dialogue: z.string() }).strict(),
  z.object({ do: z.literal('bark'), text: z.string() }).strict(),
  z.object({ do: z.literal('guide'), to: z.string() }).strict(),
  z.object({ do: z.literal('banner'), text: z.string().nullable(), glyph: z.enum(BANNER_GLYPHS).optional() }).strict(),
  z.object({ do: z.literal('wait'), until: z.enum(WAIT_CONDITIONS), at: z.string().optional(), seconds: z.number().positive().optional() }).strict(),
  z.object({ do: z.literal('spawn'), enemy: enemyId, at: z.array(z.string()).min(1), count: z.number().int().positive().optional(), boss: z.boolean().optional() }).strict(),
  z.object({ do: z.literal('gate'), id: z.number().int().min(1).max(9) }).strict(),
  z.object({ do: z.literal('hurt'), share: z.number().positive().max(1) }).strict(),
  z.object({ do: z.literal('gold'), amount: z.number().int().positive(), at: z.string() }).strict(),
  z.object({ do: z.literal('gem'), at: z.string() }).strict(),
  z.object({ do: z.literal('place'), kind: z.enum(PLACE_KINDS), at: z.string() }).strict(),
  z.object({ do: z.literal('checkpoint'), at: z.string() }).strict(),
  /** L'arme de départ passe au niveau maximum avec sa relique liée : prête à évoluer. */
  z.object({ do: z.literal('ready') }).strict(),
  z.object({ do: z.literal('end') }).strict(),
]);

export const tutorialSchema = z
  .object({
    look: z
      .object({
        tileset: z.string(),
        wall: z.string(),
        darkness: z.object({ color: z.string(), opacity: z.number() }).strict(),
        music: z.object({ calm: z.string(), boss: z.string() }).strict(),
      })
      .strict(),
    tuning: z
      .object({
        /** Vitesse de Cream, en pixels par seconde. */
        guideSpeed: z.number().positive(),
        /** Marge que Cream garde au-delà de la lueur de Moon, en pixels. */
        guideKeep: z.number().nonnegative(),
        /** Distance à laquelle un repère est atteint, en pixels. */
        reachRadius: z.number().positive(),
        /** Invulnérabilité après une reprise, en secondes. */
        respawnInvuln: z.number().nonnegative(),
        /** Durée d'affichage d'une réplique courte, en secondes. */
        barkSeconds: z.number().positive(),
        /** Délai avant la première attaque du boss, en secondes. */
        bossDelay: z.number().nonnegative(),
        /** Écart entre plusieurs ennemis nés au même repère, en pixels. */
        spawnSpread: z.number().nonnegative(),
        /** Décalage de l'or sous son repère, en pixels (pour rester visible devant un trésor). */
        goldOffset: z.number(),
      })
      .strict(),
    /** La trouvaille que donne le trésor du tutoriel. */
    find: z.string().regex(/^find\.[a-z-]+$/),
    /** Les répliques de Cream après une mort, qui tournent. */
    deathBarks: z.array(z.string()).min(1),
    map: z
      .object({
        /** `#` mur, `.` sol, `1`-`9` barrière, `=` rangée d'Éteints, autre caractère : un repère sur du sol. */
        rows: z.array(z.string()).min(8),
        /** Nom du repère → son caractère dans la grille. */
        markers: z.record(z.string(), z.string().length(1)),
      })
      .strict(),
    start: z.string(),
    guideStart: z.string(),
    steps: z.array(tutorialStepSchema).min(2),
  })
  .strict();

/** Les souvenirs que gardent les boss. `total` : le nombre d'emplacements montrés au refuge. */
export const memoriesSchema = z
  .object({
    total: z.number().int().positive(),
    memories: z.array(
      z.object({ id: z.string().regex(/^memory\.[a-z-]+$/), boss: enemyId, cinematic: z.string(), scene: z.string().optional() }).strict(),
    ),
  })
  .strict();
export type MemoriesRaw = z.infer<typeof memoriesSchema>;

export type DialoguesRaw = z.infer<typeof dialoguesSchema>;
export type TutorialRaw = z.infer<typeof tutorialSchema>;
export type TutorialStepRaw = z.infer<typeof tutorialStepSchema>;
export type WaitCondition = (typeof WAIT_CONDITIONS)[number];
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type Attribute = z.infer<typeof attributeSchema>;
export type DamageTypeName = z.infer<typeof damageTypeSchema>;
export type WeaponParamsRaw = z.infer<typeof weaponParamsSchema>;
export type WeaponRaw = z.infer<typeof weaponSchema>;
export type EvolutionRaw = z.infer<typeof evolutionSchema>;
export type RelicRaw = z.infer<typeof relicSchema>;
export type StatBonus = z.infer<typeof statBonusSchema>;
export type CampDef = z.infer<typeof campSchema>;
export type CampObject = CampDef['objects'][number];
export type RunModsRaw = z.infer<typeof runModsSchema>;
export type PieceEffect = z.infer<typeof pieceEffectSchema>;
export type LanternRaw = z.infer<typeof lanternSchema>;
export type FlamesRaw = z.infer<typeof flamesSchema>;
export type FindDef = z.infer<typeof findSchema>;
export type EnemyRaw = z.infer<typeof enemySchema>;
export type RegionRaw = z.infer<typeof regionSchema>;
export type ClassRaw = z.infer<typeof classSchema>;
export type TalentNodeRaw = z.infer<typeof talentNodeSchema>;
export type AltarBoostRaw = z.infer<typeof altarBoostSchema>;
export type ExpeditionTuning = z.infer<typeof expeditionTuningSchema>;
export type HeroTuning = z.infer<typeof heroTuningSchema>;
