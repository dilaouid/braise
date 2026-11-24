import { expect, test, type Page } from '@playwright/test';
import {
  DIALOGUES, FR, SimPad, capture, expectFocus, fixtureSave, plantSave, runView, saveView, settle, skipIntro, skipScene, skipTutorial, storageKey, toObject, watch,
} from './harness.ts';

const SHOTS = 'tutoriel-cream';
const CLASS = 'class.ash-blade';
/** La n-ième réplique de l'ouverture (à partir de 1), dans l'ordre où elle se joue ; les silences ne comptent pas. */
const SPOKEN = DIALOGUES['tuto.opening']!.filter((l) => l.who !== undefined);
const LINE = (n: number): string => FR[SPOKEN[n - 1]!.text!]!;

const text = (page: Page) => page.locator('.dialogue-text');

/** Ce que le tutoriel ajoute à l'état d'une partie. */
function tutoView(page: Page): Promise<{ line: number; dialogue: string | null; banner: string | null; step: number; done: boolean } | null> {
  return page.evaluate(() => {
    const tu = (window as unknown as { __braise: { run: any } }).__braise.run?.tutorial;
    return tu ? { line: tu.line, dialogue: tu.dialogue, banner: tu.banner, step: tu.step, done: tu.done } : null;
  });
}

/** Le fichier de sauvegarde tel qu'il est écrit sur le disque. */
function stored(page: Page): Promise<any> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey('save.json'));
}

/** Du titre à la première réplique du tutoriel, sur une sauvegarde neuve. */
async function toOpening(page: Page, pad: SimPad): Promise<void> {
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  // Une sauvegarde neuve n'a rien à rejouer.
  await expect(page.locator('[data-focus="tutorial"]')).toHaveCount(0);
  await settle(page);
  await pad.press('A');
  await skipIntro(page, pad);
  await expect(text(page)).toHaveText(LINE(1));
}

/**
 * Fait jouer le robot du tutoriel dans la page jusqu'à ce que `until` soit vrai (ou que le tutoriel
 * finisse). La simulation est tenue entre deux appels : rien ne bouge pendant une capture.
 */
function botUntil(page: Page, until: 'lesson' | 'card' | 'find' | 'telegraph' | 'done'): Promise<boolean> {
  return page.evaluate((goal) => {
    const b = (window as unknown as { __braise: { run: any; advance(steps: number, stop: boolean): string; hold(on: boolean): void } }).__braise;
    b.hold(true);
    for (let i = 0; i < 200_000; i++) {
      const run = b.run;
      if (!run || run.phase === 'victory') return goal === 'done';
      // Le choix qu'une leçon attend (la carte du gros éclat, la trouvaille du trésor) est laissé au joueur.
      const step = run.tutorial.def.steps[run.tutorial.step];
      if (goal === 'card' && run.phase === 'levelup' && step.until === 'card') return true;
      if (goal === 'find' && run.phase === 'find' && step.until === 'find') return true;
      if (run.phase === 'playing') {
        if (goal === 'lesson' && run.tutorial.banner === 'tuto.banner.attack' && run.enemies.count >= 2) {
          // Deux Rampants près de Moon : la leçon se voit.
          const e = run.enemies;
          let near = 0;
          for (let k = 0; k < e.count; k++) if (Math.hypot(e.x[k] - run.hero.x, e.y[k] - run.hero.y) < 150) near++;
          if (near >= 2) return true;
        }
        if (goal === 'telegraph' && run.director.bossUid !== 0 && run.telegraphs.count > 0) {
          const tg = run.telegraphs;
          if (tg.t[0] / tg.duration[0] > 0.45) return true;
        }
      }
      // Un pas à la fois : un choix ouvert par ce pas est vu ici avant d'être résolu par le robot.
      b.advance(1, false);
    }
    return false;
  }, until);
}

/** Tient la simulation et l'écriture des dialogues (vrai), ou rend la main au jeu (faux). */
function hold(page: Page, on: boolean): Promise<void> {
  return page.evaluate((v) => (window as unknown as { __braise: { hold(on: boolean): void } }).__braise.hold(v), on);
}
const release = (page: Page): Promise<void> => hold(page, false);

