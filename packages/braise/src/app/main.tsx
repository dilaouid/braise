import '@fontsource/jersey-10/latin.css';
import '@fontsource/jersey-15/latin.css';
import '../ui/style.css';
import { FocusManager, pickInDirection, type Rect } from '@owl/kit/focus';
import { detectHost } from '@owl/kit/host';
import { InputManager } from '@owl/kit/input';
import { createSaveStore } from '@owl/kit/save';
import { render } from 'preact';
import { AudioManager } from '../audio/audio.ts';
import { cinematicById, introCinematic } from '../content/cinematic.ts';
import { FR, loadGameData } from '../content/index.ts';
import { activeBot } from '../core/bots.ts';
import { nearestObject, newCamp, stepCamp, stopCamp, walkTo } from '../core/camp.ts';
import { bossBarFrac } from '../core/combat.ts';
import { banishCard, closeChest, closeFind, readyEvolution, rerollCards, skipCards, takeCard } from '../core/levelup.ts';
import { feedBlock, feedOffer, feedTarget, glowShareNow, offerCost, openRarity, takeFlame, unfeedOffer, unfeedTarget } from '../core/flames.ts';
import { buyItem, canBuy, closeForge, closeShop, shopItems, takeEvolution } from '../core/places.ts';
import { computeResult } from '../core/rewards.ts';
import { abandonRun, clearEvents, createRun, dashChargesMax, dashReady, idleInput, skillCooldown, stepRun } from '../core/run.ts';
import { tutorialBot } from '../core/tutorial-bot.ts';
import { advanceScene, finishScene, newScene, sceneLine, stepScene, type SceneState } from '../core/scene.ts';
import { createTutorialRun } from '../core/tutorial-run.ts';
import { advanceDialogue, currentLine, skipDialogue, tickDialogue } from '../core/tutorial.ts';
import { EV, PK_CHEST, PK_GEM, PK_GOLD, PK_PIECE, PK_RED_GEM, STEP, type Poi, type Run } from '../core/types.ts';
import { buyAltarRank, flameRarity, refundAltar, setAltarBoostEnabled } from '../meta/altar.ts';
import { clearFace, clearLantern, lanternRun, markLanternSeen, placePiece, resolveLantern } from '../meta/lantern.ts';
import { applyRunResult, bossBeaten, buildSheet, hasMemory, memoryCount, pendingMemory, regionOpen, unlockedContent } from '../meta/hero.ts';
import { MIGRATIONS, SAVE_VERSION, newHero, newSave, validateSave, type Save } from '../meta/save.ts';
import { CinematicPlayer } from '../render/cinematic.ts';
import { GameRenderer } from '../render/renderer.ts';
import { App } from '../ui/app.tsx';
import { focusRef } from '../ui/parts.tsx';
import {
  INTRO_SEEN, TUTORIAL_SEEN, UI_SOUNDS, bossCard, chest, forgeState, cineCaption, cineCard, cineQuick, cineSkip, confirm, device, dialogueShown, dialogueState, ending, findState,
  focusedId, campVisible, holdProgress, hud, knowsCream, lastSeed, levelUp, memoryCard, notice, overlay, pauseReason, pauseStats, refs, runExtras, save, saveRev, screen,
  shopState, t, totemState, tutoHud, type Actions, type HudState, type Screen,
} from '../ui/store.ts';

/** Une couleur par sorte de lieu sur la mini-carte. */
const MINIMAP_COLORS: Record<Poi['kind'], string> = {
  brazier: '#ffb020', spring: '#4fe0c8', cache: '#ff7a3d', portal: '#fff1c2', memory: '#6fb8ff',
  totem: '#6cc7ff', smith: '#f4f1e6', herbalist: '#7ee08a', treasure: '#ffe36b',
};

const CLASS = 'class.ash-blade';
const REGION = 'region.ash-woods';
const HOLD_MS = 500;
const SKIP_HOLD_MS = 600;
/** Le texte d'un dialogue s'écrit à cette vitesse, et un son de voix part toutes les quelques lettres. */
const DIALOGUE_CPS = 40;
const TALK_EVERY = 4;
const SPEAKERS = ['moon', 'cream'] as const;
/** Une scène de route sort du noir en ce temps, et se passe en maintenant B ce temps. */
const SCENE_FADE_S = 0.9;
const SCENE_SKIP_MS = 1000;
/** Les portraits que Cream peut avoir quand il parle au refuge. */
const CAMP_CREAM_FACES = ['neutral', 'smug'] as const;

