import '@fontsource/jersey-10/latin.css';
import '@fontsource/jersey-15/latin.css';
import '../ui/style.css';
import { FocusManager } from '@owl/kit/focus';
import { detectHost } from '@owl/kit/host';
import { InputManager } from '@owl/kit/input';
import { createSaveStore } from '@owl/kit/save';
import { render } from 'preact';
import { AudioManager } from '../audio/audio.ts';
import { introCinematic } from '../content/cinematic.ts';
import { loadGameData } from '../content/index.ts';
import { activeBot } from '../core/bots.ts';
import { banishCard, closeChest, readyEvolution, rerollCards, skipCards, takeCard } from '../core/levelup.ts';
import { computeResult } from '../core/rewards.ts';
import { abandonRun, clearEvents, createRun, idleInput, stepRun } from '../core/run.ts';
import { EV, PK_CHEST, PK_GEM, PK_GOLD, PK_RED_GEM, STEP, type Run } from '../core/types.ts';
import { buyAltarRank, refundAltar, setAltarBoostEnabled } from '../meta/altar.ts';
import { applyRunResult, buildSheet, unlockedContent } from '../meta/hero.ts';
import { MIGRATIONS, SAVE_VERSION, newHero, newSave, validateSave, type Save } from '../meta/save.ts';
import { CinematicPlayer } from '../render/cinematic.ts';
import { GameRenderer } from '../render/renderer.ts';
import { App } from '../ui/app.tsx';
import { focusRef } from '../ui/parts.tsx';
import {
  INTRO_SEEN, chest, cineCaption, cineCard, cineSkip, confirm, device, ending, holdProgress, hud, lastSeed, levelUp, notice, overlay, pauseReason,
  pauseStats, refs, save, saveRev, screen, t, type Actions, type HudState, type Screen,
} from '../ui/store.ts';

const CLASS = 'class.ash-blade';
const REGION = 'region.ash-woods';
const HOLD_MS = 500;
const SKIP_HOLD_MS = 600;