test('sauvegarde neuve : intro passée, première réplique, passer le tutoriel, refuge avec Cream', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await toOpening(page, pad);

  // La boîte : Moon parle, son portrait est à gauche, la partie est en pause.
  await expect(page.locator('.dialogue.dialogue-moon')).toBeVisible();
  await expect(page.locator('.dialogue-name')).toHaveText(FR['dialog.name.moon']!);
  expect((await runView(page))!.phase).toBe('dialogue');
  expect((await saveView(page)).account.unlocks).toContain('seen.intro');
  // Le HUD du tutoriel : le nom du lieu, ni chronomètre ni mini-carte.
  await expect(page.locator('.hud .place')).toHaveText(FR['hud.tutorial']!);
  await expect(page.locator('.hud .clock')).toHaveCount(0);
  await expect(page.locator('#minimap')).toHaveCount(0);

  // A passe à la ligne suivante : Moon parle encore.
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(2));
  await expect(page.locator('.dialogue.dialogue-moon')).toBeVisible();

  // A passe à la ligne suivante : c'est Cream, à droite. L'écriture est tenue, pour voir que le
  // A suivant finit la ligne au lieu de la passer.
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await settle(page);
  await hold(page, true);
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(3));
  await expect(page.locator('.dialogue.dialogue-cream')).toBeVisible();
  await expect(page.locator('.dialogue-name')).toHaveText(FR['dialog.name.cream']!);
  await expect(page.locator('.dialogue-next.ready')).toHaveCount(0);
  await expect(page.locator('.dialogue-rest')).not.toHaveText('');
  await pad.press('A');
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await expect(page.locator('.dialogue-rest')).toHaveText('');
  expect((await tutoView(page))!.line).toBe(2);
  await hold(page, false);

  // Jusqu'à « TU PARLES ?! » : la ligne muette (le silence) passe seule, sans boîte.
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(4));
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(5));
  await expect(text(page)).toHaveText('TU PARLES ?!');
  await expect(page.locator('.dialogue.dialogue-moon')).toBeVisible();
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  // Le temps que la caméra finisse de glisser et que la bulle retombe.
  await page.waitForTimeout(700);
  await capture(page, info, SHOTS, '01-ouverture');

  // Pause, « Passer le tutoriel », confirmation : le refuge, sans écran de bilan.
  await skipTutorial(page, pad);
  await expect(page.locator('.screen.end')).toHaveCount(0);
  expect(await runView(page)).toBeNull();
  await expect(page.locator('[data-focus="cream"]')).toBeVisible();
  await expect(page.locator('[data-focus="cream"]')).toContainText(FR['camp.object.cream']!);
  const save = await saveView(page);
  expect(save.account.unlocks).toContain('seen.tutorial');
  expect(save.account.gold).toBe(0);
  expect(save.account.ashes).toBe(0);
  expect(save.heroes[CLASS]).toMatchObject({ level: 1, xp: 0 });
  await expect.poll(async () => (await stored(page))?.account.unlocks ?? []).toContain('seen.tutorial');

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('quitter au milieu : au départ suivant, le tutoriel reprend à la première réplique', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await toOpening(page, pad);
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(2));
  await expect.poll(async () => (await stored(page))?.account.unlocks ?? []).toContain('seen.intro');

  // Le jeu est quitté en plein dialogue.
  await page.reload();
  await expect(page.locator('.screen.title')).toBeVisible();
  const save = await saveView(page);
  expect(save.account.unlocks).not.toContain('seen.tutorial');
  expect(Object.keys(save.heroes)).toEqual([]);
  // Pas encore de héros ni de tutoriel fini : rien à rejouer au titre.
  await expect(page.locator('[data-focus="tutorial"]')).toHaveCount(0);
  await settle(page);
  await pad.press('A');
  // Le prologue ne se rejoue pas : le tutoriel reprend au début.
  await expect(page.locator('.screen.cinematic')).toHaveCount(0);
  await expect(text(page)).toHaveText(LINE(1));
  expect((await tutoView(page))!.line).toBe(0);

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('une sauvegarde avec héros va droit au refuge, Cream y est, et « Rejouer le tutoriel » est au titre', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, fixtureSave('v1-m1-new'));
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await expect(page.locator('[data-focus="tutorial"]')).toHaveText(FR['title.tutorial']!);

  // Rejouer depuis le titre : le tutoriel se lance, et le passer ramène au titre sans toucher à la sauvegarde.
  await settle(page);
  await page.locator('[data-focus="tutorial"]').click();
  await expect(text(page)).toHaveText(LINE(1));
  await settle(page);
  await pad.press('START');
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  await settle(page);
  await pad.press('DOWN');
  await pad.press('DOWN');
  await expectFocus(page, 'skip-tutorial');
  await pad.press('A');
  await pad.press('RIGHT');
  await expectFocus(page, 'yes');
  await pad.press('A');
  await expect(page.locator('.screen.title')).toBeVisible();
  expect(await runView(page)).toBeNull();
  expect((await saveView(page)).account.unlocks).not.toContain('seen.tutorial');

  // Le départ : ni prologue ni tutoriel, le refuge tout de suite.
  await settle(page);
  await page.locator('[data-focus="start"]').click();
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.screen.cinematic')).toHaveCount(0);
  expect(await runView(page)).toBeNull();
  await expect(page.locator('[data-focus="cream"]')).toBeVisible();
  expect((await saveView(page)).account.unlocks).not.toContain('seen.tutorial');

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('Cream au refuge dit une réplique, puis la boîte se ferme', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await plantSave(page, fixtureSave('v1-m1-new'));
  await page.goto('./');
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await toObject(page, pad, 'cream');
  await pad.press('A');

  const lines = [1, 2, 3, 4, 5, 6].map((n) => FR[`camp.cream.${n}`]!);
  await expect(page.locator('.dialogue.dialogue-cream')).toBeVisible();
  await expect(page.locator('.dialogue-name')).toHaveText(FR['dialog.name.cream']!);
  const said = (await text(page).textContent())!;
  expect(lines).toContain(said);
  // Une réplique seule : rien à passer ; une fois écrite, A la ferme.
  await expect(page.locator('.dialogue-skip')).toHaveCount(0);
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await capture(page, info, SHOTS, '04-refuge-cream');
  await pad.press('A');
  await expect(page.locator('.dialogue')).toHaveCount(0);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'cream');

  // B la ferme aussi, et il ne dit pas deux fois la même de suite.
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.dialogue')).toBeVisible();
  expect(await text(page).textContent()).not.toBe(said);
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.dialogue')).toHaveCount(0);
  // Le refuge répond toujours.
  await toObject(page, pad, 'door');

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('dialogue à la manette : A avance, B maintenu passe tout le dialogue et le jeu reprend', async ({ page }) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await toOpening(page, pad);
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(text(page)).toHaveText(LINE(2));

  // Un appui court sur B ne passe rien.
  await pad.press('B');
  await expect(text(page)).toHaveText(LINE(2));
  expect((await runView(page))!.phase).toBe('dialogue');

  // B maintenu : la jauge se remplit, puis tout le dialogue est passé.
  await pad.down('B');
  await expect(page.locator('.dialogue-skip.active')).toBeVisible();
  await expect(page.locator('.dialogue')).toHaveCount(0);
  await pad.up('B');
  await expect.poll(async () => (await runView(page))!.phase).toBe('playing');
  // La première leçon : le bandeau, avec le dessin du stick.
  await expect(page.locator('.hud .lesson')).toContainText(FR['tuto.banner.move']!);
  await expect(page.locator('.hud .lesson .glyph')).toHaveText('L');
  expect((await tutoView(page))!.dialogue).toBeNull();

  // Le jeu a bien repris : Moon avance au stick.
  const before = (await runView(page))!;
  await pad.stick(1, 0);
  await page.waitForTimeout(400);
  await pad.stick(0, 0);
  expect((await runView(page))!.x).toBeGreaterThan(before.x + 10);

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});

