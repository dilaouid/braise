import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * L'éditeur de texte d'histoire, contre le serveur de développement. Le serveur lit une copie
 * temporaire du contenu (playwright.editor.config.ts) : le vrai `content/` n'est jamais écrit.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '../..');
const SHIPPED = join(PACKAGE, 'content');
const COPY = process.env.BRAISE_CONTENT_DIR!;
const EVIDENCE = resolve(PACKAGE, '../../production/qa/evidence/editeur');

const FILES = ['dialogues.json', 'i18n/fr.json'];
const shipped = (f: string): string => readFileSync(join(SHIPPED, f), 'utf8');
const copy = (f: string): string => readFileSync(join(COPY, f), 'utf8');

test.beforeAll(() => {
  expect(resolve(COPY)).not.toBe(resolve(SHIPPED));
});

// Chaque parcours part du contenu livré.
test.beforeEach(async () => {
  for (const f of FILES) copyFileSync(join(SHIPPED, f), join(COPY, f));
  // Laisser passer l'événement de ce changement avant d'ouvrir une page.
  await new Promise((ok) => setTimeout(ok, 400));
});

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html');
  await expect(page.getByLabel('Texte, message 1', { exact: true })).toHaveValue(/La lumière/);
}

test('changer la première réplique du tutoriel, insérer un message, enregistrer', async ({ page }) => {
  await openEditor(page);
  await page.getByLabel('Texte, message 1', { exact: true }).fill('Wow… La lumière les attire, on dirait. « Vraiment » ?');
  await expect(page.locator('.ed-changes')).toContainText('1 changement');
  await page.getByRole('button', { name: 'Insérer un message à la place 2', exact: true }).click();
  await page.getByLabel('Texte, message 2', { exact: true }).fill('Je n\'ai rien dit.');
  await expect(page.getByLabel('Texte, message 3', { exact: true })).toHaveValue('C\'est exact.');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.ed-status')).toContainText('Enregistré');
  await expect(page.locator('.ed-changes')).toContainText('Tout est enregistré');

  // fr.json : une ligne changée, une ajoutée juste après la dernière clé du dialogue ; rien d'autre.
  const before = shipped('i18n/fr.json').split('\r\n');
  const after = copy('i18n/fr.json').split('\r\n');
  expect(after.length).toBe(before.length + 1);
  const i18 = before.indexOf('  "dialog.tuto.opening.18": "Ils t\'ont vu. Suis-moi.",');
  expect(after[i18 + 1]).toBe('  "dialog.tuto.opening.19": "Je n\'ai rien dit.",');
  expect([...after.slice(0, i18 + 1), ...after.slice(i18 + 2)].filter((l, i) => l !== before[i])).toEqual([
    '  "dialog.tuto.opening.1": "Wow… La lumière les attire, on dirait. « Vraiment » ?",',
  ]);
  // dialogues.json : une ligne de plus, à la deuxième place.
  const d0 = shipped('dialogues.json').split('\r\n');
  const d1 = copy('dialogues.json').split('\r\n');
  const first = d0.findIndex((l) => l.includes('"dialog.tuto.opening.1"'));
  expect(d1[first + 1]).toBe('      {"who":"cream","face":"neutral","text":"dialog.tuto.opening.19"},');
  expect([...d1.slice(0, first + 1), ...d1.slice(first + 2)]).toEqual(d0);
});

test('un message de 161 caractères refuse l\'enregistrement', async ({ page }) => {
  await openEditor(page);
  await page.getByLabel('Texte, message 1', { exact: true }).fill('a'.repeat(161));
  await expect(page.locator('[data-line="0"] .ed-counter')).toHaveText('161/160');
  await expect(page.locator('[data-line="0"] .ed-counter')).toHaveClass(/over/);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ed-status')).toContainText('Rien n\'a été écrit');
  await expect(page.locator('[data-line="0"] .ed-errors')).toContainText('dépasse 160 caractères');
  for (const f of FILES) expect(copy(f)).toBe(shipped(f));
});

test('quitter avec des changements avertit, et le brouillon se reprend', async ({ page, context }) => {
  await openEditor(page);
  await page.getByLabel('Texte, message 2', { exact: true }).fill('C\'est exact, oui.');
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const d = await dialog;
  expect(d.type()).toBe('beforeunload');
  await d.accept();

  const again = await context.newPage();
  await openEditor(again);
  await expect(again.getByText('Un brouillon non enregistré')).toBeVisible();
  await again.getByRole('button', { name: 'Le reprendre' }).click();
  await expect(again.getByLabel('Texte, message 2', { exact: true })).toHaveValue('C\'est exact, oui.');
  for (const f of FILES) expect(copy(f)).toBe(shipped(f));
});

