/** Options de la boucle à pas fixe. */
export interface FixedLoopOptions {
  /** Durée d'un pas de simulation, en secondes (1/60 par défaut). */
  step?: number;
  /** Nombre maximum de pas par image : au-delà, le jeu ralentit au lieu de s'emballer. */
  maxSteps?: number;
  /** Un pas de simulation. Renvoie false pour ne pas consommer de temps (pause). */
  update: (dt: number) => void;
  /** Une image. `alpha` est la part du pas en cours, pour interpoler ; `frameMs` le temps réel écoulé. */
  render: (alpha: number, frameMs: number) => void;
  /** Vrai quand la simulation est en pause : le temps ne s'accumule pas. */
  isPaused?: () => boolean;
}

/** Une boucle à pas fixe, pilotée par requestAnimationFrame. */
export interface FixedLoop {
  start(): void;
  stop(): void;
  /** Avance d'un temps réel donné, sans attendre l'affichage (tests). */
  advance(ms: number): void;
}

/**
 * Crée une boucle qui exécute la simulation par pas de durée fixe,
 * quelle que soit la fréquence de l'écran.
 */
export function createFixedLoop(options: FixedLoopOptions): FixedLoop {
  const step = options.step ?? 1 / 60;
  const maxSteps = options.maxSteps ?? 5;
  const stepMs = step * 1000;
  let acc = 0;
  let last = 0;
  let handle = 0;
  let running = false;

  function advance(ms: number): void {
    if (options.isPaused?.()) {
      acc = 0;
    } else {
      acc += ms;
      let steps = 0;
      while (acc >= stepMs && steps < maxSteps) {
        options.update(step);
        acc -= stepMs;
        steps++;
        if (options.isPaused?.()) {
          acc = 0;
          break;
        }
      }
      if (acc > stepMs) acc = stepMs;
    }
    options.render(acc / stepMs, ms);
  }

  function frame(now: number): void {
    if (!running) return;
    const elapsed = last === 0 ? stepMs : Math.min(250, now - last);
    last = now;
    advance(elapsed);
    handle = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      handle = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
    advance,
  };
}
