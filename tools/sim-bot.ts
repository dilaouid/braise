/**
 * Joue des parties sans affichage, pour l'équilibrage.
 * Usage : pnpm sim -- --runs 50 --bot active --level 10 --minutes 16 --ardor 0
 * Tutoriel : pnpm sim -- --tutorial --runs 10 (le robot de tutoriel joue le script livré).
 * Une pièce de Lanterne seule : pnpm sim -- --piece rune.call --plevel 3 (son effet à ce niveau, et son malus).
 * Robots : active, flee, explorer (va de lieu en lieu et achète). --no-places retire totems, marchands et trésors.
 * Trait : --trait 0.15,-0.05 essaie d'autres valeurs (dans la lumière, hors de la lumière).
 * Flammes : --rarity <0-4> (rareté la plus haute ouverte, 1 par défaut) et --feed <never|smart|max> (mise de Lueur aux totems).
 * Armes de l'Autel : --unlock <all|aucune|wake,verge,storm-watch,nightlights> les ouvre, --give weapon.wake donne une arme de plus au départ
 * (--glevel <1-6> son niveau).
 * --set "weapon.storm-watch:range=120,jumpRange=60;weapon.verge:damage*0.8" essaie d'autres valeurs à tous les niveaux d'une arme.
 */
import { loadGameData } from '../packages/braise/src/content/index.ts';
import { BOT_TUNE, activeBot, explorerBot, fleeBot, plannedPick, simulate, type FeedPolicy } from '../packages/braise/src/core/bots.ts';
import { glowShareNow } from '../packages/braise/src/core/flames.ts';
import { NEUTRAL_MODS, mergeMods } from '../packages/braise/src/core/mods.ts';
import { computeResult } from '../packages/braise/src/core/rewards.ts';
import { createRun } from '../packages/braise/src/core/run.ts';
import { addWeapon } from '../packages/braise/src/core/weapons.ts';
import { simulateTutorial } from '../packages/braise/src/core/tutorial-bot.ts';
import { addBonus } from '../packages/braise/src/core/stats.ts';
import { createTutorialRun } from '../packages/braise/src/core/tutorial-run.ts';
import { buildSheet, unlockedContent } from '../packages/braise/src/meta/hero.ts';
import { newHero, newSave } from '../packages/braise/src/meta/save.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const runs = Number(arg('runs', '20'));
const level = Number(arg('level', '1'));
const minutes = Number(arg('minutes', '17'));
const botName = arg('bot', 'active');
const classId = `class.${arg('class', 'ash-blade')}`;
const seed0 = Number(arg('seed', '1000'));
const ardor = Number(arg('altar', '0'));
const verbose = process.argv.includes('--verbose');
const flameRarity = Number(arg('rarity', '1'));
const feed = arg('feed', 'never') as FeedPolicy;
if (!['never', 'smart', 'max'].includes(feed)) throw new Error(`Politique de mise inconnue : ${feed}`);