test('le jeu ouvert se recharge après l\'enregistrement ; l\'éditeur garde ses changements non enregistrés', async ({ page, context }) => {
  const game = await context.newPage();
  await game.goto('/');
  await game.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 90_000 });
  await game.evaluate(() => { (window as unknown as { __mark: number }).__mark = 1; });

  await openEditor(page);
  await page.evaluate(() => { (window as unknown as { __mark: number }).__mark = 1; });
  await page.getByLabel('Texte, message 1', { exact: true }).fill('Enregistré pour le jeu.');
  const reloaded = game.waitForEvent('load');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.ed-status')).toContainText('Enregistré');
  await reloaded;
  expect(await game.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBeUndefined();
  expect(copy('i18n/fr.json')).toContain('"dialog.tuto.opening.1": "Enregistré pour le jeu."');

  // Un changement non enregistré, puis un fichier changé à la main : le jeu se recharge encore,
  // l'éditeur ne se recharge pas, garde son texte et montre le bandeau.
  await page.getByLabel('Texte, message 3', { exact: true }).fill('Pas encore enregistré.');
  const reloadedAgain = game.waitForEvent('load');
  writeFileSync(join(COPY, 'i18n/fr.json'), copy('i18n/fr.json').replace('"Debout."', '"Debout, toi."'));
  await reloadedAgain;
  await expect(page.getByText('Fichiers changés sur le disque.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
  await expect(page.getByLabel('Texte, message 3', { exact: true })).toHaveValue('Pas encore enregistré.');
  await expect(page.getByLabel('Texte, message 1', { exact: true })).toHaveValue('Enregistré pour le jeu.');
});

test('changer la copie à la main fait apparaître le bandeau, et l\'enregistrement est refusé', async ({ page }) => {
  await openEditor(page);
  await page.getByLabel('Texte, message 2', { exact: true }).fill('Oui.');
  writeFileSync(join(COPY, 'i18n/fr.json'), shipped('i18n/fr.json').replace('"Encore."', '"Encore une fois."'));
  await expect(page.getByText('Fichiers changés sur le disque.')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ed-status')).toContainText('a changé sur le disque');
  expect(copy('i18n/fr.json')).toContain('"tuto.death.2": "Encore une fois."');
  expect(copy('i18n/fr.json')).not.toContain('"Oui."');
  // Recharger reprend le disque.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Recharger' }).click();
  await expect(page.getByLabel('Texte, message 2', { exact: true })).toHaveValue('C\'est exact.');
  await expect(page.getByText('Fichiers changés sur le disque.')).toBeHidden();
});

test('nouveau dialogue, onglet Phrases et captures', async ({ page }) => {
  await openEditor(page);
  // Refus d'un identifiant invalide, puis création.
  await page.getByRole('button', { name: '+ Nouveau dialogue' }).click();
  await page.getByLabel('Identifiant du dialogue').fill('Essai 1');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByText('Minuscules, chiffres, points et tirets seulement.')).toBeVisible();
  await page.getByLabel('Identifiant du dialogue').fill('essai.camp');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.locator('.ed-dialogue-head')).toContainText('non joué');
  await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toBeEnabled();

  // Un dialogue joué ne se supprime pas.
  await page.getByRole('button', { name: /tuto\.opening/ }).click();
  await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toBeDisabled();
  // Le portrait se choisit au clavier, dans une liste à vignettes.
  await page.getByRole('button', { name: /Portrait, message 1 :/ }).focus();
  await page.keyboard.press('ArrowDown');
  const list = page.getByRole('listbox', { name: 'Portrait, message 1' });
  await expect(list.getByRole('option')).toHaveCount(8);
  await expect(list.locator('.ed-thumb').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  // Revenir au texte livré pour la capture.
  await page.getByRole('button', { name: /essai\.camp/ }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('button', { name: /tuto\.opening/ }).click();
  await expect(page.locator('.ed-changes')).toContainText('Tout est enregistré');
  await page.getByLabel('Texte, message 1', { exact: true }).click();
  const evidence = process.env.BRAISE_EVIDENCE === '1';
  if (evidence) mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: evidence ? join(EVIDENCE, '01-dialogues.png') : test.info().outputPath('01-dialogues.png') });

  await page.getByRole('tab', { name: 'Phrases' }).click();
  await expect(page.getByRole('region', { name: 'Cream au refuge' })).toBeVisible();
  await expect(page.locator('img[alt="Plan p01-retour"]')).toBeVisible();
  await page.getByRole('button', { name: '+ Ajouter une réplique' }).click();
  await expect(page.getByLabel('camp.cream.7')).toBeFocused();
  await page.getByRole('button', { name: 'Retirer la dernière' }).click();
  await expect(page.getByLabel('camp.cream.7')).toHaveCount(0);
  await page.getByRole('region', { name: 'Tutoriel, bandeaux' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: evidence ? join(EVIDENCE, '02-phrases.png') : test.info().outputPath('02-phrases.png'), fullPage: false });
  for (const f of FILES) expect(copy(f)).toBe(shipped(f));
});
