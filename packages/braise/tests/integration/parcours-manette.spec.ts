import { expect, test } from '@playwright/test';
import {
  FR, SimPad, capture, expectFocus, fastForward, runView, saveView, settle, skipIntro, storageKey, waitFrames, watch,
} from './harness.ts';

const SHOTS = 'parcours-manette';
const STEPS_PER_SECOND = 60;

/**
 * Le parcours du jalon M1 (document 13), à la manette seule : de l'écran titre à l'écran de fin,
 * puis une seconde expédition avec un boost acheté. Chaque écran est capturé.
 */
test('de l\'écran titre à l\'écran de fin, puis une seconde expédition avec un boost acheté', async ({ page }, info) => {
  const seen = watch(page);
  const pad = await SimPad.install(page);
  await page.goto('./');

  // --- Écran titre -------------------------------------------------------------------------
  await expect(page.locator('.screen.title')).toBeVisible();
  await expectFocus(page, 'start');
  await capture(page, info, SHOTS, '01-titre');
  await settle(page);
  await pad.press('A');

  // --- Prologue (sauvegarde neuve), passé en maintenant B -----------------------------------
  await expect(page.locator('.screen.cinematic')).toBeVisible();
  await expect(page.locator('.cine-card')).toHaveText(FR['cine.intro.card.village']!);
  await capture(page, info, SHOTS, '01b-prologue');
  await skipIntro(page, pad);
  expect((await saveView(page)).account.unlocks).toContain('seen.intro');

  // --- Camp --------------------------------------------------------------------------------
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'depart');
  // Les invites suivent le dernier périphérique utilisé : ici la manette.
  await expect(page.locator('.helpbar .glyph-confirm')).toHaveText('A');
  await expect(page.locator('.camp-info')).toContainText(FR['camp.hero']!.replace('{level}', '1'));
  await capture(page, info, SHOTS, '02-camp');

  // Un appui bref ne fait pas partir : « Partir » se maintient une demi-seconde.
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  expect(await runView(page)).toBeNull();

  // --- Autel, sans Cendres -----------------------------------------------------------------
  await pad.press('DOWN');
  await expectFocus(page, 'altar');
  await pad.press('A');
  await expect(page.locator('.screen.altar')).toBeVisible();
  await expectFocus(page, 'altar.ardor');
  await capture(page, info, SHOTS, '03-autel-sans-cendres');
  await settle(page);
  await pad.press('A');
  expect((await saveView(page)).account.altar).toEqual({});
  await pad.press('RIGHT');
  await expectFocus(page, 'altar.endurance');
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();
  // Au retour, le focus est là où il était.
  await expectFocus(page, 'altar');

  // --- Réglages ----------------------------------------------------------------------------
  await settle(page);
  await pad.press('DOWN');
  await expectFocus(page, 'settings');
  await pad.press('A');
  await expect(page.locator('.screen.settings')).toBeVisible();
  await expectFocus(page, 'volumeMaster');
  await capture(page, info, SHOTS, '04-reglages');
  const volume = (await saveView(page)).settings.volumeMaster as number;
  await pad.press('LEFT');
  expect((await saveView(page)).settings.volumeMaster).toBeCloseTo(volume - 0.1, 5);
  await pad.press('RIGHT');
  expect((await saveView(page)).settings.volumeMaster).toBeCloseTo(volume, 5);
  await settle(page);
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();
  await expectFocus(page, 'settings');

  // --- Première expédition -----------------------------------------------------------------
  await pad.press('UP');
  await pad.press('UP');
  await expectFocus(page, 'depart');
  await settle(page);
  await pad.down('A');
  await expect(page.locator('.hud')).toBeVisible();
  await pad.up('A');
  await settle(page);

  // Le stick déplace le héros, A lance la ruée.
  const start = (await runView(page))!;
  expect(start.phase).toBe('playing');
  await pad.stick(1, 0);
  await page.waitForTimeout(1000);
  await pad.stick(0, 0);
  const moved = (await runView(page))!;
  expect(moved.x).toBeGreaterThan(start.x + 40);
  expect(moved.time).toBeGreaterThan(start.time + 0.5);
  await pad.stick(0, 1);
  await pad.press('A');
  expect((await runView(page))!.dashCd).toBeGreaterThan(0);
  await pad.stick(0, 0);
  await capture(page, info, SHOTS, '05-expedition');

  // Start met en pause : le temps s'arrête. Start reprend.
  await pad.press('START');
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  await expectFocus(page, 'resume');
  const frozen = (await runView(page))!.time;
  await page.waitForTimeout(400);
  expect((await runView(page))!.time).toBe(frozen);
  await capture(page, info, SHOTS, '06-pause');
  await pad.press('START');
  await expect(page.locator('.backdrop.pause')).toBeHidden();
  await page.waitForTimeout(300);
  expect((await runView(page))!.time).toBeGreaterThan(frozen);

  // Une montée de niveau : la partie s'arrête, on choisit une carte avec la croix et A.
  let view = await fastForward(page, 3 * 60 * STEPS_PER_SECOND, true);
  expect(view.phase).toBe('levelup');
  await expect(page.locator('.backdrop.levelup')).toBeVisible();
  await expectFocus(page, 'card0');
  await capture(page, info, SHOTS, '07-montee-de-niveau');
  await pad.press('RIGHT');
  await expectFocus(page, 'card1');
  for (let i = 0; i < 6 && (await runView(page))!.phase === 'levelup'; i++) {
    await settle(page);
    await pad.press('A');
  }
  expect((await runView(page))!.phase).toBe('playing');
  await expect(page.locator('.backdrop.levelup')).toBeHidden();

  // Jusqu'à 4:10, puis la mort : le héros, à un point de vie, ne bouge plus.
  view = await fastForward(page, Math.ceil((250 - view.time) * STEPS_PER_SECOND), false);
  expect(view.time).toBeGreaterThanOrEqual(240);
  await waitFrames(page, 10);
  await capture(page, info, SHOTS, '08-horde');
  await page.evaluate(() => {
    const braise = (window as unknown as { __braise: { run: any } }).__braise;
    braise.run.hero.hp = 1;
  });
  for (let i = 0; i < 90 && !(await page.locator('.screen.end').isVisible()); i++) {
    // Une carte ou un coffre peut tomber pendant l'attente : A les valide.
    const phase = (await runView(page))?.phase;
    if (phase === 'levelup' || phase === 'chest') await pad.press('A');
    await page.waitForTimeout(500);
  }

  // --- Écran de fin : défaite --------------------------------------------------------------
  await expect(page.locator('.screen.end')).toBeVisible();
  await expect(page.locator('.end-panel h1')).toHaveText(FR['end.death']!);
  await expectFocus(page, 'camp');
  let save = await saveView(page);
  expect(save.account.stats.runs).toBe(1);
  expect(save.account.ashes).toBeGreaterThanOrEqual(5);
  // Le héros gagne de l'expérience même en perdant. (Pas forcément un niveau : le robot n'atteint que
  // le niveau de partie 5 à 4:10, là où le critère du document 03 §12 en suppose 8.)
  const hero = save.heroes['class.ash-blade'];
  expect(hero.level > 1 || hero.xp > 0).toBe(true);
  await capture(page, info, SHOTS, '09-fin-defaite');
  await settle(page);
  await pad.press('A');

  // --- Acheter un boost --------------------------------------------------------------------
  await expect(page.locator('.screen.camp')).toBeVisible();
  // La pastille de l'Autel signale un achat possible.
  await expect(page.locator('.camp-menu .badge')).toBeVisible();
  await capture(page, info, SHOTS, '10-camp-apres-defaite');
  await settle(page);
  await pad.press('DOWN');
  await expectFocus(page, 'altar');
  await pad.press('A');
  await expect(page.locator('.screen.altar')).toBeVisible();
  // L'Autel se souvient du boost quitté à la première visite.
  await expectFocus(page, 'altar.endurance');
  await pad.press('LEFT');
  await expectFocus(page, 'altar.ardor');
  await settle(page);
  const ashes = save.account.ashes as number;
  await pad.press('A');
  save = await saveView(page);
  expect(save.account.altar['altar.ardor']).toBe(1);
  expect(save.account.ashes).toBe(ashes - 5);
  // L'achat redessine le boost : le focus doit rester visible dessus.
  await expectFocus(page, 'altar.ardor');
  await capture(page, info, SHOTS, '11-autel-boost-achete');
  // Y désactive le boost sans le rembourser, puis le réactive. Là aussi le boost est redessiné.
  await pad.press('Y');
  expect((await saveView(page)).account.altarDisabled).toEqual(['altar.ardor']);
  await expect(page.locator('[data-focus="altar.ardor"]')).toHaveClass(/\boff\b/);
  await expectFocus(page, 'altar.ardor');
  await pad.press('Y');
  expect((await saveView(page)).account.altarDisabled).toEqual([]);
  await expectFocus(page, 'altar.ardor');
  await pad.press('B');
  await expect(page.locator('.screen.camp')).toBeVisible();

  // --- Seconde expédition, avec le boost ---------------------------------------------------
  await settle(page);
  await pad.press('UP');
  await expectFocus(page, 'depart');
  await pad.down('A');
  await expect(page.locator('.hud')).toBeVisible();
  await pad.up('A');
  await settle(page);
  // Ardeur, rang 1 : +3 % de Puissance, visible dans la partie et sur la fiche de la pause.
  expect((await runView(page))!.power).toBeCloseTo(0.03, 5);
  await pad.press('START');
  await expect(page.locator('.backdrop.pause')).toBeVisible();
  await expect(page.locator('.pause-info .stats')).toContainText('+3 %');
  await capture(page, info, SHOTS, '12-pause-avec-boost');

  // Abandonner : la confirmation s'ouvre sur « Annuler ».
  await settle(page);
  await pad.press('DOWN');
  await pad.press('DOWN');
  await expectFocus(page, 'abandon');
  await pad.press('A');
  await expect(page.locator('.dialog')).toBeVisible();
  await expectFocus(page, 'no');
  await capture(page, info, SHOTS, '13-confirmation-abandon');
  await settle(page);
  await pad.press('RIGHT');
  await expectFocus(page, 'yes');
  await pad.press('A');
  await expect(page.locator('.screen.end')).toBeVisible();
  await expect(page.locator('.end-panel h1')).toHaveText(FR['end.abandon']!);
  await capture(page, info, SHOTS, '14-fin-abandon');
  save = await saveView(page);
  expect(save.account.stats.runs).toBe(2);

  // --- La sauvegarde est écrite : elle survit à un rechargement ------------------------------
  await expect.poll(async () => {
    const text = await page.evaluate((key) => localStorage.getItem(key), storageKey('save.json'));
    return text ? JSON.parse(text).account.stats.runs : 0;
  }).toBe(2);
  await page.reload();
  await expect(page.locator('.screen.title')).toBeVisible();
  await settle(page);
  await pad.press('A');
  await expect(page.locator('.screen.camp')).toBeVisible();
  const reloaded = await saveView(page);
  expect(reloaded.account.altar['altar.ardor']).toBe(1);
  expect(reloaded.account.stats.runs).toBe(2);
  expect(reloaded.heroes['class.ash-blade'].level).toBe(save.heroes['class.ash-blade'].level);

  expect(seen.errors).toEqual([]);
  expect(seen.foreign).toEqual([]);
});