BOT_TUNE.calm = Number(arg('calm', String(BOT_TUNE.calm)));
BOT_TUNE.hurt = Number(arg('hurt', String(BOT_TUNE.hurt)));
BOT_TUNE.go = Number(arg('go', String(BOT_TUNE.go)));
BOT_TUNE.fleeReach = Number(arg('reach', String(BOT_TUNE.fleeReach)));
BOT_TUNE.touch = Number(arg('touch', String(BOT_TUNE.touch)));
BOT_TUNE.lead = Number(arg('lead', String(BOT_TUNE.lead)));
BOT_TUNE.gather = Number(arg('gather', String(BOT_TUNE.gather)));
const data = loadGameData();
// --trait <dedans>,<dehors> : essaie d'autres valeurs pour le trait du personnage, sans toucher au contenu.
const traitArg = arg('trait', '');
if (traitArg !== '') {
  const [inside, outside] = traitArg.split(',').map(Number);
  const cls = data.classes[classId];
  if (!cls || inside === undefined || outside === undefined || Number.isNaN(inside) || Number.isNaN(outside)) throw new Error(`Trait illisible : ${traitArg}`);
  cls.trait = { kind: 'lit', inside, outside };
}
// --set : d'autres valeurs d'arme (remplacées par =, multipliées par *), sans toucher au contenu.
for (const part of arg('set', '').split(';').filter((p) => p !== '')) {
  const [id, list] = part.split(':');
  const weapon = data.weapons.find((w) => w.id === id);
  if (!weapon || !list) throw new Error(`Réglage illisible : ${part}`);
  for (const item of list.split(',')) {
    const m = /^([a-zA-Z]+)([=*])(-?[0-9.]+)$/.exec(item);
    const key = m?.[1] as keyof (typeof weapon.levels)[number];
    if (!m || !(key in weapon.levels[0]!)) throw new Error(`Réglage illisible : ${item}`);
    for (const level of weapon.levels) (level as unknown as Record<string, number>)[key] = m[2] === '=' ? Number(m[3]) : (level[key] as number) * Number(m[3]);
  }
}
const noPlaces = process.argv.includes('--no-places');
if (noPlaces) {
  const ev = data.tuning.events;
  ev.totem.count = 0;
  ev.smith.count = 0;
  ev.herbalist.count = 0;
  ev.treasure.count = 0;
  // La référence est le jeu d'avant : les caches n'y donnaient pas de trouvaille (de l'or à la place).
  data.finds.length = 0;
}
const save = newSave(0);
const hero = newHero();
hero.level = level;
save.heroes[classId] = hero;
if (ardor > 0) {
  for (const b of data.altar) if (b.weapon === undefined) save.account.altar[b.id] = Math.min(b.ranks, ardor);
}
// --unlock : les armes achetées à l'Autel.
const unlockArg = arg('unlock', '');
const wanted = unlockArg === '' || unlockArg === 'aucune' ? [] : unlockArg.split(',');
for (const b of data.altar) if (b.weapon !== undefined && (unlockArg === 'all' || wanted.includes(b.weapon.replace('weapon.', '')))) save.account.altar[b.id] = 1;
for (const name of wanted) if (name !== 'all' && !data.altar.some((b) => b.weapon === `weapon.${name}`)) throw new Error(`Arme inconnue à l'Autel : ${name}`);
// --give : une arme de plus au départ, pour la mesurer.
const giveId = arg('give', '');
const giveDef = giveId === '' ? -1 : data.weapons.findIndex((w) => w.id === giveId);
if (giveId !== '' && giveDef < 0) throw new Error(`Arme inconnue : ${giveId}`);
const giveLevel = Number(arg('glevel', '1'));
const { sheet } = buildSheet(data, save, classId);
const unlocked = unlockedContent(data, save);
const pieceId = arg('piece', '');
const pieceLevel = Number(arg('plevel', '1'));
let mods = { ...NEUTRAL_MODS };
if (pieceId !== '') {
  const piece = data.lantern.pieces.find((p) => p.id === pieceId);
  if (!piece) throw new Error(`Pièce inconnue : ${pieceId}`);
  for (const effect of [piece.levels[pieceLevel - 1], piece.malus]) {
    if (!effect) continue;
    addBonus(sheet, effect.stats);
    mods = mergeMods(mods, effect.mods);
  }
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

if (process.argv.includes('--tutorial')) {
  let sum = 0;
  let boss = 0;
  let died = 0;
  let finished = 0;
  for (let r = 0; r < runs; r++) {
    const run = createTutorialRun(data, {
      seed: seed0 + r, regionId: 'region.ash-woods', classId, vigil: 1, sheet,
      unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: false,
    });
    const res = simulateTutorial(run, minutes * 60);
    sum += res.seconds;
    boss += res.bossSeconds;
    died += res.deaths;
    if (res.done) finished++;
    if (verbose || !res.done) {
      const b = run.enemies.count > 0 ? ` · ennemis ${run.enemies.count} (premier : ${Math.round(run.enemies.hp[0]!)} PV)` : '';
      console.log(`graine ${seed0 + r} : ${res.done ? 'fini' : `arrêté à l'étape ${run.tutorial!.step}`} · ${fmt(res.seconds)} · boss ${fmt(res.bossSeconds)} · morts ${res.deaths} · niv. ${run.hero.level} · PV ${Math.round(run.hero.hp)}/${Math.round(run.hero.stats.maxHp)}${b}`);
    }
  }
  console.log(`
${runs} tutoriels · finis : ${finished} · durée hors dialogues : ${fmt(sum / runs)} · face au Guetteur : ${fmt(boss / runs)} · morts par partie : ${(died / runs).toFixed(1)}`);
  process.exit(0);
}
const started = Date.now();
let reachedBoss = 0;
let victories = 0;
let totalTime = 0;
let totalLevel = 0;
let totalAshes = 0;
let totalXp = 0;
let totalKills = 0;
const weaponDamage = new Map<string, number>();
const weaponPicked = new Map<string, number>();
const deaths: number[] = [];
let totalBoons = 0;
const flamesByRarity = [0, 0, 0, 0, 0];
let totalGlow = 0;
let totalBurned = 0;
let totalFinds = 0;
let totalBuys = 0;
let totalSpent = 0;
let totalGold = 0;
let bossSeconds = 0;
const hurtBy = new Float64Array(data.enemies.length);

for (let r = 0; r < runs; r++) {
  const run = createRun(data, {
    seed: seed0 + r, regionId: 'region.ash-woods', classId, vigil: 1, sheet,
    unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: botName !== 'flee', mods, flameRarity,
  });
  if (giveDef >= 0) addWeapon(run, giveDef).level = giveLevel;
  let maxEnemies = 0;
  simulate(run, {
    bot: botName === 'flee' ? fleeBot : botName === 'explorer' ? explorerBot : activeBot,
    pickCard: botName === 'explorer' ? plannedPick : undefined,
    feed,
    maxSteps: minutes * 3600,
    onStep: (x) => {
      if (x.enemies.count > maxEnemies) maxEnemies = x.enemies.count;
    },
  });
  if (!run.outcome) run.outcome = run.phase === 'victory' ? 'victory' : 'death';
  const res = computeResult(run);
  if (run.director.bossSpawned) reachedBoss++;
  if (run.phase === 'victory') victories++;
  else deaths.push(run.time);
  totalTime += run.time;
  totalLevel += run.hero.level;
  totalAshes += res.ashesKept;
  totalXp += res.heroXp;
  totalKills += run.hero.kills;
  totalBoons += run.flames.length;
  for (const f of run.flames) flamesByRarity[f.rarity]!++;
  totalGlow += glowShareNow(run);
  totalBurned += run.glowBurned;
  totalFinds += run.finds.length;
  totalBuys += run.smithBuys + run.serviceBuys.reduce((a, b) => a + b, 0);
  totalSpent += run.hero.goldSpent;
  totalGold += run.hero.gold + run.hero.goldSpent;
  if (run.phase === 'victory') bossSeconds += run.time - data.tuning.durationMin * 60;
  for (let k = 0; k < hurtBy.length; k++) hurtBy[k]! += run.damageByKind[k]!;
  const total = res.damageByWeapon.reduce((s, w) => s + w.damage, 0) || 1;
  for (const w of res.damageByWeapon) {
    weaponDamage.set(w.id, (weaponDamage.get(w.id) ?? 0) + w.damage / total);
    weaponPicked.set(w.id, (weaponPicked.get(w.id) ?? 0) + 1);
  }
  if (verbose) {
    console.log(
      `graine ${seed0 + r} : ${run.phase.padEnd(8)} ${fmt(run.time)}  niv. ${String(run.hero.level).padStart(2)}  `
      + `battus ${String(run.hero.kills).padStart(4)}  max ${maxEnemies}  cendres ${res.ashesKept}  `
      + res.damageByWeapon.map((w) => `${w.id.replace('weapon.', '')} ${Math.round((100 * w.damage) / total)}%`).join(' · '),
    );
  }
}

console.log(`\n${runs} parties · robot « ${botName} » · héros niveau ${level} · Autel ${ardor}${pieceId ? ` · ${pieceId} ${pieceLevel}` : ''} · ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`boss atteint : ${Math.round((100 * reachedBoss) / runs)} %   victoires : ${Math.round((100 * victories) / runs)} %`);
console.log(`temps moyen : ${fmt(totalTime / runs)}   niveau de partie moyen : ${(totalLevel / runs).toFixed(1)}   battus : ${Math.round(totalKills / runs)}`);
console.log(
  `lieux${noPlaces ? ' (retirés)' : ''} : totems ${(totalBoons / runs).toFixed(1)} · trouvailles ${(totalFinds / runs).toFixed(1)} · achats ${(totalBuys / runs).toFixed(1)}`
  + ` · or ramassé ${Math.round(totalGold / runs)} · or dépensé ${Math.round(totalSpent / runs)}`
  + (victories ? ` · boss battu en ${fmt(bossSeconds / victories)}` : ''),
);
console.log(
  `Flammes (rareté ouverte ${flameRarity}, mise « ${feed} ») : ${flamesByRarity.map((n) => (n / runs).toFixed(2)).join(' / ')} par partie (C / R / É / L / M)`
  + ` · Lueur brûlée ${(totalBurned / runs).toFixed(1)} points · Lueur finale ${Math.round((100 * totalGlow) / runs)} %`,
);
console.log(`Cendres moyennes : ${Math.round(totalAshes / runs)}   expérience de héros moyenne : ${Math.round(totalXp / runs)}`);
if (deaths.length) {
  deaths.sort((a, b) => a - b);
  console.log(`morts : première ${fmt(deaths[0]!)} · médiane ${fmt(deaths[Math.floor(deaths.length / 2)]!)} · dernière ${fmt(deaths[deaths.length - 1]!)}`);
}
const hurtTotal = hurtBy.reduce((a, b) => a + b, 0) || 1;
console.log(
  `dégâts subis par source : ${data.enemies.map((e, k) => [e.id.split('.')[1], hurtBy[k]!] as const).filter((x) => x[1] > 0)
    .sort((a, b) => b[1] - a[1]).map((x) => `${x[0]} ${Math.round((100 * x[1]) / hurtTotal)} %`).join(' · ')}`,
);
console.log('part des dégâts (moyenne des parties où l\'arme est portée) · taux de présence :');
for (const [id, share] of Array.from(weaponDamage.entries()).sort((a, b) => b[1] - a[1])) {
  const picked = weaponPicked.get(id) ?? 1;
  console.log(`  ${id.padEnd(26)} ${String(Math.round((100 * share) / picked)).padStart(3)} %   ${String(Math.round((100 * picked) / runs)).padStart(3)} %`);
}