test('le tutoriel entier se termine : le robot le joue jusqu\'au bout, puis le refuge sans écran de bilan', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await toOpening(page, pad);

  // Une leçon : la salle des premiers Rampants, son bandeau, Cream qui attend à la porte.
  expect(await botUntil(page, 'lesson')).toBe(true);
  await expect(page.locator('.hud .lesson')).toContainText(FR['tuto.banner.attack']!);
  // Le robot a joué plus vite que l'image : on laisse les effets passés (fumée dissipée) s'éteindre.
  await page.waitForTimeout(900);
  await capture(page, info, SHOTS, '02-lecon');

  // Review Focus 3, à l'écran : le niveau gagné s'ouvre, et le dialogue qui suit la carte prend sa place.
  expect(await botUntil(page, 'card')).toBe(true);
  await release(page);
  await expect(page.locator('.backdrop.levelup')).toBeVisible();
  await expectFocus(page, 'card0');
  await settle(page);
  await pad.press('A');
  await expect(text(page)).toHaveText(FR['dialog.tuto.room2.b.1']!);
  await expect(page.locator('.backdrop.levelup')).toHaveCount(0);
  await expect(page.locator('.dialogue.dialogue-moon')).toBeVisible();

  // De même pour la trouvaille du trésor : fermée, Cream parle du Ferrailleur.
  expect(await botUntil(page, 'find')).toBe(true);
  await release(page);
  await expect(page.locator('.backdrop.find')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(text(page)).toHaveText(FR['dialog.tuto.room5.b.1']!);
  await expect(page.locator('.backdrop.find')).toHaveCount(0);
  // La plus longue réplique du tutoriel tient dans la boîte.
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await capture(page, info, SHOTS, '05-replique-longue');

  // Le Guetteur : sa barre de vie porte son nom, et son attaque est annoncée au sol.
  expect(await botUntil(page, 'telegraph')).toBe(true);
  await expect(page.locator('.bossbar .boss-name')).toHaveText(FR['boss.watcher.name']!);
  await page.waitForTimeout(900);
  await capture(page, info, SHOTS, '03-guetteur');

  // Jusqu'au bout : toutes les leçons faites, puis la scène de route, puis le refuge.
  expect(await botUntil(page, 'done')).toBe(true);
  await expect(page.locator('.screen.scene')).toBeVisible();
  await expect(page.locator('.screen.end')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __braise: { scene: { id: string | null } } }).__braise.scene.id)).toBe('after-tutorial');
  // Ils marchent jusqu'à leur halte, puis Cream parle.
  await page.evaluate(() => (window as unknown as { __braise: { scene: { advance(s: number): void } } }).__braise.scene.advance(6));
  await expect(page.locator('.dialogue.dialogue-cream')).toBeVisible();
  await expect(text(page)).toHaveText(FR['dialog.scene.after-tutorial.1.1']!);
  await page.waitForTimeout(600);
  await capture(page, info, SHOTS, '06-scene-route');
  // A passe à la réplique suivante.
  await settle(page);
  await expect(page.locator('.dialogue-next.ready')).toBeVisible();
  await pad.press('A');
  await expect(text(page)).toHaveText(FR['dialog.scene.after-tutorial.1.2']!);
  await skipScene(page, pad);
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expect(page.locator('.screen.end')).toHaveCount(0);
  expect(await runView(page)).toBeNull();
  await expect(page.locator('[data-focus="cream"]')).toBeVisible();
  const save = await saveView(page);
  expect(save.account.unlocks).toContain('seen.tutorial');
  // Rien n'est rapporté du tutoriel.
  expect(save.account.gold).toBe(0);
  expect(save.account.ashes).toBe(0);
  expect(save.account.stats.runs ?? 0).toBe(0);
  expect(save.heroes[CLASS]).toMatchObject({ level: 1, xp: 0 });

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});
