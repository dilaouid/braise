import { z } from 'zod';
import introJson from '../../content/cinematics/intro.json';
import frJson from '../../content/i18n/fr.json';

/**
 * Les cinématiques (document 15) : des tableaux animés décrits plan par plan dans
 * content/cinematics/<id>.json. Les temps sont en secondes, comptés depuis le début du plan.
 * Les positions sont en pixels de l'image native (640 × 360).
 */

const vec = z.tuple([z.number(), z.number()]);
const range = z.tuple([z.number(), z.number()]);
const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const timing = { start: z.number().min(0).optional(), end: z.number().min(0).optional() };

const imageLayer = z
  .object({
    type: z.literal('image'),
    asset: z.string(),
    /** Position du point d'ancrage ; `to` fait glisser l'image de `at` à `to` entre `start` et `end`. */
    at: vec,
    to: vec.optional(),
    /** Par défaut, le milieu du bas de l'image : les pieds. */
    anchor: vec.optional(),
    /** Images par seconde d'une animation. Sans `fps`, l'image `frame` reste fixe. */
    fps: z.number().positive().optional(),
    frame: z.number().int().min(0).optional(),
    flip: z.boolean().optional(),
    fadeIn: z.number().min(0).optional(),
    /** Couleurs froides : un personnage après la fumée. */
    cold: z.boolean().optional(),
    /** La couleur s'en va en vague, depuis un bord, entre `start` et `end`. */
    desat: z.object({ start: z.number().min(0), end: z.number().min(0), from: z.enum(['left', 'right']) }).strict().optional(),
    ...timing,
  })
  .strict();

const smokeLayer = z
  .object({
    type: z.literal('smoke'),
    /** Zone où naissent les volutes : x, y, largeur, hauteur. */
    area: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    /** Dérive en pixels par seconde. */
    drift: vec,
    count: z.number().int().min(1).max(200),
    radius: range,
    /** Opacité au début et à la fin du calque. */
    alpha: range,
    colors: z.array(hex).min(1).optional(),
    /** Un front qui avance : aucune volute à droite de lui. */
    front: z.object({ from: z.number(), to: z.number() }).strict().optional(),
    ...timing,
  })
  .strict();

const lightLayer = z
  .object({
    type: z.literal('light'),
    at: vec,
    /** Rayon au début et à la fin du calque. */
    radius: range,
    /** Force de la teinte chaude, de 0 à 1. */
    warm: z.number().min(0).max(1),
    ...timing,
  })
  .strict();

const eyesLayer = z
  .object({
    type: z.literal('eyes'),
    area: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    count: z.number().int().min(1).max(40),
    /** Secondes entre deux paires d'yeux. */
    interval: z.number().positive(),
    /** Un disque où aucun œil ne s'ouvre : x, y, rayon. */
    avoid: z.tuple([z.number(), z.number(), z.number()]).optional(),
    ...timing,
  })
  .strict();

const fillLayer = z
  .object({ type: z.literal('fill'), color: hex, alpha: range, ...timing })
  .strict();

export const cineLayerSchema = z.discriminatedUnion('type', [imageLayer, smokeLayer, lightLayer, eyesLayer, fillLayer]);

export const cineCueSchema = z
  .object({
    at: z.number().min(0),
    sfx: z.string().optional(),
    volume: z.number().min(0).max(1).optional(),
    /** Lance une musique, une seule fois (pas de boucle). */
    music: z.string().optional(),
    musicStop: z.boolean().optional(),
    /** Ralentit (ou accélère) la musique en cours ; la hauteur suit. */
    musicRate: z.object({ to: z.number().min(0.25).max(2), over: z.number().min(0) }).strict().optional(),
  })
  .strict();

export const cineShotSchema = z
  .object({
    id: z.string(),
    duration: z.number().positive(),
    /** Clé de fr.json d'un carton de texte. */
    card: z.string().optional(),
    /** Clé de fr.json de la ligne de récit, affichée en bas de l'image à partir de `captionAt` (0,8 s par défaut). */
    caption: z.string().optional(),
    captionAt: z.number().min(0).optional(),
    fadeIn: z.number().min(0).optional(),
    fadeOut: z.number().min(0).optional(),
    /** Décalage du décor : il glisse de `from` à `to` pendant le plan. */
    camera: z.object({ from: vec, to: vec }).strict().optional(),
    layers: z.array(cineLayerSchema),
    cues: z.array(cineCueSchema).optional(),
  })
  .strict();