async function boot(): Promise<void> {
  const data = loadGameData();
  refs.data = data;
  const base = import.meta.env.BASE_URL;
  const host = detectHost('braise');
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
  refs.atlas = renderer.atlas;
  refs.atlasUrl = `${base}atlas/atlas.png`;

  const input = new InputManager(window);
  const focus = new FocusManager(uiRoot);
  focusRef.setScope = (el, key) => {
    // Le focus se pose après le rendu de l'écran, quand ses éléments existent.
    focus.setScope(el, key);
    requestAnimationFrame(() => focus.ensure());
  };
  const audio = new AudioManager();
  void audio.load(base);

  let run: Run | null = null;
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
  let saveTimer = 0;
  let frames = 0;
  let fps = 0;
  let fpsAt = 0;
  const stepInput = idleInput();
  /** La cinématique en cours, où aller après, et le maintien de B pour la passer. */
  let cine: CinematicPlayer | null = null;
  let cineAfter: 'camp' | 'title' = 'camp';
  let cineHoldMs = 0;
  let cinePaused = false;

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
    guard();
  }

  function say(text: string, ms = 2600): void {
    banner = text;
    bannerUntil = performance.now() + ms;
  }

  function syncLevelUp(): void {
    if (!run) return;
    levelUp.value = { level: run.hero.level - run.pendingLevels + 1, cards: run.cards.slice(), rerolls: run.hero.rerolls, banishes: run.hero.banishes, skipHold: 0 };
  }

  function finishRun(): void {
    if (!run) return;
    if (!run.outcome) run.outcome = run.phase === 'victory' ? 'victory' : 'death';
    const result = computeResult(run);
    const summary = applyRunResult(current, data, result);
    ending.value = { result, summary, stats: run.hero.stats };
    lastSeed.value = run.cfg.seed;
    changed();
    persist();
    audio.playMusic('music-camp');
    run = null;
    hud.value = null;
    levelUp.value = null;
    chest.value = null;
    paused = false;
    setScreen('end');
  }

  function setPaused(on: boolean, reason: string | null = null): void {
    if (!run || screen.value !== 'run') return;
    if (on && (overlay.value === 'levelup' || overlay.value === 'chest')) return;
    if (on === paused) return;
    paused = on;
    pauseReason.value = on ? reason : null;
    pauseStats.value = on ? { ...run.hero.stats } : null;
    overlay.value = on ? 'pause' : 'none';
    audio.duck(on);
    guard(200);
    if (on) persist();
  }

  function enterCamp(): void {
    current.heroes[CLASS] ??= newHero();
    current.activeHero = CLASS;
    audio.playMusic('music-camp');
    setScreen('camp');
  }

  /** Lance une cinématique. Pendant le chargement, l'écran reste noir. */
  function playIntro(after: 'camp' | 'title'): void {
    cineAfter = after;
    cineHoldMs = 0;
    cineSkip.value = 0;
    cineCard.value = null;
    cineCaption.value = null;
    audio.stopMusic();
    setScreen('cinematic');
    void CinematicPlayer.load(introCinematic(), import.meta.env.BASE_URL, {
      sfx: (name, volume) => audio.play(name, volume),
      music: (name) => audio.playMusic(name, false),
      stopMusic: () => audio.stopMusic(),
      musicRate: (to, over) => audio.setMusicRate(to, over),
      card: (key) => (cineCard.value = key),
      caption: (key) => (cineCaption.value = key),
    })
      .then((player) => {
        if (screen.value === 'cinematic') cine = player;
        else player.destroy();
      })
      .catch((err) => {
        // Une cinématique qui ne charge pas ne bloque pas le jeu.
        console.error('Cinématique impossible', err);
        endIntro();
      });
  }

  function endIntro(): void {
    cine?.destroy();
    cine = null;
    cineCard.value = null;
    cineCaption.value = null;
    cineSkip.value = 0;
    audio.stopMusic();
    if (!current.account.unlocks.includes(INTRO_SEEN)) {
      current.account.unlocks.push(INTRO_SEEN);
      changed();
      persist();
    }
    if (cineAfter === 'camp') enterCamp();
    else setScreen('title');
  }

  const actions: Actions = {
    start() {
      audio.unlock();
      audio.play('ui-confirm');
      // Le prologue se joue une fois, au tout premier départ d'une sauvegarde neuve (document 15 §1).
      const fresh = Object.keys(current.heroes).length === 0 && !current.account.unlocks.includes(INTRO_SEEN);
      if (fresh) playIntro('camp');
      else enterCamp();
    },
    prologue() {
      audio.unlock();
      audio.play('ui-confirm');
      playIntro('title');
    },
    goto(next) {
      audio.play(next === 'camp' ? 'ui-back' : 'ui-confirm', 0.7);
      if (next === 'camp') ending.value = null;
      setScreen(next);
    },
    depart(seed) {
      audio.unlock();
      const { sheet } = buildSheet(data, current, CLASS);
      const unlocked = unlockedContent(data, current);
      const chosen = seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
      run = createRun(data, {
        seed: chosen, regionId: REGION, classId: CLASS, vigil: 1, sheet,
        unlockedWeapons: unlocked.weapons, unlockedRelics: unlocked.relics, autoSkills: current.settings.autoSkills,
      });
      renderer.beginRun(run);
      paused = false;
      acc = 0;
      deadAt = 0;
      banner = null;
      ending.value = null;
      audio.play('ui-confirm');
      audio.playMusic(run.region.music.calm);
      setScreen('run');
      say(t('hud.hint.move'), 4500);
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
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
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
      audio.play(`ui-${name}`, 0.6);
    },
  };
  refs.actions = actions;
  focus.onMove = () => audio.play('ui-move', 0.5, 1, 40);
  applySettings();

  // Mise à l'échelle entière de l'image native, avec des bandes noires si l'écran n'est pas en 16:9.
  function layout(): void {
    const k = Math.min(window.innerWidth / 640, window.innerHeight / 360);
    const scale = k >= 1 ? Math.floor(k) : k;
    document.documentElement.style.setProperty('--scale', String(scale));
    stage.classList.toggle('smooth', k < 1);
    (document.getElementById('small-hint') as HTMLElement).hidden = k >= 1;
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
          else if (a !== PK_CHEST) audio.play('coin', 0.5, 0.8, 60);
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
          audio.play('boss', 1);
          audio.playMusic(r.region.music.boss);
          say(t('hud.bossComing'), 3500);
          break;
        case EV.bossPhase: if (a > 1) audio.play('boss', 0.8, 1.15); break;
        case EV.bossDeath:
          audio.play('victory', 1);
          audio.playMusic(r.region.music.calm);
          say(t('hud.portal'), 6000);
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
        case EV.poiStart: say(t('hud.brazier'), 3200); break;
        case EV.poiDone:
          audio.play('buy', 0.8);
          say(a === 0 ? t('hud.brazierLit') : a === 1 ? t('hud.spring') : t('hud.cache'));
          break;
        case EV.flameCall: say(t('hud.flameCall')); break;
        case EV.telegraphHit: audio.play('hammer', 0.5, 1.3, 100); break;
        case EV.charge: audio.play('dash', 0.6, 0.6); break;
      }
    }
    clearEvents(r);
  }

  function buildHud(r: Run, now: number): HudState {
    const h = r.hero;
    const tuning = r.data.tuning;
    let boss: HudState['boss'] = null;
    if (r.director.bossSpawned && !r.director.bossDead) {
      const e = r.enemies;
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] === r.director.bossUid) {
          boss = { name: t(`${r.data.enemies[e.kind[i]!]!.id}.name`), frac: Math.max(0, e.hp[i]! / e.maxHp[i]!), phase: r.director.bossPhase };
        }
      }
    }
    const ready = readyEvolution(r);
    const minutes = r.time / 60;
    return {
      hp: h.hp, maxHp: h.stats.maxHp, level: h.level, xp: h.xp, xpNext: h.xpNext, time: r.time, boss,
      flasks: h.flasks, maxFlasks: h.stats.flasks, gold: h.gold,
      ashes: Math.round(tuning.ashes.perMinute * minutes + h.ashDrops), kills: h.kills, vigil: r.cfg.vigil,
      weapons: r.weapons.map((w) => {
        const def = r.data.weapons[w.def]!;
        const evolvable = !def.evolved && w.level >= def.levels.length && r.relics.some((x) => x.def === def.relic);
        return { icon: def.icon, level: def.evolved ? 6 : w.level, max: 6, ready: evolvable || w === ready };
      }),
      relics: r.relics.map((x) => ({ icon: r.data.relics[x.def]!.icon, level: x.level, max: r.data.relics[x.def]!.maxLevel })),
      skillFrac: 1 - Math.max(0, h.skillCd) / r.cls.skill.cooldown,
      ultFrac: h.ultT > 0 ? h.ultT / r.cls.ultimate.duration : h.ultGauge / tuning.ultimate.gaugeMax,
      ultActive: h.ultT > 0,
      dashFrac: 1 - Math.max(0, h.dashCd) / tuning.dash.cooldown,
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
    ctx.fillStyle = '#2c3e5c';
    const b = r.data.tuning.borderTiles * r.map.tile * k;
    ctx.fillRect(0, 0, 48, b); ctx.fillRect(0, 48 - b, 48, b); ctx.fillRect(0, 0, b, 48); ctx.fillRect(48 - b, 0, b, 48);
    for (const poi of r.map.pois) {
      if (!poi.discovered) continue;
      ctx.fillStyle = poi.state === 2 ? '#454a5c' : poi.kind === 'spring' ? '#4fe0c8' : poi.kind === 'portal' ? '#fff1c2' : '#ffb020';
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
      // Passer tout : B maintenu (un appui court ne fait rien). A passe à l'image suivante.
      const hold = introCinematic().skipHoldMs;
      if (f.held.back && now >= guardUntil) cineHoldMs += dt;
      else cineHoldMs = 0;
      const k = Math.min(1, cineHoldMs / hold);
      if (k !== cineSkip.value) cineSkip.value = k;
      if (cine && !cinePaused && f.pressed.confirm && now >= guardUntil) cine.next();
      if (cine && !cinePaused) cine.update(dt);
      if (cine) renderer.app.renderer.render(cine.root);
      if (cineHoldMs >= hold || cine?.finished) endIntro();
      requestAnimationFrame(frame);
      return;
    }

    if (playing && run && overlay.value === 'none' && !paused) {
      if (f.pressed.pause && now >= guardUntil) setPaused(true);
      if (f.pressed.skill) pendSkill = true;
      if (f.pressed.ultimate) pendUlt = true;
      if (f.pressed.flask) pendFlask = true;
    } else {
      handleMenus(now, dt);
    }

    if (playing && run) {
      const r = run;
      if (!paused && r.phase === 'playing') {
        acc += dt;
        let steps = 0;
        const stepMs = STEP * 1000;
        while (acc >= stepMs && steps < 5 && r.phase === 'playing') {
          stepInput.moveX = f.moveX;
          stepInput.moveY = f.moveY;
          stepInput.aimX = f.aimX;
          stepInput.aimY = f.aimY;
          stepInput.dash = f.held.dash && now >= guardUntil;
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

      // La simulation attend un choix : l'écran correspondant s'ouvre, avec sa garde.
      if (r.phase === 'levelup' && overlay.value !== 'levelup') {
        syncLevelUp();
        overlay.value = 'levelup';
        guard(350);
      } else if (r.phase === 'chest' && overlay.value !== 'chest') {
        chest.value = r.chest;
        overlay.value = 'chest';
        audio.play('chest', 0.9);
        guard(350);
      } else if (r.phase === 'playing' && (overlay.value === 'levelup' || overlay.value === 'chest')) {
        overlay.value = 'none';
        levelUp.value = null;
        chest.value = null;
        guard(150);
      }

      renderer.drawRun(r, r.phase === 'playing' && !paused ? acc / (STEP * 1000) : 1, dt);
      if (now - hudAt > 80) {
        hudAt = now;
        hud.value = buildHud(r, now);
      }
      if (now - mapAt > 250) {
        mapAt = now;
        drawMinimap(r);
      }
      if (r.phase === 'victory') {
        finishRun();
      } else if (r.phase === 'dead') {
        // La lueur rétrécit jusqu'à un point avant l'écran de fin.
        if (deadAt === 0) deadAt = now;
        if (now - deadAt > 1700 || r.outcome === 'abandon') finishRun();
      }
    } else {
      const lit = current.account.regions[REGION]?.lit ?? false;
      renderer.drawCamp(now, lit, data.classes[CLASS]!.sprite);
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
    actions,
    input,
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
      for (let i = 0; i < steps; i++) {
        if (run.phase !== 'playing') {
          if (stopOnChoice) break;
          if (run.phase === 'levelup') takeCard(run, 0);
          else if (run.phase === 'chest') closeChest(run);
          else break;
          continue;
        }
        activeBot(run, bot);
        stepRun(run, bot);
        for (let k = 0; k < run.evCount; k++) renderer.onEvent(run, run.evType[k]!, run.evX[k]!, run.evY[k]!, run.evA[k]!, run.evB[k]!, run.evC[k]!);
        clearEvents(run);
      }
      return `${run.phase} à ${run.time.toFixed(1)} s, niveau ${run.hero.level}, ${run.enemies.count} ennemis`;
    },
  };
}

boot().catch((err) => {
  console.error(err);
  const ui = document.getElementById('ui');
  if (ui) ui.textContent = `Erreur au démarrage : ${String(err instanceof Error ? err.message : err)}`;
});