async function boot(): Promise<void> {
  const data = loadGameData();
  refs.data = data;
  const base = import.meta.env.BASE_URL;
  const host = detectHost('braise');
  // Owl Player interdit l'évaluation dynamique de code dans ses paquets.
  if (host.id === 'owl') await import('pixi.js/unsafe-eval');
  const store = createSaveStore<Save>({ host, name: 'save', version: SAVE_VERSION, migrations: MIGRATIONS, validate: validateSave });
  const loaded = await store.load();
  let current: Save = loaded.data ?? newSave(Date.now());
  if (loaded.error === 'newer') notice.value = t('save.newer');
  else if (loaded.source === 'bak1' || loaded.source === 'bak2') notice.value = t('save.backup', { source: loaded.source });
  save.value = current;

  const stage = document.getElementById('stage') as HTMLElement;
  const gameRoot = document.getElementById('game') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const renderer = await GameRenderer.create(gameRoot, base);
  renderer.campDef = data.camp;
  refs.atlas = renderer.atlas;
  refs.atlasUrl = `${base}atlas/atlas.png`;

  const input = new InputManager(window);
  if (host.id === 'owl') {
    input.frame.device = 'gamepad';
    device.value = 'gamepad';
  }
  const focus = new FocusManager(uiRoot);
  focusRef.setScope = (el, key, optional) => {
    // Le focus se pose après le rendu de l'écran, quand ses éléments existent.
    focus.setScope(el, key, { optional });
    requestAnimationFrame(() => focus.ensure());
  };
  focusRef.focusId = (id) => {
    focus.focusId(id);
    focus.onMove?.();
  };
  focus.onChange = (id) => {
    focusedId.value = id;
  };
  window.addEventListener('mousemove', (e) => {
    if (screen.value === 'camp' && (e.target as HTMLElement | null)?.closest?.('.camp-object')) campPinned = true;
  });
  const audio = new AudioManager();
  void audio.load(base);

  let run: Run | null = null;
  /** Moon au refuge, et l'objet où la croix ou la souris l'a envoyé (il l'emporte sur l'objet proche). */
  let camp = newCamp();
  let campPinned = false;
  let paused = false;
  let acc = 0;
  let guardUntil = 0;
  let holdMs = 0;
  let skipMs = 0;
  let deadAt = 0;
  let hudAt = 0;
  let mapAt = 0;
  let pendSkill = false;
  let pendUlt = false;
  let pendFlask = false;
  let banner: string | null = null;
  let bannerUntil = 0;
  /** Un bandeau qui attend la fin de celui affiché. */
  let bannerNext: { text: string; ms: number } | null = null;
  /** Les conseils du Marais, dits une fois par expédition : l'eau, la lanterne ravivée, la Lueur étouffée. */
  const told = { water: false, beacon: false, blind: false };
  let bossCardKey = 0;
  /** Le carton d'un boss s'efface de lui-même (son animation dure autant), puis il est retiré. */
  const BOSS_CARD_MS = 4400;
  let bossCardUntil = 0;

  /** Le carton d'un boss : son nom et son titre à son arrivée, « Gardien vaincu » à sa chute. */
  function showBossCard(r: Run, kind: number, felled: boolean): void {
    const id = r.data.enemies[kind]!.id;
    const title = FR[`${id}.title`];
    if (!felled && title === undefined) {
      say(t(`${id}.name`), 3500);
      return;
    }
    bossCard.value = { name: felled ? t('hud.bossFelled') : t(`${id}.name`), title: felled ? t(`${id}.name`) : title ?? '', felled, leaving: false, key: ++bossCardKey };
    bossCardUntil = performance.now() + BOSS_CARD_MS;
    if (!felled) audio.play('boss-titre', 0.9);
  }
  let saveTimer = 0;
  let frames = 0;
  let fps = 0;
  let fpsAt = 0;
  const stepInput = idleInput();
  /** La cinématique en cours, ce qui la suit, et le maintien de B pour la passer. */
  let cine: CinematicPlayer | null = null;
  let cineAfter: () => void = () => undefined;
  let cineHold = introCinematic().skipHoldMs;
  /** Change à chaque cinématique lancée ou finie : un chargement arrivé trop tard est jeté. */
  let cineToken = 0;
  /** Le tutoriel rejoué depuis le titre ne touche pas à la sauvegarde et y revient. */
  let tutoReplay = false;
  /** La ligne de dialogue à l'écran (dialogue et indice), ses lettres écrites, le maintien de B. */
  let dlgKey = '';
  let dlgChars = 0;
  let dlgLen = 0;
  let dlgWho: 'moon' | 'cream' = 'moon';
  let dlgId = 0;
  let dlgHoldMs = 0;
  let dlgEscape = false;
  /** Cream parle au refuge : une réplique seule, hors de toute partie. */
  let campTalk = false;
  let campLast = 0;
  /** Pour les parcours et leurs captures : la simulation et l'écriture des dialogues s'arrêtent, l'image continue. */
  let held = false;
  let cineHoldMs = 0;
  let cinePaused = false;
  /** La scène de route en cours, ce qui la suit, son temps, la ligne affichée, le maintien de B. */
  let scene: SceneState | null = null;
  let sceneAfter: () => void = () => undefined;
  let sceneT = 0;
  let sceneKey = '';
  let sceneHoldMs = 0;

  function applySettings(): void {
    const s = current.settings;
    audio.setVolumes(s.volumeMaster, s.volumeMusic, s.volumeSfx);
    input.settings.swapAB = s.swapAB;
    input.settings.deadzoneLeft = s.deadzoneLeft;
    input.settings.deadzoneRight = s.deadzoneRight;
    renderer.settings.damageNumbers = s.damageNumbers;
    renderer.settings.screenShake = s.screenShake;
    renderer.settings.flashes = s.flashes;
    if (run) run.cfg.autoSkills = s.autoSkills;
  }

  function persist(): void {
    current.updatedAt = Date.now();
    void store.save(current).catch((err) => console.error('Sauvegarde impossible', err));
  }

  /** Écrit la sauvegarde un peu plus tard : plusieurs changements rapprochés font une seule écriture. */
  function persistSoon(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 400);
  }

  function changed(): void {
    saveRev.value++;
  }

  function guard(ms = 350): void {
    // Tout bouton maintenu au changement d'écran est ignoré jusqu'à son relâchement.
    input.suppressHeld();
    guardUntil = performance.now() + ms;
    holdMs = 0;
    skipMs = 0;
    holdProgress.value = 0;
  }

  function setScreen(next: Screen): void {
    screen.value = next;
    overlay.value = 'none';
    confirm.value = null;
    campTalk = false;
    hideDialogue();
    guard();
  }

  /** Affiche une réplique dans la boîte de dialogue ; elle s'écrit lettre par lettre. */
  function showLine(who: 'moon' | 'cream', face: string, key: string, single: boolean): void {
    const text = t(key);
    dlgId++;
    dlgChars = 0;
    dlgLen = text.length;
    dlgWho = who;
    dialogueShown.value = 0;
    dialogueState.value = { who, face, text, id: dlgId, single };
  }

  function hideDialogue(): void {
    dialogueState.value = null;
    dlgKey = '';
    dlgHoldMs = 0;
    dlgEscape = false;
    if (screen.value !== 'cinematic') cineSkip.value = 0;
  }

  /** Écrit les lettres suivantes de la réplique, avec le petit son de voix de celui qui parle. */
  function typeDialogue(dt: number): void {
    if (held || !dialogueState.value || dlgChars >= dlgLen) return;
    const before = Math.floor(dlgChars);
    dlgChars = Math.min(dlgLen, dlgChars + (dt * DIALOGUE_CPS) / 1000);
    const after = Math.floor(dlgChars);
    if (after === before) return;
    dialogueShown.value = after;
    if (Math.floor(after / TALK_EVERY) !== Math.floor(before / TALK_EVERY)) audio.play(`talk-${dlgWho}`, 0.22, 1, 70);
  }

  /** Recopie la ligne de dialogue de la partie vers l'écran, quand elle change. */
  function syncDialogue(r: Run): void {
    const tu = r.tutorial;
    const line = r.phase === 'dialogue' ? currentLine(r) : null;
    const key = line && tu ? `${tu.dialogue}#${tu.line}` : '';
    if (key === dlgKey) return;
    dlgKey = key;
    if (!line) {
      dialogueState.value = null;
      dlgHoldMs = 0;
      dlgEscape = false;
      cineSkip.value = 0;
      return;
    }
    if (line.sfx !== '') audio.play(line.sfx.replace(/^sfx-/, ''), 0.8);
    // Une ligne muette (une pose, une bulle, un silence) n'affiche pas la boîte.
    const who = SPEAKERS[line.who];
    if (who) showLine(who, line.face, line.text, false);
    else dialogueState.value = null;
  }

  function closeCampTalk(): void {
    campTalk = false;
    hideDialogue();
    overlay.value = 'none';
    audio.play('ui-back', 0.6);
    guard(200);
  }

  /** Les boutons pendant un dialogue : A finit la ligne puis passe à la suivante, B maintenu passe tout. */
  function handleDialogue(now: number, dt: number): void {
    const f = input.frame;
    if (now < guardUntil) return;
    if (campTalk) {
      if (f.pressed.confirm) actions.dialogueNext();
      else if (f.pressed.back) closeCampTalk();
      return;
    }
    if (f.pressed.confirm) actions.dialogueNext();
    // Start met en pause. Au clavier, Échap est à la fois « pause » et « passer » : un appui court met
    // en pause, un maintien passe le dialogue.
    if (f.pressed.pause && !f.held.back) {
      setPaused(true);
      return;
    }
    if (f.pressed.back) dlgEscape = f.pressed.pause;
    const hold = introCinematic().skipHoldMs;
    if (f.held.back) {
      dlgHoldMs += dt;
    } else {
      const tapped = dlgHoldMs > 0 && dlgEscape;
      dlgHoldMs = 0;
      dlgEscape = false;
      if (tapped) {
        cineSkip.value = 0;
        setPaused(true);
        return;
      }
    }
    const k = Math.min(1, dlgHoldMs / hold);
    if (k !== cineSkip.value) cineSkip.value = k;
    if (dlgHoldMs >= hold) {
      dlgHoldMs = 0;
      dlgEscape = false;
      cineSkip.value = 0;
      actions.dialogueSkip();
    }
  }

  function say(text: string, ms = 2600): void {
    banner = text;
    bannerUntil = performance.now() + ms;
  }

  /** Affiche ce texte une fois le bandeau en cours fini : il n'efface pas une consigne. */
  function sayAfter(text: string, ms: number): void {
    if (banner !== null && performance.now() < bannerUntil) bannerNext = { text, ms };
    else say(text, ms);
  }

  function syncLevelUp(): void {
    if (!run) return;
    levelUp.value = { level: run.hero.level - run.pendingLevels + 1, cards: run.cards.slice(), rerolls: run.hero.rerolls, banishes: run.hero.banishes, skipHold: 0 };
  }

  /** Recopie la boutique ouverte pour l'écran : articles, prix, or. */
  function syncShop(): void {
    if (!run) return;
    const poi = run.map.pois[run.shopPoi];
    if (!poi) return;
    const r = run;
    shopState.value = {
      kind: poi.kind === 'smith' ? 'smith' : 'herbalist',
      gold: r.hero.gold,
      items: shopItems(r).map((item) => ({ ...item, can: canBuy(r, item) })),
    };
  }

  /** Recopie les Flammes du totem pour l'écran : rareté, prix, ce qui bloque, Lueur après la prise. */
  function syncTotem(): void {
    if (!run) return;
    const r = run;
    totemState.value = {
      glow: glowShareNow(r),
      open: openRarity(r),
      cards: r.totemOffers.map((offer, i) => {
        const cost = offerCost(r, offer);
        const up = feedTarget(r, i);
        const down = unfeedTarget(r, i);
        return {
          line: offer.line, rarity: offer.rarity, cost,
          block: feedBlock(r, i), feedCost: up < 0 ? 0 : offerCost(r, { ...offer, rarity: up }) - cost,
          canUnfeed: down >= 0, unfeedGain: down < 0 ? 0 : cost - offerCost(r, { ...offer, rarity: down }),
          glowAfter: glowShareNow(r, cost),
        };
      }),
    };
  }

  function finishRun(): void {
    if (!run) return;
    if (!run.outcome) run.outcome = run.phase === 'victory' ? 'victory' : 'death';
    const result = computeResult(run);
    // Le souvenir et les gains sont inscrits et sauvegardés ici : rien ne dépend de la fin de la scène.
    const summary = applyRunResult(current, data, result);
    ending.value = { result, summary, stats: run.hero.stats };
    lastSeed.value = run.cfg.seed;
    changed();
    persist();
    run = null;
    hud.value = null;
    levelUp.value = null;
    chest.value = null;
    totemState.value = null;
    forgeState.value = null;
    shopState.value = null;
    findState.value = null;
    paused = false;
    const memory = summary.memory === null ? undefined : data.memories.find((m) => m.id === summary.memory);
    if (!memory) {
      showEnd();
      return;
    }
    // Un Souvenir vient d'être pris : sa scène, son carton, puis le bilan. Sans images, le bilan tout de suite.
    audio.play('memory', 0.9);
    const card = (): void => {
      memoryCard.value = { id: memory.id, have: memoryCount(data, current), total: data.memoriesTotal };
      guard();
    };
    playCinematic(memory.cinematic, () => {
      if (memory.scene !== '') playScene(memory.scene, card);
      else card();
    }, showEnd);
  }

  /** L'écran de bilan, après une partie (et après la scène d'un souvenir). */
  function showEnd(): void {
    memoryCard.value = null;
    audio.playMusic('music-camp');
    setScreen('end');
  }

  function setPaused(on: boolean, reason: string | null = null): void {
    if (!run || screen.value !== 'run') return;
    if (on && overlay.value !== 'none' && overlay.value !== 'pause' && !(overlay.value === 'dialogue' && run.phase === 'dialogue')) return;
    if (on === paused) return;
    paused = on;
    pauseReason.value = on ? reason : null;
    pauseStats.value = on ? { ...run.hero.stats } : null;
    if (on) {
      const worn = run.tutorial ? [] : resolveLantern(data, current.account.lantern).faces;
      runExtras.value = {
        flames: run.flames.map((f) => ({ ...f })), finds: run.finds.slice(), glow: glowShareNow(run),
        lantern: worn.flatMap((f) => (f ? [{ id: f.id, level: f.level }] : [])),
        piece: run.piece?.taken ? data.lantern.pieces[run.piece.index]!.id : null,
      };
    }
    overlay.value = on ? 'pause' : 'none';
    audio.duck(on);
    guard(200);
    if (on) persist();
  }

  /** Moon arrive au refuge : devant la porte. */
  function arriveAtCamp(): void {
    camp = newCamp();
    campPinned = false;
  }

  /** Met cet objet du refuge au focus, et Moon y va. */
  function campGoto(id: string): void {
    campPinned = true;
    focus.focusId(id);
    walkTo(camp, data.camp, id);
    audio.play('ui-move', 0.5, 1, 40);
  }

  /** Le refuge, une image : Moon marche, et l'objet à côté de lui prend le focus. */
  function tickCamp(f: typeof input.frame, dt: number): void {
    const visible = campVisible(data, current);
    const free = overlay.value === 'none';
    if (free && (f.dpadX !== 0 || f.dpadY !== 0)) {
      const box = (o: (typeof data.camp.objects)[number]): Rect => ({ x: o.x - o.box[0] / 2, y: o.y - o.box[1] + 4, w: o.box[0], h: o.box[1] });
      const others = data.camp.objects.filter((o) => o.reach > 0 && visible.has(o.id) && o.id !== focusedId.value);
      const at = data.camp.objects.find((o) => o.id === focusedId.value);
      const to = pickInDirection(at ? box(at) : { x: camp.x, y: camp.y, w: 1, h: 1 }, others.map(box), f.dpadX, f.dpadY);
      if (to >= 0) campGoto(others[to]!.id);
    }
    // La croix saute d'un objet à l'autre : elle ne fait pas marcher.
    const walk = free && !f.dpadHeld;
    if (!free) return;
    stepCamp(camp, data.camp, visible, walk ? f.moveX : 0, walk ? f.moveY : 0, Math.min(0.05, dt / 1000));
    if ((walk && (f.moveX !== 0 || f.moveY !== 0)) || focusedId.value === null) campPinned = false;
    if (campPinned) return;
    const near = nearestObject(camp, data.camp, visible);
    if (near === focusedId.value) return;
    if (near === null) focus.clear();
    else focus.focusId(near);
  }

  function enterCamp(): void {
    current.heroes[CLASS] ??= newHero();
    current.activeHero = CLASS;
    audio.playMusic('music-camp');
    arriveAtCamp();
    setScreen('camp');
  }

  function clearRunScreens(): void {
    run = null;
    hud.value = null;
    tutoHud.value = null;
    levelUp.value = null;
    chest.value = null;
    totemState.value = null;
    forgeState.value = null;
    shopState.value = null;
    findState.value = null;
    pauseReason.value = null;
    paused = false;
    held = false;
  }

  /**
   * Lance le tutoriel. Sa feuille de statistiques est toujours celle d'une sauvegarde neuve, même en
   * le rejouant : les leçons sont réglées pour un héros de niveau 1 sans Autel.
   */
  function startTutorial(replay: boolean): void {
    const blank = newSave(0);
    blank.heroes[CLASS] = newHero();
    const { sheet } = buildSheet(data, blank, CLASS);
    const unlocked = unlockedContent(data, blank);
    tutoReplay = replay;
    run = createTutorialRun(data, {
      seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, regionId: REGION, classId: CLASS, vigil: 1, sheet,
      unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: current.settings.autoSkills,
    });
    renderer.beginRun(run);
    paused = false;
    held = false;
    acc = 0;
    deadAt = 0;
    banner = null;
    bannerNext = null;
    ending.value = null;
    tutoHud.value = { banner: null, glyph: null, bark: null };
    audio.playMusic(run.region.music.calm);
    audio.play('intro-miaou', 0.5);
    setScreen('run');
  }

  /** Le tutoriel est fini ou passé : rien n'en est rapporté, pas de bilan, le refuge s'ouvre. */
  function finishTutorial(): void {
    clearRunScreens();
    audio.duck(false);
    if (tutoReplay) {
      tutoReplay = false;
      audio.stopMusic();
      setScreen('title');
      return;
    }
    if (!current.account.unlocks.includes(TUTORIAL_SEEN)) {
      current.account.unlocks.push(TUTORIAL_SEEN);
      changed();
      persist();
    }
    // Moon et Cream rentrent à pied au refuge : il s'ouvre sans coupure.
    current.heroes[CLASS] ??= newHero();
    current.activeHero = CLASS;
    playScene('after-tutorial', enterCamp);
  }

  /**
   * Lance une cinématique par son identifiant. Pendant le chargement, l'écran reste noir. `after` est
   * appelé quand elle finit ou qu'elle est passée ; `failed` si elle ne charge pas (par défaut, `after`).
   */
  function playCinematic(id: string, after: () => void, failed: () => void = after, holdMs?: number): void {
    const token = ++cineToken;
    cineAfter = after;
    cineHoldMs = 0;
    cineSkip.value = 0;
    cineCard.value = null;
    cineCaption.value = null;
    cineQuick.value = holdMs !== undefined;
    memoryCard.value = null;
    audio.stopMusic();
    setScreen('cinematic');
    // Une cinématique qui ne charge pas ne bloque pas le jeu.
    const fail = (err: unknown): void => {
      console.error('Cinématique impossible', err);
      if (token !== cineToken) return;
      cineAfter = failed;
      endCinematic();
    };
    let def;
    try {
      def = cinematicById(id);
    } catch (err) {
      fail(err);
      return;
    }
    cineHold = holdMs ?? def.skipHoldMs;
    void CinematicPlayer.load(def, import.meta.env.BASE_URL, {
      sfx: (name, volume) => audio.play(name, volume),
      music: (name) => audio.playMusic(name, false),
      stopMusic: () => audio.stopMusic(),
      musicRate: (to, over) => audio.setMusicRate(to, over),
      card: (key) => (cineCard.value = key),
      caption: (key) => (cineCaption.value = key),
    })
      .then((player) => {
        // Passée ou quittée pendant le chargement : ce lecteur ne sert plus.
        if (token === cineToken && screen.value === 'cinematic') cine = player;
        else player.destroy();
      })
      .catch(fail);
  }

  /** La cinématique est finie, passée, ou n'a pas chargé : on rend la main à ce qui la suit. */
  function endCinematic(): void {
    cineToken++;
    cine?.destroy();
    cine = null;
    cineCard.value = null;
    cineCaption.value = null;
    cineSkip.value = 0;
    cineHoldMs = 0;
    audio.stopMusic();
    const after = cineAfter;
    cineAfter = () => undefined;
    after();
  }

  /**
   * Lance une scène de route (Moon et Cream rentrent au refuge). `after` est appelé quand elle finit ou
   * qu'elle est passée ; la scène reste dessinée, à sa dernière image, derrière ce qui suit. Une scène
   * inconnue n'arrête pas le jeu : `after` tout de suite.
   */
  function playScene(id: string, after: () => void): void {
    const def = data.scenes[id];
    if (!def) {
      console.error(`Scène inconnue : ${id}`);
      after();
      return;
    }
    scene = newScene(def, data.dialogues);
    sceneAfter = after;
    sceneT = 0;
    sceneKey = '';
    sceneHoldMs = 0;
    cineSkip.value = 0;
    setScreen('scene');
    audio.playMusic('music-camp');
  }

  /** La scène est finie ou passée : on rend la main à ce qui la suit. */
  function endScene(): void {
    if (scene && !scene.done) finishScene(scene);
    hideDialogue();
    overlay.value = 'none';
    sceneKey = '';
    sceneHoldMs = 0;
    cineSkip.value = 0;
    const after = sceneAfter;
    sceneAfter = () => undefined;
    after();
  }

  /** Recopie la ligne de la scène vers la boîte de dialogue, quand elle change. */
  function syncSceneLine(s: SceneState): void {
    const line = sceneLine(s);
    const key = line ? `${s.step}#${s.line}` : '';
    if (key === sceneKey) return;
    sceneKey = key;
    if (line && line.sfx !== '') audio.play(line.sfx.replace(/^sfx-/, ''), 0.8);
    const who = line ? SPEAKERS[line.who] : undefined;
    if (line && who) {
      showLine(who, line.face, line.text, false);
      overlay.value = 'dialogue';
    } else {
      dialogueState.value = null;
      overlay.value = 'none';
    }
  }

  /**
   * L'expédition au Bois commence. `reborn` : le boss de la région est déjà battu, son boss reformé l'attend.
   * `replay` : la graine est rejouée, aucune pièce de Lanterne n'y tombe.
   */
  function startExpedition(seed: number, regionId: string, reborn: boolean, replay: boolean): void {
    const { sheet } = buildSheet(data, current, CLASS);
    const unlocked = unlockedContent(data, current);
    run = createRun(data, {
      seed, regionId, classId: CLASS, vigil: 1, sheet,
      unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: current.settings.autoSkills,
      // Le souvenir que le boss de la région garde encore, s'il y en a un.
      memory: pendingMemory(data, current, regionId),
      reborn,
      flameRarity: flameRarity(current, data),
      ...lanternRun(data, current, replay),
    });
    renderer.beginRun(run);
    paused = false;
    acc = 0;
    deadAt = 0;
    banner = null;
    bannerNext = null;
    ending.value = null;
    bossCard.value = null;
    told.water = false;
    told.beacon = false;
    told.blind = false;
    audio.play('ui-confirm');
    audio.playMusic(run.region.music.calm);
    setScreen('run');
    say(t('hud.hint.move'), 4500);
  }

  /** Le prologue : il est noté comme vu, puis le jeu continue là où on l'attendait. */
  function playIntro(after: 'camp' | 'title' | 'tutorial'): void {
    playCinematic(introCinematic().id, () => {
      if (!current.account.unlocks.includes(INTRO_SEEN)) {
        current.account.unlocks.push(INTRO_SEEN);
        changed();
        persist();
      }
      if (after === 'tutorial') startTutorial(false);
      else if (after === 'camp') enterCamp();
      else setScreen('title');
    });
  }

  const actions: Actions = {
    start() {
      audio.unlock();
      audio.play('ui-confirm');
      // Une sauvegarde sans héros : le prologue se joue une fois (document 15 §1), puis le tutoriel.
      // Un tutoriel quitté en cours reprend au début, sans rejouer le prologue. Une sauvegarde qui a
      // déjà un héros n'y est jamais envoyée.
      const noHero = Object.keys(current.heroes).length === 0;
      const unlocks = current.account.unlocks;
      const needTutorial = noHero && !unlocks.includes(TUTORIAL_SEEN);
      if (noHero && !unlocks.includes(INTRO_SEEN)) playIntro(needTutorial ? 'tutorial' : 'camp');
      else if (needTutorial) startTutorial(false);
      else enterCamp();
    },
    prologue() {
      audio.unlock();
      audio.play('ui-confirm');
      playIntro('title');
    },
    tutorial() {
      if (!knowsCream(current)) return;
      audio.unlock();
      audio.play('ui-confirm');
      startTutorial(true);
    },
    skipTutorial() {
      if (!run?.tutorial) return;
      audio.play('ui-confirm');
      finishTutorial();
    },
    dialogueNext() {
      if (performance.now() < guardUntil) return;
      const shown = dialogueState.value;
      // La ligne s'écrit encore : A la finit d'abord.
      if (shown && dlgChars < dlgLen) {
        dlgChars = dlgLen;
        dialogueShown.value = dlgLen;
        return;
      }
      if (campTalk) {
        closeCampTalk();
        return;
      }
      if (screen.value === 'scene') {
        if (scene && shown) {
          advanceScene(scene);
          audio.play('ui-move', 0.5);
        }
        return;
      }
      // Une ligne muette passe seule : A ne coupe pas le silence.
      if (!run || run.phase !== 'dialogue' || paused || !shown) return;
      advanceDialogue(run);
      audio.play('ui-move', 0.5);
    },
    dialogueSkip() {
      if (performance.now() < guardUntil) return;
      if (campTalk) {
        closeCampTalk();
        return;
      }
      if (screen.value === 'scene') {
        if (scene && !scene.done) {
          audio.play('ui-back', 0.6);
          endScene();
        }
        return;
      }
      if (!run || run.phase !== 'dialogue' || paused) return;
      skipDialogue(run);
      audio.play('ui-back', 0.6);
    },
    creamTalk() {
      stopCamp(camp, 'cream');
      if (screen.value !== 'camp' || campTalk || !knowsCream(current)) return;
      // Une réplique au hasard, jamais deux fois la même de suite.
      let count = 0;
      while (FR[`camp.cream.${count + 1}`] !== undefined) count++;
      if (count === 0) return;
      let pick = 1 + Math.floor(Math.random() * count);
      if (pick === campLast && count > 1) pick = 1 + (pick % count);
      campLast = pick;
      campTalk = true;
      showLine('cream', CAMP_CREAM_FACES[Math.floor(Math.random() * CAMP_CREAM_FACES.length)]!, `camp.cream.${pick}`, true);
      overlay.value = 'dialogue';
      audio.play('intro-miaou', 0.35);
      guard(250);
    },
    replayMemory(id) {
      const memory = data.memories.find((m) => m.id === id);
      if (screen.value !== 'memories' || !memory || !hasMemory(current, id)) return;
      audio.play('ui-confirm');
      // Revue depuis le refuge : pas de carton, et on revient à la liste.
      playCinematic(memory.cinematic, () => {
        audio.playMusic('music-camp');
        setScreen('memories');
      });
    },
    closeMemoryCard() {
      if (!memoryCard.value || performance.now() < guardUntil) return;
      audio.play('ui-confirm', 0.7);
      showEnd();
    },
    goto(next) {
      audio.play(next === 'camp' ? 'ui-back' : 'ui-confirm', 0.7);
      // Moon s'arrête ; à côté de l'objet ouvert, s'il y allait.
      if (screen.value === 'camp') stopCamp(camp, next);
      if (next === 'camp') {
        // Du bilan, on arrive devant la porte ; d'un écran du refuge, Moon est là où il était.
        if (ending.value) arriveAtCamp();
        ending.value = null;
      }
      if (next === 'lantern') {
        markLanternSeen(current.account.lantern);
        changed();
        persistSoon();
      }
      setScreen(next);
    },
    campJump(step) {
      const ids = data.camp.objects.filter((o) => o.reach > 0 && campVisible(data, current).has(o.id)).map((o) => o.id);
      const at = ids.indexOf(focusedId.value ?? '');
      campGoto(ids[(at < 0 ? (step > 0 ? 0 : ids.length - 1) : at + step + ids.length) % ids.length]!);
    },
    depart(seed, regionId = REGION) {
      audio.unlock();
      // Une route fermée : le gardien de la région d'avant n'est pas battu.
      if (!regionOpen(data, current, regionId)) {
        audio.play('refuse');
        return;
      }
      // La porte ne grince que si on la passe : « Repartir », au bilan, n'y revient pas.
      if (screen.value === 'door') audio.play('intro-porte-grince', 0.7);
      // La graine est tirée avant la cinématique : « rejouer la même carte » reste la même carte.
      const chosen = seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
      const reborn = bossBeaten(current, regionId);
      const replay = seed !== undefined;
      const cinematics = data.regions[regionId]?.cinematics;
      const id = cinematics ? (reborn ? cinematics.reborn ?? null : cinematics.first) : null;
      if (!id) {
        startExpedition(chosen, regionId, reborn, replay);
        return;
      }
      audio.play('ui-confirm');
      // Déjà vue : un seul appui sur Retour la passe. Sinon, Retour maintenu, comme le prologue.
      const key = `seen.${id}`;
      const seen = current.account.unlocks.includes(key);
      playCinematic(id, () => {
        if (!current.account.unlocks.includes(key)) {
          current.account.unlocks.push(key);
          changed();
          persist();
        }
        startExpedition(chosen, regionId, reborn, replay);
      }, () => startExpedition(chosen, regionId, reborn, replay), seen ? 1 : undefined);
    },
    buyAltar(id) {
      const res = buyAltarRank(current, data, id);
      if (res.ok) {
        audio.play('buy');
        changed();
        persistSoon();
      } else {
        audio.play('refuse');
      }
    },
    refundAltar() {
      refundAltar(current, data);
      audio.play('ui-back');
      changed();
      persistSoon();
    },
    toggleAltar(id) {
      if ((current.account.altar[id] ?? 0) <= 0) {
        audio.play('refuse');
        return;
      }
      setAltarBoostEnabled(current, id, current.account.altarDisabled.includes(id));
      audio.play('ui-confirm', 0.7);
      changed();
      persistSoon();
    },
    lanternPlace(face, id) {
      const ok = placePiece(data, current.account.lantern, face, id);
      audio.play(ok ? 'ui-confirm' : 'refuse');
      if (!ok) return;
      changed();
      persist();
    },
    lanternClear(face) {
      clearFace(current.account.lantern, face);
      audio.play('ui-back', 0.7);
      changed();
      persist();
    },
    lanternClearAll() {
      clearLantern(current.account.lantern);
      audio.play('ui-back', 0.7);
      changed();
      persist();
    },
    takeCard(index) {
      if (!run || performance.now() < guardUntil) return;
      if (!takeCard(run, index)) return;
      audio.play('ui-confirm');
      if (run.phase === 'levelup') {
        syncLevelUp();
        guard(200);
      }
    },
    reroll() {
      if (!run || performance.now() < guardUntil) return;
      if (rerollCards(run)) {
        audio.play('ui-confirm');
        syncLevelUp();
      } else {
        audio.play('refuse');
      }
    },
    banish(index) {
      if (!run || performance.now() < guardUntil) return;
      if (banishCard(run, index)) {
        audio.play('ui-back');
        syncLevelUp();
      } else {
        audio.play('refuse');
      }
    },
    skip() {
      if (!run) return;
      if (skipCards(run)) {
        audio.play('ui-back');
        if (run.phase === 'levelup') syncLevelUp();
        guard(200);
      }
    },
    closeChest() {
      if (!run || performance.now() < guardUntil) return;
      closeChest(run);
      audio.play('ui-confirm');
      if (run.phase === 'chest') {
        chest.value = run.chest;
        guard(250);
      }
    },
    takeFlame(index) {
      if (!run || performance.now() < guardUntil) return;
      const paid = run.totemOffers[index] ? offerCost(run, run.totemOffers[index]!) : 0;
      if (takeFlame(run, index)) audio.play(paid > 0 ? 'flame-feed' : 'ui-confirm');
      else audio.play('refuse');
    },
    feedFlame(index) {
      if (!run) return;
      if (feedOffer(run, index)) {
        audio.play('ui-move');
        syncTotem();
      } else {
        audio.play('refuse');
      }
    },
    unfeedFlame(index) {
      if (!run) return;
      if (unfeedOffer(run, index)) {
        audio.play('ui-back');
        syncTotem();
      }
    },
    takeEvolution(index) {
      if (!run || performance.now() < guardUntil) return;
      if (takeEvolution(run, index)) audio.play('ui-confirm');
    },
    closeForge() {
      if (!run || performance.now() < guardUntil) return;
      closeForge(run);
      audio.play('ui-back');
    },
    buy(index) {
      if (!run || performance.now() < guardUntil) return;
      if (buyItem(run, index)) {
        syncShop();
        // La carte achetée peut disparaître : une fois l'écran repeint, le focus retombe sur ce qui reste.
        requestAnimationFrame(() => requestAnimationFrame(() => focus.ensure()));
        guard(250);
      } else {
        audio.play('refuse');
      }
    },
    closeShop() {
      if (!run || performance.now() < guardUntil) return;
      closeShop(run);
      audio.play('ui-back');
    },
    closeFind() {
      if (!run || performance.now() < guardUntil) return;
      closeFind(run);
      audio.play('ui-confirm');
      if (run.phase === 'find') {
        findState.value = { find: run.find, gold: run.findGold };
        guard(250);
      }
    },
    pause(on) {
      setPaused(on);
      audio.play(on ? 'ui-confirm' : 'ui-back', 0.7);
    },
    abandon() {
      if (!run) return;
      abandonRun(run);
      finishRun();
    },
    setSetting(key, value) {
      current.settings[key] = value;
      applySettings();
      audio.play('ui-move', 0.6);
      changed();
      persistSoon();
    },
    fullscreen() {
      if (document.fullscreenElement) void document.exitFullscreen();
      else {
        // Échap quitte le plein écran par défaut ; on réserve la touche au jeu
        // (Chromium) — un appui maintenu garde la sortie du plein écran.
        void document.documentElement
          .requestFullscreen?.()
          .then(() => (navigator as { keyboard?: { lock?(keys: string[]): Promise<void> } }).keyboard?.lock?.(['Escape']))
          .catch(() => undefined);
      }
    },
    eraseSave() {
      void store.erase().then(() => {
        current = newSave(Date.now());
        save.value = current;
        applySettings();
        changed();
        setScreen('title');
      });
    },
    uiSound(name) {
      audio.play(UI_SOUNDS[name], 0.6);
    },
  };
  refs.actions = actions;
  focus.onMove = () => audio.play('ui-move', 0.5, 1, 40);
  applySettings();

  // Mise à l'échelle entière de l'image native, avec des bandes noires si l'écran n'est pas en 16:9.
  function layout(): void {
    const k = Math.min(window.innerWidth / 640, window.innerHeight / 360);
    const pixelRatio = host.id === 'owl' ? window.devicePixelRatio : 1;
    // Le viewport de la WebView est arrondi au pixel CSS, même sur un écran 16:9.
    const wholeScale = Math.floor((k + (host.id === 'owl' ? 1 / 360 : 0)) * pixelRatio);
    const scale = wholeScale > 0 ? Math.min(k, wholeScale / pixelRatio) : k;
    document.documentElement.style.setProperty('--scale', String(scale));
    stage.classList.toggle('smooth', wholeScale === 0);
    (document.getElementById('small-hint') as HTMLElement).hidden = wholeScale > 0;
  }
  window.addEventListener('resize', layout);
  layout();

  input.onDeviceChange = (d) => (device.value = d);
  input.onBlur = () => setPaused(true, t('pause.blur'));
  input.onDisconnect = () => setPaused(true, t('pause.disconnected'));
  host.onPause(() => {
    setPaused(true, t('pause.blur'));
    cinePaused = true;
    audio.suspend(true);
    persist();
  });
  host.onResume(() => {
    cinePaused = false;
    audio.suspend(false);
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  render(<App />, uiRoot);
  (window as unknown as { __braiseBootDone?: () => void }).__braiseBootDone?.();
  screen.value = 'title';
  guard(100);

  function processEvents(r: Run): void {
    for (let i = 0; i < r.evCount; i++) {
      const type = r.evType[i]!;
      const x = r.evX[i]!;
      const y = r.evY[i]!;
      const a = r.evA[i]!;
      const b = r.evB[i]!;
      const c = r.evC[i]!;
      renderer.onEvent(r, type, x, y, a, b, c);
      switch (type) {
        case EV.kill: audio.play('kill', 0.35, 1, 45); break;
        case EV.heroHurt: audio.play('hurt', 0.9); break;
        case EV.heroDash: audio.play('dash', 0.7); break;
        case EV.pickup:
          if (a === PK_GEM || a === PK_RED_GEM) audio.gem();
          else if (a === PK_GOLD) audio.play('coin', 0.5, 1, 60);
          else if (a === PK_PIECE) {
            audio.play('chest', 0.8);
            sayAfter(t('hud.piece', { name: t(`${r.data.lantern.pieces[b]!.id}.name`) }), 4500);
          } else if (a !== PK_CHEST) audio.play('coin', 0.5, 0.8, 60);
          break;
        case EV.levelUp: audio.play('levelup', 0.8); break;
        case EV.arc: audio.play('scythe', 0.4, 1, 90); break;
        case EV.nova: audio.play('hammer', 0.6, 1, 120); break;
        case EV.shot: {
          const def = r.data.weapons[a];
          if (def?.behavior === 'lob') audio.play('arrow', 0.3, 0.7, 150);
          else if (def?.levels[0]?.sprite === 'shot-arrow') audio.play('arrow', 0.35, 1, 110);
          else audio.play('spark', 0.3, 1, 110);
          break;
        }
        case EV.lobLand: audio.play('brand', 0.45, 1, 120); break;
        case EV.lamp: audio.play('brand', 0.3, 1.2, 120); break;
        case EV.bolt: if (c & 1) audio.play('bolt', c >= 2 ? 0.55 : 0.4, c >= 2 ? 0.85 : 1, 120); break;
        case EV.frost: audio.play('frost', 0.3, 1, 180); break;
        case EV.thread: audio.play('spark', 0.35, 0.8, 120); break;
        case EV.threadCross: audio.play('bolt', 0.5, 0.8, 150); break;
        case EV.enemyShot: audio.play('enemy-shot', 0.4, 1, 120); break;
        case EV.waveWarning:
          audio.play('wave', 0.8);
          say(r.time < 60 ? `${t('hud.wave')} — ${t('hud.hint.dash')} : ${device.value === 'gamepad' ? 'A' : 'Espace'}` : t('hud.wave'));
          break;
        case EV.eliteSpawn:
          audio.play('elite', 0.9);
          say(t(`${r.data.enemies[a]!.id}.name`));
          break;
        case EV.bossSpawn:
          if (r.data.enemies[a]?.emerge !== undefined) {
            // La Dame de Vase n'est pas encore là : la musique se tait, on n'entend que son souffle.
            audio.stopMusic();
            audio.play('dame-souffle', 0.9);
            break;
          }
          audio.play('boss', 1);
          audio.playMusic(r.region.music.boss);
          // Le boss du tutoriel porte son propre nom, et sa leçon est déjà dans le bandeau.
          if (!r.tutorial) showBossCard(r, r.region.bossIdx, false);
          break;
        case EV.bossSurge:
          audio.play('dame-surgit', 1);
          if (a === 1) {
            // Elle est sortie de l'eau : son thème commence, son nom s'affiche.
            audio.playMusic(r.region.music.boss);
            showBossCard(r, r.region.bossIdx, false);
          }
          break;
        case EV.bossDive: audio.play('dame-plonge', 0.9); break;
        case EV.bossHum: audio.play('dame-chant', 0.5, 1, 6000); break;
        case EV.bossPhase:
          if (a > 1) audio.play(r.data.enemies[r.region.bossIdx]!.behavior === 'boss-lady' ? 'dame-cri' : 'boss', 0.9, r.data.enemies[r.region.bossIdx]!.behavior === 'boss-lady' ? 1 : 1.15);
          break;
        case EV.bossDeath:
          audio.play('victory', 1);
          audio.playMusic(r.region.music.calm);
          // Pas de portail en tutoriel : la dernière barrière tombe.
          if (!r.tutorial) {
            showBossCard(r, a, true);
            say(t(r.map.pois.some((p) => p.kind === 'memory') ? 'hud.memory' : 'hud.portal'), 6000);
          }
          break;
        case EV.tideStart:
          audio.play('maree', 0.9);
          say(t('hud.tide'), 3600);
          break;
        case EV.handRise: audio.play('main-vase', b > 0 ? 0.6 : 0.4, 1, 180); break;
        case EV.mire: audio.play('vase', 0.4, 1, 140); break;
        case EV.wispPop: audio.play('lueur', 0.5, 1, 120); break;
        case EV.toadBurst: audio.play('crapaud', 0.6, 1, 200); break;
        case EV.toll: audio.play('cloche', 0.9); break;
        case EV.vanish: audio.play('brume', 0.7); break;
        case EV.dodge:
          audio.play('esquive', 0.7);
          say(t('hud.dodge'), 1100);
          break;
        case EV.beaconLit:
          audio.play('lanterne', 0.7, 1, 300);
          if (!told.beacon) {
            told.beacon = true;
            say(t('hud.beacon'), 3600);
          }
          break;
        case EV.heroAfflict:
          if (a === 1) audio.play('hurt', 0.4, 1.4, 600);
          else audio.play('vase', 0.6, 0.8, 300);
          break;
        case EV.gateOpen: audio.play('gate', 0.7, 1, 150); break;
        case EV.bark: audio.play('talk-cream', 0.35); break;
        case EV.tutoRespawn:
          // Moon reprend à l'entrée de la salle. Face au Guetteur, il revient aussitôt : sa musique reste.
          audio.play('death', 0.6);
          break;
        case EV.skill: audio.play('skill', 0.8); break;
        case EV.ultimate: audio.play('ultimate', 0.9); break;
        case EV.flask: audio.play('flask', 0.8); break;
        case EV.evolution: audio.play('evolution', 1); break;
        case EV.heroDeath: audio.play('death', 1); break;
        case EV.heroRevive:
          audio.play('evolution', 0.8, 1.2);
          say(t('hud.revive'));
          break;
        // En tutoriel, le bandeau de leçon le dit déjà.
        case EV.poiStart: if (!r.tutorial) say(t(a === 1 ? 'hud.totem' : 'hud.brazier'), 3200); break;
        case EV.poiDone:
          audio.play('buy', 0.8);
          say(a === 0 ? t('hud.brazierLit') : a === 1 ? t('hud.spring') : a === 3 ? t('hud.treasure') : t('hud.cache'));
          break;
        case EV.brazierNone: say(t('hud.brazierNone'), 3600); break;
        case EV.totemDone: audio.play('totem', 0.9); break;
        case EV.shopOpen: audio.play('shop-open', 0.8); break;
        case EV.shopBuy: audio.play('shop-buy', 0.9); break;
        case EV.bossWarning: say(FR[`${r.cfg.regionId}.bossWarning`] ?? t('hud.bossWarning'), 5000); break;
        case EV.flameCall: say(t('hud.flameCall')); break;
        case EV.hunt: say(t('hud.hunt', { n: Math.round(a * 100) })); break;
        case EV.pieceDrop: say(t('hud.pieceDrop'), 4500); break;
        case EV.telegraphHit: audio.play('hammer', 0.5, 1.3, 100); break;
        case EV.charge: audio.play('dash', 0.6, 0.6); break;
      }
    }
    clearEvents(r);
  }

  function buildHud(r: Run, now: number): HudState {
    const h = r.hero;
    const tuning = r.data.tuning;
    if (bannerNext && now >= bannerUntil) {
      const next = bannerNext;
      bannerNext = null;
      say(next.text, next.ms);
    }
    let boss: HudState['boss'] = null;
    // Le boss du tutoriel n'a pas d'arène (`bossSpawned` reste faux) : seul son identifiant est posé.
    if ((r.director.bossSpawned || (r.tutorial !== null && r.director.bossUid !== 0)) && !r.director.bossDead) {
      const e = r.enemies;
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] === r.director.bossUid) {
          boss = { name: t(`${r.data.enemies[e.kind[i]!]!.id}.name`), frac: bossBarFrac(r, i), phase: r.director.bossPhase };
        }
      }
    }
    const ready = readyEvolution(r);
    const minutes = r.time / 60;
    // Le carton d'un boss s'efface sur sa dernière seconde, puis il est retiré.
    const card = bossCard.value;
    if (card && now >= bossCardUntil) bossCard.value = null;
    else if (card && !card.leaving && now >= bossCardUntil - 900) bossCard.value = { ...card, leaving: true };
    // Les états du héros, du plus gênant au moins gênant : la vase, la morsure, la Lueur étouffée, l'eau, l'élan.
    const statuses: HudState['statuses'] = [];
    if (h.mireT > 0) statuses.push({ id: 'mire', icon: 'sign-mire' });
    if (h.drainT > 0) statuses.push({ id: 'drain', icon: 'sign-drain' });
    if (r.blind < 1) statuses.push({ id: 'dim', icon: 'sign-dim' });
    if (h.wading) statuses.push({ id: 'wade', icon: 'sign-wade' });
    if (h.dodgeT > 0) statuses.push({ id: 'dodge', icon: 'sign-dodge' });
    // Il patauge : un clapotis à chaque pas, tant qu'il marche.
    if (h.wading && h.moving && r.phase === 'playing') audio.play('eau', 0.22, 1, 430);
    if (h.wading && !told.water && r.map.waterSlow > 0) {
      told.water = true;
      sayAfter(t('hud.hint.water'), 4200);
    }
    if (r.blind < 1 && !told.blind) {
      told.blind = true;
      say(t('hud.blind'), 4200);
    }
    return {
      hp: h.hp, maxHp: h.stats.maxHp, level: h.level, xp: h.xp, xpNext: h.xpNext, time: r.time, boss, statuses,
      flasks: h.flasks, maxFlasks: h.stats.flasks, flaskBlocked: r.mods.noFlask, gold: h.gold,
      ashes: Math.round(tuning.ashes.perMinute * minutes + h.ashDrops), kills: h.kills, vigil: r.cfg.vigil,
      weapons: r.weapons.map((w) => {
        const def = r.data.weapons[w.def]!;
        const evolvable = !def.evolved && w.level >= def.levels.length && r.relics.some((x) => x.def === def.relic);
        return { icon: def.icon, level: def.evolved ? 6 : w.level, max: 6, ready: evolvable || w === ready };
      }),
      relics: r.relics.map((x) => ({ icon: r.data.relics[x.def]!.icon, level: x.level, max: r.data.relics[x.def]!.maxLevel })),
      skillFrac: 1 - Math.max(0, h.skillCd) / skillCooldown(r),
      ultFrac: h.ultT > 0 ? h.ultT / r.cls.ultimate.duration : h.ultGauge / tuning.ultimate.gaugeMax,
      ultActive: h.ultT > 0,
      // Une ruée prête : l'anneau est plein ; sinon il montre la charge qui revient.
      dashFrac: dashReady(r),
      dashCharges: h.dashCharges, dashMax: dashChargesMax(r),
      message: now < bannerUntil ? banner : null,
      fps: current.settings.showFps ? fps : 0,
    };
  }

  function drawMinimap(r: Run): void {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const size = r.map.size * r.map.tile;
    const k = 48 / size;
    ctx.clearRect(0, 0, 48, 48);
    if (r.map.waterSlow > 0) {
      // L'eau profonde, à gros grains : un point de mini-carte pour deux tuiles et demie.
      const cs = r.map.size + 1;
      ctx.fillStyle = 'rgba(31, 158, 150, 0.45)';
      for (let py = 0; py < 48; py++) {
        for (let px = 0; px < 48; px++) {
          const cx = Math.round(((px + 0.5) / 48) * r.map.size);
          const cy = Math.round(((py + 0.5) / 48) * r.map.size);
          if (r.map.corners[cy * cs + cx] === 1) ctx.fillRect(px, py, 1, 1);
        }
      }
      for (const b of r.map.beacons) {
        if (b.life <= 0) continue;
        ctx.fillStyle = '#b8fff0';
        ctx.fillRect(Math.round(b.x * k) - 1, Math.round(b.y * k) - 1, 2, 2);
      }
    }
    ctx.fillStyle = '#2c3e5c';
    const b = r.data.tuning.borderTiles * r.map.tile * k;
    ctx.fillRect(0, 0, 48, b); ctx.fillRect(0, 48 - b, 48, b); ctx.fillRect(0, 0, b, 48); ctx.fillRect(48 - b, 0, b, 48);
    for (const poi of r.map.pois) {
      if (!poi.discovered) continue;
      ctx.fillStyle = poi.state === 2 ? '#454a5c' : MINIMAP_COLORS[poi.kind];
      ctx.fillRect(Math.round(poi.x * k) - 1, Math.round(poi.y * k) - 1, 2, 2);
    }
    const e = r.enemies;
    ctx.fillStyle = '#ff3d81';
    for (let i = 0; i < e.count; i++) {
      if (r.data.enemies[e.kind[i]!]!.rank !== 'normal') ctx.fillRect(Math.round(e.x[i]! * k) - 1, Math.round(e.y[i]! * k) - 1, 3, 3);
    }
    if (r.director.bossSpawned && !r.director.bossDead) {
      ctx.strokeStyle = '#c2185b';
      ctx.beginPath();
      ctx.arc(r.director.arenaX * k, r.director.arenaY * k, r.director.arenaR * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff1c2';
    ctx.fillRect(Math.round(r.hero.x * k) - 1, Math.round(r.hero.y * k) - 1, 2, 2);
  }

  /** Les boutons dans les menus : un seul système de focus pour tous les écrans. */
  function handleMenus(now: number, dt: number): void {
    const f = input.frame;
    const top = refs.handlers[refs.handlers.length - 1];
    if (f.navX !== 0 || f.navY !== 0) {
      if (!top?.nav?.(f.navX, f.navY)) focus.move(f.navX, f.navY);
    }
    if (now < guardUntil) return;
    const focused = focus.focused;
    if (focused?.hasAttribute('data-hold')) {
      // « Partir » se maintient une demi-seconde, pour éviter un départ par erreur.
      if (f.held.confirm) {
        holdMs += dt;
        holdProgress.value = Math.min(1, holdMs / HOLD_MS);
        if (holdMs >= HOLD_MS) {
          holdMs = 0;
          holdProgress.value = 0;
          focus.activate();
        }
      } else if (holdMs > 0) {
        holdMs = 0;
        holdProgress.value = 0;
      }
    } else if (f.pressed.confirm) {
      focus.activate();
    }
    if (overlay.value === 'levelup') {
      // Passer : B maintenu.
      if (f.held.back) {
        skipMs += dt;
        const lu = levelUp.value;
        if (lu) levelUp.value = { ...lu, skipHold: Math.min(1, skipMs / SKIP_HOLD_MS) };
        if (skipMs >= SKIP_HOLD_MS) {
          skipMs = 0;
          actions.skip();
        }
      } else if (skipMs > 0) {
        skipMs = 0;
        const lu = levelUp.value;
        if (lu) levelUp.value = { ...lu, skipHold: 0 };
      }
    } else if (f.pressed.back) {
      top?.back?.();
    }
    if (f.pressed.menuX) top?.x?.();
    if (f.pressed.menuY) top?.y?.();
    if (f.pressed.pause && !f.pressed.back) top?.pause?.();
    if (f.pressed.tabPrev) top?.tabPrev?.();
    if (f.pressed.tabNext) top?.tabNext?.();
  }

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(250, now - last);
    last = now;
    frames++;
    if (now - fpsAt >= 1000) {
      fps = frames;
      frames = 0;
      fpsAt = now;
    }
    input.poll(now);
    renderer.beginFrame();
    const f = input.frame;
    const playing = screen.value === 'run' && run !== null;

    if (screen.value === 'cinematic') {
      if (memoryCard.value) {
        // Le carton d'un souvenir : il n'y a plus rien à passer, A ou B mène au bilan.
        if (f.pressed.confirm || f.pressed.back) actions.closeMemoryCard();
        requestAnimationFrame(frame);
        return;
      }
      // Passer tout : B maintenu (un appui court ne fait rien). A passe à l'image suivante.
      const hold = cineHold;
      if (f.held.back && now >= guardUntil) cineHoldMs += dt;
      else cineHoldMs = 0;
      const k = Math.min(1, cineHoldMs / hold);
      if (k !== cineSkip.value) cineSkip.value = k;
      if (cine && !cinePaused && f.pressed.confirm && now >= guardUntil) cine.next();
      if (cine && !cinePaused) cine.update(dt);
      if (cine) renderer.app.renderer.render(cine.root);
      else renderer.drawBlank();
      if (cineHoldMs >= hold || cine?.finished) endCinematic();
      requestAnimationFrame(frame);
      return;
    }

    if (screen.value === 'scene') {
      const lit = current.account.regions[REGION]?.lit ?? false;
      const s = scene;
      if (memoryCard.value) {
        // Le carton du souvenir, par-dessus le refuge : A ou B mène au bilan.
        if (f.pressed.confirm || f.pressed.back) actions.closeMemoryCard();
      } else if (s && !s.done) {
        // A : finit la réplique, puis passe à la suivante. B maintenu : passe toute la scène.
        if (f.pressed.confirm && now >= guardUntil && dialogueState.value) actions.dialogueNext();
        if (f.held.back && now >= guardUntil) sceneHoldMs += dt;
        else sceneHoldMs = 0;
        const k = Math.min(1, sceneHoldMs / SCENE_SKIP_MS);
        if (k !== cineSkip.value) cineSkip.value = k;
        if (!held) {
          sceneT += dt / 1000;
          stepScene(s, Math.min(0.1, dt / 1000));
          if (s.kindled) audio.play('intro-flamme', 0.7);
          typeDialogue(dt);
        }
        syncSceneLine(s);
        if (sceneHoldMs >= SCENE_SKIP_MS) {
          audio.play('ui-back', 0.6);
          endScene();
        } else if (s.done) {
          endScene();
        }
      }
      if (scene) {
        renderer.drawScene(now, Math.min(0.1, dt / 1000), lit, data.classes[CLASS]!.sprite, scene,
          Math.min(1, sceneT / SCENE_FADE_S), campVisible(data, current));
      }
      requestAnimationFrame(frame);
      return;
    }

    if (overlay.value === 'dialogue') {
      handleDialogue(now, dt);
      typeDialogue(dt);
    } else if (playing && run && overlay.value === 'none' && !paused) {
      if (f.pressed.pause && now >= guardUntil) setPaused(true);
      if (f.pressed.skill) pendSkill = true;
      if (f.pressed.ultimate) pendUlt = true;
      if (f.pressed.flask) pendFlask = true;
    } else {
      handleMenus(now, dt);
    }

    if (playing && run) {
      const r = run;
      if (!paused && !held && r.phase === 'playing') {
        acc += dt;
        let steps = 0;
        const stepMs = STEP * 1000;
        while (acc >= stepMs && steps < 5 && r.phase === 'playing') {
          stepInput.moveX = f.moveX;
          stepInput.moveY = f.moveY;
          stepInput.aimX = f.aimX;
          stepInput.aimY = f.aimY;
          // Espace et A confirment aussi les écrans de choix : tant que l'écran n'est pas refermé côté interface
          // (la garde se pose plus bas), le bouton qui vient de choisir une carte ne doit pas lancer une ruée.
          stepInput.dash = f.held.dash && now >= guardUntil && overlay.value === 'none';
          stepInput.skill = pendSkill;
          stepInput.ultimate = pendUlt;
          stepInput.flask = pendFlask;
          pendSkill = false;
          pendUlt = false;
          pendFlask = false;
          stepRun(r, stepInput);
          processEvents(r);
          acc -= stepMs;
          steps++;
        }
        if (acc > stepMs) acc = stepMs;
      } else {
        acc = 0;
      }

      // Un dialogue : la partie est en pause, les lignes muettes passent seules, la boîte suit la ligne.
      if (r.phase === 'dialogue' && !paused && !held) tickDialogue(r, dt / 1000);
      syncDialogue(r);
      if (r.evCount > 0) processEvents(r);

      // La simulation attend un choix : l'écran correspondant s'ouvre, avec sa garde.
      if (r.phase === 'dialogue') {
        // Un dialogue peut suivre un choix dans la même image (la carte prise, la trouvaille fermée) :
        // l'écran du choix lui cède alors la place.
        if (overlay.value !== 'dialogue' && !paused) {
          overlay.value = 'dialogue';
          levelUp.value = null;
          chest.value = null;
          totemState.value = null;
          forgeState.value = null;
          shopState.value = null;
          findState.value = null;
          pendSkill = false;
          pendUlt = false;
          pendFlask = false;
          guard(250);
        }
      } else if (r.phase === 'levelup' && overlay.value !== 'levelup') {
        syncLevelUp();
        overlay.value = 'levelup';
        guard(350);
      } else if (r.phase === 'chest' && overlay.value !== 'chest') {
        chest.value = r.chest;
        overlay.value = 'chest';
        audio.play('chest', 0.9);
        guard(350);
      } else if (r.phase === 'forge' && overlay.value !== 'forge') {
        forgeState.value = r.forgeChoices.map((i) => {
          const from = r.weapons[i]!.def;
          return { from, to: r.data.weapons[from]!.evolution };
        });
        overlay.value = 'forge';
        audio.play('chest', 0.9);
        guard(350);
      } else if (r.phase === 'totem' && overlay.value !== 'totem') {
        syncTotem();
        overlay.value = 'totem';
        guard(350);
      } else if (r.phase === 'shop' && overlay.value !== 'shop') {
        syncShop();
        overlay.value = 'shop';
        guard(350);
      } else if (r.phase === 'find' && overlay.value !== 'find') {
        findState.value = { find: r.find, gold: r.findGold };
        overlay.value = 'find';
        audio.play('chest', 0.9);
        guard(350);
      } else if (r.phase === 'playing' && overlay.value !== 'none' && overlay.value !== 'pause') {
        overlay.value = 'none';
        levelUp.value = null;
        chest.value = null;
        totemState.value = null;
        forgeState.value = null;
        shopState.value = null;
        findState.value = null;
        guard(150);
      }

      renderer.drawRun(r, r.phase === 'playing' && !paused ? acc / (STEP * 1000) : 1, dt);
      if (now - hudAt > 80) {
        hudAt = now;
        hud.value = buildHud(r, now);
        const tu = r.tutorial;
        if (tu) {
          // Pendant un dialogue, le bandeau de leçon et la réplique courte s'effacent.
          const quiet = r.phase === 'dialogue';
          const next = { banner: quiet ? null : tu.banner, glyph: tu.bannerGlyph, bark: quiet ? null : tu.bark };
          const was = tutoHud.value;
          if (!was || was.banner !== next.banner || was.glyph !== next.glyph || was.bark !== next.bark) tutoHud.value = next;
        }
      }
      if (now - mapAt > 250) {
        mapAt = now;
        drawMinimap(r);
      }
      if (r.phase === 'victory') {
        if (r.tutorial) finishTutorial();
        else finishRun();
      } else if (r.phase === 'dead') {
        // La lueur rétrécit jusqu'à un point avant l'écran de fin.
        if (deadAt === 0) deadAt = now;
        if (now - deadAt > 1700 || r.outcome === 'abandon') finishRun();
      }
    } else {
      const lit = current.account.regions[REGION]?.lit ?? false;
      const atCamp = screen.value === 'camp';
      if (atCamp) tickCamp(f, dt);
      renderer.drawCamp(now, lit, data.classes[CLASS]!.sprite, screen.value !== 'title' && knowsCream(current), {
        moon: screen.value === 'title' ? null : camp,
        visible: campVisible(data, current),
        near: atCamp ? focusedId.value : null,
        doorOpen: screen.value === 'door' && holdProgress.value > 0,
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Une prise pour les tests de parcours et le réglage : rien d'autre ne s'en sert.
  (window as unknown as { __braise?: unknown }).__braise = {
    get run() {
      return run;
    },
    get save() {
      return current;
    },
    /** Moon au refuge. */
    get camp() {
      return camp;
    },
    actions,
    input,
    /** La scène de route en cours : son identifiant, son étape, une avance rapide pour les captures. */
    scene: {
      get id(): string | null {
        return scene && screen.value === 'scene' ? scene.def.id : null;
      },
      get step(): number | null {
        return scene && screen.value === 'scene' ? scene.step : null;
      },
      /** Avance la scène de `seconds` secondes ; avec `talk`, A passe chaque réplique. */
      advance(seconds: number, talk = false): void {
        for (let ms = 0; scene && !scene.done && ms < seconds * 1000; ms += 50) {
          stepScene(scene, 0.05);
          sceneT += 0.05;
          if (talk && sceneLine(scene)) advanceScene(scene);
        }
      },
    },
    /** La cinématique en cours : son temps, son plan, et une avance rapide pour les captures. */
    cinematic: {
      get time(): number | null {
        return cine ? cine.elapsed : null;
      },
      get shot(): string | null {
        return cine ? cine.shotId : null;
      },
      advance(seconds: number): void {
        for (let ms = 0; cine && ms < seconds * 1000; ms += 50) cine.update(50);
      },
      next(): void {
        cine?.next();
      },
      /** Fige la cinématique (vrai) ou la relance (faux). */
      freeze(on: boolean): void {
        cinePaused = on;
      },
    },
    /**
     * Avance la partie de `steps` pas avec le robot actif, sans attendre l'affichage.
     * Sert aux captures d'écran et aux essais quand l'onglet est en arrière-plan.
     */
    advance(steps: number, stopOnChoice = true): string {
      if (!run) return 'aucune partie';
      const bot = idleInput();
      const tuto = run.tutorial !== null;
      for (let i = 0; i < steps; i++) {
        if (run.phase !== 'playing') {
          if (stopOnChoice) break;
          if (run.phase === 'levelup') takeCard(run, 0);
          else if (run.phase === 'chest') closeChest(run);
          else if (run.phase === 'forge') takeEvolution(run, 0);
          else if (run.phase === 'totem') takeFlame(run, 0);
          else if (run.phase === 'shop') {
            // En tutoriel, le robot achète la première carte qu'il peut payer : c'est la leçon.
            const pick = tuto ? shopItems(run).findIndex((item) => item.card !== null && canBuy(run!, item)) : -1;
            if (pick >= 0) buyItem(run, pick);
            closeShop(run);
          } else if (run.phase === 'find') closeFind(run);
          else if (run.phase === 'dialogue') advanceDialogue(run);
          else break;
          continue;
        }
        if (tuto) {
          bot.moveX = 0; bot.moveY = 0; bot.aimX = 0; bot.aimY = 0;
          bot.dash = false; bot.skill = false; bot.ultimate = false; bot.flask = false;
          tutorialBot(run, bot);
        } else {
          activeBot(run, bot);
        }
        stepRun(run, bot);
        for (let k = 0; k < run.evCount; k++) renderer.onEvent(run, run.evType[k]!, run.evX[k]!, run.evY[k]!, run.evA[k]!, run.evB[k]!, run.evC[k]!);
        clearEvents(run);
      }
      return `${run.phase} à ${run.time.toFixed(1)} s, niveau ${run.hero.level}, ${run.enemies.count} ennemis`;
    },
    /** Arrête la simulation (vrai) ou la relance (faux) ; l'image continue d'être dessinée. */
    hold(on: boolean): void {
      held = on;
    },
    /**
     * Amène le boss tout de suite : l'horloge de la partie saute à la fin, le directeur referme l'arène
     * et fait apparaître le boss au pas suivant, comme en jeu. Le boss est mis à 1 PV. Rend vrai s'il est là.
     */
    bossNow(): boolean {
      if (!run || run.tutorial || run.phase !== 'playing' || run.director.bossSpawned) return false;
      run.time = Math.max(run.time, run.data.tuning.durationMin * 60);
      stepRun(run, idleInput());
      processEvents(run);
      const e = run.enemies;
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] !== run.director.bossUid) continue;
        e.hp[i] = 1;
        // Un boss qui se reforme est pris déjà relevé : le prochain coup le fait tomber pour de bon.
        run.director.bossReformed = true;
        return true;
      }
      return false;
    },
  };
}

boot().catch((err) => {
  console.error(err);
  const fail = (window as unknown as { __braiseBootFail?: (text: string) => void }).__braiseBootFail;
  fail?.(String(err instanceof Error ? err.message : err));
});
