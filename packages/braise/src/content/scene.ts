import { z } from 'zod';
import afterMemoryMeetingJson from '../../content/scenes/after-memory-meeting.json';
import afterMemoryWeddingJson from '../../content/scenes/after-memory-wedding.json';
import afterTutorialJson from '../../content/scenes/after-tutorial.json';

/**
 * Les scènes de route : Moon et Cream rentrent à pied au refuge en se parlant, dans le décor du
 * refuge (docs/superpowers/specs/2026-11-24-scenes-de-route-design.md). Une scène par fichier,
 * content/scenes/<id>.json. Les positions sont en pixels de l'image native (640 × 360).
 */

/** Les places du refuge : la scène finit toujours là, et l'écran du refuge prend la main. */
export const CAMP_MOON = { x: 366, y: 214 } as const;
export const CAMP_CREAM = { x: 276, y: 216 } as const;

const vec = z.tuple([z.number(), z.number()]);

export const sceneStepSchema = z.discriminatedUnion('do', [
  /** Chacun marche en ligne droite vers son point ; l'étape attend que tous soient arrivés. */
  z.object({ do: z.literal('move'), moon: vec.optional(), cream: vec.optional() }).strict(),
  /** Joue un dialogue de dialogues.json. */
  z.object({ do: z.literal('say'), dialogue: z.string() }).strict(),
  z.object({ do: z.literal('wait'), seconds: z.number().positive() }).strict(),
  /** Le feu s'allume. */
  z.object({ do: z.literal('kindle') }).strict(),
]);

export const sceneSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** Le feu est-il allumé au début de la scène ? */
    fire: z.boolean(),
    moon: vec,
    cream: vec,
    steps: z.array(sceneStepSchema).min(1),
  })
  .strict();

export type SceneStep = z.infer<typeof sceneStepSchema>;
export type SceneDef = z.infer<typeof sceneSchema>;

/** Les fichiers bruts des scènes, par identifiant. Une scène de plus : une ligne ici. */
export const SCENES_RAW: Record<string, unknown> = {
  'after-tutorial': afterTutorialJson,
  'after-memory-meeting': afterMemoryMeetingJson,
  'after-memory-wedding': afterMemoryWeddingJson,
};

/** Valide une scène ; `dialogues` : les identifiants connus de dialogues.json. */
export function compileScene(raw: unknown, dialogues: Set<string>): { scene: SceneDef | null; errors: string[] } {
  const res = sceneSchema.safeParse(raw);
  if (!res.success) return { scene: null, errors: res.error.issues.map((i) => `scenes: ${i.path.join('.')} — ${i.message}`) };
  const scene = res.data;
  const errors: string[] = [];
  scene.steps.forEach((step, n) => {
    if (step.do === 'say' && !dialogues.has(step.dialogue)) errors.push(`scenes/${scene.id}[${n}]: dialogue inconnu « ${step.dialogue} »`);
    if (step.do === 'move' && !step.moon && !step.cream) errors.push(`scenes/${scene.id}[${n}]: un déplacement sans personne`);
  });
  return errors.length > 0 ? { scene: null, errors } : { scene, errors };
}

/** Compile toutes les scènes ; les erreurs sont ajoutées à `errors`. */
export function compileScenes(raws: Record<string, unknown>, dialogues: Set<string>, errors: string[]): Record<string, SceneDef> {
  const out: Record<string, SceneDef> = {};
  for (const [id, raw] of Object.entries(raws)) {
    const res = compileScene(raw, dialogues);
    errors.push(...res.errors);
    if (!res.scene) continue;
    if (res.scene.id !== id) errors.push(`scenes: le fichier de « ${id} » porte l'identifiant « ${res.scene.id} »`);
    out[id] = res.scene;
  }
  return out;
}
