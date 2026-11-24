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
  })
  .strict();

const aimSchema = z.enum(['nearest', 'directed', 'around', 'orbit', 'random', 'placed']);
const behaviorSchema = z.enum(['arc', 'projectile', 'orbit', 'lob', 'nova']);

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

/** Un buff de totem ou une trouvaille : un bonus de statistiques pour la partie. */
export const boonSchema = z.object({ id: z.string().regex(/^boon\.[a-z-]+$/), icon: z.string(), bonus: statBonusSchema }).strict();
export const findSchema = z.object({ id: z.string().regex(/^find\.[a-z-]+$/), icon: z.string(), bonus: statBonusSchema }).strict();

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
    behavior: z.enum(['chase', 'zigzag', 'shooter', 'swarm', 'charger', 'spawner', 'boss-stag', 'boss-watcher']),
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
    pack: z.number().int().optional(),
    shot: z
      .object({ damage: z.number(), speed: z.number(), interval: z.number(), keepDistance: z.number(), radius: z.number(), life: z.number() })
      .strict()
      .optional(),
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
  })
  .strict();

export const regionSchema = z
  .object({
    id: id('region'),
    level: z.number().int(),
    tileset: z.string(),
    darkness: z.object({ color: z.string(), opacity: z.number() }).strict(),
    music: z.object({ calm: z.string(), boss: z.string() }).strict(),
    enemies: z.array(enemyId).length(5),
    elites: z.array(enemyId).length(2),
    boss: enemyId,
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
    passive: z.object({ kind: z.literal('closeDamage'), range: z.number(), bonus: z.number() }).strict(),
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
        speed: z.number(), radius: z.number(), glow: z.number(), invulnAfterHit: z.number(),
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
        /** Distance dont Moon doit s'écarter d'un Souvenir tombé sous ses pieds avant de pouvoir le prendre, en pixels. */
    memoryArmRadius: z.number().positive(),
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

export const WAIT_CONDITIONS = ['reach', 'clear', 'gems', 'card', 'healed', 'full', 'find', 'buy', 'boon', 'totem', 'boss', 'time'] as const;
export const PLACE_KINDS = ['spring', 'treasure', 'smith', 'totem'] as const;
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
      z.object({ id: z.string().regex(/^memory\.[a-z-]+$/), boss: enemyId, cinematic: z.string() }).strict(),
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
export type BoonDef = z.infer<typeof boonSchema>;
export type FindDef = z.infer<typeof findSchema>;
export type EnemyRaw = z.infer<typeof enemySchema>;
export type RegionRaw = z.infer<typeof regionSchema>;
export type ClassRaw = z.infer<typeof classSchema>;
export type AltarBoostRaw = z.infer<typeof altarBoostSchema>;
export type ExpeditionTuning = z.infer<typeof expeditionTuningSchema>;
export type HeroTuning = z.infer<typeof heroTuningSchema>;
