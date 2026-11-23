/**
 * Le son : WebAudio. Effets décodés au chargement, musique lue en flux.
 * Rien ne démarre avant un premier geste du joueur (règle des navigateurs).
 */

const MAX_PER_SOUND = 4;
const MAX_VOICES = 24;

interface Voice {
  name: string;
  source: AudioBufferSourceNode;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly voices: Voice[] = [];
  private readonly lastPlayed = new Map<string, number>();
  private files: Record<string, string> = {};
  private base = './';
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private music: HTMLAudioElement | null = null;
  private musicName = '';
  private wantedMusic = '';
  private gemChain = 0;
  private gemLast = 0;
  private rateTimer = 0;

  /** Charge la liste des sons (public/audio/index.json) et télécharge les effets. */
  async load(base: string): Promise<void> {
    this.base = base;
    try {
      const res = await fetch(`${base}audio/index.json`);
      if (!res.ok) return;
      this.files = (await res.json()) as Record<string, string>;
    } catch {
      return;
    }
    await Promise.all(
      Object.entries(this.files)
        .filter(([name]) => name.startsWith('sfx-'))
        .map(async ([name, file]) => {
          try {
            const buf = await (await fetch(`${base}audio/${file}`)).arrayBuffer();
            this.raw.set(name, buf);
            if (this.ctx) await this.decode(name);
          } catch {
            /* un son manquant ne bloque pas le jeu */
          }
        }),
    );
  }

  private async decode(name: string): Promise<void> {
    const raw = this.raw.get(name);
    if (!raw || !this.ctx || this.buffers.has(name)) return;
    try {
      this.buffers.set(name, await this.ctx.decodeAudioData(raw.slice(0)));
    } catch {
      /* format non lu par ce navigateur */
    }
  }

  /** À appeler sur le premier geste : crée le contexte audio et décode les effets. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      for (const name of this.raw.keys()) void this.decode(name);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxGain.gain.value = this.volumes.sfx;
    this.musicGain.gain.value = this.volumes.music;
    if (this.music) this.music.volume = Math.min(1, this.volumes.master * this.volumes.music);
  }

  /**
   * Joue un effet. Un effet répété change de hauteur de quelques pour cent,
   * et au plus quatre instances du même effet sonnent en même temps.
   */
  play(name: string, volume = 1, rate = 1, minGapMs = 0): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(`sfx-${name}`);
    if (!ctx || !buffer || ctx.state !== 'running') return;
    const now = ctx.currentTime * 1000;
    if (minGapMs > 0 && now - (this.lastPlayed.get(name) ?? -1e9) < minGapMs) return;
    this.lastPlayed.set(name, now);
    let same = 0;
    for (const v of this.voices) if (v.name === name) same++;
    if (same >= MAX_PER_SOUND || this.voices.length >= MAX_VOICES) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.sfxGain);
    const voice: Voice = { name, source };
    this.voices.push(voice);
    source.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    source.start();
  }

  /** La collecte de gemmes : une note qui monte quand les collectes s'enchaînent en moins de 0,3 s. */
  gem(): void {
    const now = performance.now();
    this.gemChain = now - this.gemLast < 300 ? Math.min(12, this.gemChain + 1) : 0;
    this.gemLast = now;
    this.play('gem', 0.45, Math.pow(2, this.gemChain / 12), 35);
  }

  /** Lance une musique, en boucle par défaut, avec un fondu depuis la précédente. */
  playMusic(name: string, loop = true): void {
    this.wantedMusic = name;
    if (!this.ctx || this.musicName === name) return;
    const file = this.files[name];
    this.fadeOutMusic();
    this.musicName = name;
    if (!file) return;
    const el = new Audio(`${this.base}audio/${file}`);
    el.loop = loop;
    el.preservesPitch = false;
    el.volume = Math.min(1, this.volumes.master * this.volumes.music);
    void el.play().catch(() => {
      this.musicName = '';
    });
    this.music = el;
  }

  private fadeOutMusic(): void {
    const old = this.music;
    window.clearInterval(this.rateTimer);
    if (old) {
      const step = (): void => {
        old.volume = Math.max(0, old.volume - 0.05);
        if (old.volume > 0.01) setTimeout(step, 40);
        else old.pause();
      };
      step();
    }
    this.music = null;
  }

  /** Arrête la musique en fondu. */
  stopMusic(): void {
    this.wantedMusic = '';
    this.musicName = '';
    this.fadeOutMusic();
  }

  /**
   * Change la vitesse de la musique en cours, progressivement, en `overSeconds` secondes.
   * La hauteur suit : une boîte à musique qui ralentit se désaccorde (document 15, plan 4).
   */
  setMusicRate(to: number, overSeconds: number): void {
    const el = this.music;
    window.clearInterval(this.rateTimer);
    if (!el) return;
    const from = el.playbackRate;
    const steps = Math.max(1, Math.round(overSeconds * 20));
    let i = 0;
    this.rateTimer = window.setInterval(() => {
      i++;
      el.playbackRate = from + (to - from) * (i / steps);
      if (i >= steps) window.clearInterval(this.rateTimer);
    }, 50);
  }

  /** Met la musique en sourdine pendant une pause. */
  duck(on: boolean): void {
    if (this.music) this.music.volume = Math.min(1, this.volumes.master * this.volumes.music) * (on ? 0.35 : 1);
  }

  /** Arrête ou reprend tout le son (arrière-plan). */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) {
      void this.ctx.suspend();
      this.music?.pause();
    } else {
      void this.ctx.resume();
      void this.music?.play().catch(() => undefined);
    }
  }
}