export const cinematicSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    skipHoldMs: z.number().int().min(200),
    /** Nom de l'image → source dans assets/source/ ; `frames` : première et dernière image d'une animation. */
    assets: z.record(z.string(), z.object({ src: z.string(), frames: z.tuple([z.number().int(), z.number().int()]).optional() }).strict()),
    shots: z.array(cineShotSchema).min(1),
  })
  .strict();

export type CineLayer = z.infer<typeof cineLayerSchema>;
export type CineCue = z.infer<typeof cineCueSchema>;
export type CineShot = z.infer<typeof cineShotSchema>;
export type Cinematic = z.infer<typeof cinematicSchema>;

/** La durée totale, en secondes. */
export function cinematicDuration(c: Cinematic): number {
  return c.shots.reduce((sum, s) => sum + s.duration, 0);
}

/** Le nombre d'images d'un asset (1 pour une image fixe). */
export function assetFrames(c: Cinematic, name: string): number {
  const a = c.assets[name];
  return a?.frames ? a.frames[1] - a.frames[0] + 1 : 1;
}

/**
 * Valide une cinématique et ses références : assets, textes, temps dans le plan, sons connus.
 * `sounds` : les noms de public/audio/index.json, s'ils sont connus (sinon les sons ne sont pas vérifiés).
 */
export function compileCinematic(raw: unknown, fr: Record<string, string>, sounds?: Set<string>): { cinematic: Cinematic | null; errors: string[] } {
  const res = cinematicSchema.safeParse(raw);
  if (!res.success) {
    return { cinematic: null, errors: res.error.issues.map((i) => `cinematics: ${i.path.join('.')} — ${i.message}`) };
  }
  const c = res.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [name, a] of Object.entries(c.assets)) {
    if (a.frames && (a.frames[1] < a.frames[0] || !a.src.includes('{i}'))) errors.push(`${c.id}: animation « ${name} » mal décrite`);
  }
  for (const shot of c.shots) {
    const where = `${c.id}/${shot.id}`;
    if (ids.has(shot.id)) errors.push(`${where}: plan en double`);
    ids.add(shot.id);
    if (shot.card !== undefined && !fr[shot.card]) errors.push(`${where}: texte manquant « ${shot.card} »`);
    if (shot.caption !== undefined && !fr[shot.caption]) errors.push(`${where}: texte manquant « ${shot.caption} »`);
    if ((shot.captionAt ?? 0) > shot.duration) errors.push(`${where}: récit après la fin du plan`);
    for (const layer of shot.layers) {
      if (layer.type === 'image') {
        if (!c.assets[layer.asset]) errors.push(`${where}: image inconnue « ${layer.asset} »`);
        else if (layer.frame !== undefined && layer.frame >= assetFrames(c, layer.asset)) errors.push(`${where}: image ${layer.frame} hors de « ${layer.asset} »`);
      }
      const start = layer.start ?? 0;
      const end = layer.end ?? shot.duration;
      if (start > shot.duration || end > shot.duration + 1e-6 || end < start) errors.push(`${where}: calque ${layer.type} hors du plan (${start} → ${end})`);
    }
    for (const cue of shot.cues ?? []) {
      if (cue.at > shot.duration) errors.push(`${where}: signal à ${cue.at} s, après la fin du plan`);
      const kinds = [cue.sfx, cue.music, cue.musicStop, cue.musicRate].filter((v) => v !== undefined).length;
      if (kinds !== 1) errors.push(`${where}: un signal fait une seule chose (à ${cue.at} s)`);
      if (sounds && cue.sfx && !sounds.has(`sfx-${cue.sfx}`)) errors.push(`${where}: son inconnu « ${cue.sfx} »`);
      if (sounds && cue.music && !sounds.has(cue.music)) errors.push(`${where}: musique inconnue « ${cue.music} »`);
    }
  }
  return errors.length > 0 ? { cinematic: null, errors } : { cinematic: c, errors };
}

let intro: Cinematic | null = null;

/** La cinématique d'intro, validée. Lève une erreur lisible si elle est fausse. */
export function introCinematic(): Cinematic {
  if (intro) return intro;
  const { cinematic, errors } = compileCinematic(introJson, frJson as unknown as Record<string, string>);
  if (!cinematic) throw new Error(`Cinématique invalide :\n${errors.join('\n')}`);
  intro = cinematic;
  return intro;
}

/** Le fichier brut, pour les outils et les tests. */
export const INTRO_RAW: unknown = introJson;
