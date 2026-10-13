// 音效與音樂（規格 6.9，P1）：Web Audio。
// - 音效：Kenney CC0 取樣（sounds.ts），依事件播放。
// - 環境音：程式合成（風聲、晴朗時的鳥叫、迷霧裡低沉的嗡鳴、湖邊的水聲），音量隨所在位置與迷霧變化。
// - 音樂：程式產生的輕柔曲子；迷霧越濃，濾波越暗、和弦轉為小調（規格：晴朗 / 迷霧各版或濾波）。
// AudioContext 需要使用者操作後才能發聲，第一次按鍵或點擊時才建立。
import { sounds, type SoundId } from './sounds';

export type Volumes = { master: number; music: number; sfx: number };

/** 環境音各層的目標音量（0–1），由 AudioSystem 每幀依場景計算 */
export type AmbienceMix = { wind: number; birds: number; drone: number; water: number };

const C_MAJOR = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
const A_MINOR = [
  [57, 60, 64],
  [53, 57, 60],
  [50, 53, 57],
  [52, 56, 59],
];
const PENTATONIC = [72, 74, 76, 79, 81, 84];
const BEAT = 60 / 80;

function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private layers: { wind: GainNode; drone: GainNode; water: GainNode } | null = null;
  private birdsLevel = 0;
  private mist = 0;
  private musicOn = false;
  private nextBar = 0;
  private bar = 0;
  private schedulerTimer: number | null = null;
  private melodyNote = 2;
  /** 測試與除錯：各音效播放次數 */
  readonly played: Partial<Record<SoundId, number>> = {};

  /** 第一次使用者操作時呼叫 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 6000;
    this.music = ctx.createGain();
    this.music.connect(this.musicFilter).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.connect(this.master);
    this.applyVolumes();
    this.layers = this.createAmbienceLayers(ctx);
    // 預先載入常用音效，第一次播放不會延遲
    for (const s of Object.values(sounds)) for (const f of s.files) void this.load(f);
  }

  get state(): string {
    return this.ctx?.state ?? 'locked';
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambience.gain.setTargetAtTime(this.volumes.sfx * 0.6, t, 0.05);
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx;
      p = fetch(`${import.meta.env.BASE_URL}${url}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => (ctx ? ctx.decodeAudioData(data) : null))
        .catch((err: unknown) => {
          // 缺少音效檔不影響遊戲，記錄後略過（規格：缺資產要有明確的錯誤處理與後備）
          console.error(`[audio] 無法載入 ${url}：`, err);
          return null;
        });
      this.buffers.set(url, p);
    }
    return p;
  }

  /** 播放音效；volume 為額外倍率（例如依距離衰減） */
  play(id: SoundId, volume = 1): void {
    this.played[id] = (this.played[id] ?? 0) + 1;
    const ctx = this.ctx;
    if (!ctx || volume <= 0.01) return;
    const def = sounds[id];
    const file = def.files[Math.floor(Math.random() * def.files.length)]!;
    void this.load(file).then((buffer) => {
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const [lo, hi] = def.rate ?? [1, 1];
      src.playbackRate.value = lo + Math.random() * (hi - lo);
      const gain = ctx.createGain();
      gain.gain.value = def.volume * volume;
      src.connect(gain).connect(this.sfx);
      src.start();
    });
  }

  /** 程式合成的短音（星光衝擊的閃亮聲、露米出現） */
  sparkle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 4, 7, 12].forEach((step, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToHz(84 + step);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.05);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.05 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.5);
      osc.connect(g).connect(this.sfx);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.55);
    });
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private createAmbienceLayers(ctx: AudioContext) {
    const noise = this.noiseBuffer(ctx);
    const loop = () => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.start();
      return src;
    };
    // 風：帶通雜訊，濾波頻率緩慢漂移
    const wind = ctx.createGain();
    wind.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.07;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 250;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();
    loop().connect(windFilter).connect(wind).connect(this.ambience);
    // 迷霧的嗡鳴：兩個略微失諧的低音 + 低通雜訊
    const drone = ctx.createGain();
    drone.gain.value = 0;
    for (const f of [55, 55.7, 82.4]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g).connect(drone);
      osc.start();
    }
    const droneNoise = ctx.createBiquadFilter();
    droneNoise.type = 'lowpass';
    droneNoise.frequency.value = 220;
    const droneNoiseGain = ctx.createGain();
    droneNoiseGain.gain.value = 0.5;
    loop().connect(droneNoise).connect(droneNoiseGain).connect(drone);
    drone.connect(this.ambience);
    // 水聲：低通雜訊，振幅緩慢起伏（拍岸）
    const water = ctx.createGain();
    water.gain.value = 0;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.value = 700;
    const waterSwell = ctx.createGain();
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.25;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.35;
    swellLfo.connect(swellDepth).connect(waterSwell.gain);
    waterSwell.gain.value = 0.65;
    swellLfo.start();
    loop().connect(waterFilter).connect(waterSwell).connect(water).connect(this.ambience);
    return { wind, drone, water };
  }

  /** 每幀由 AudioSystem 呼叫：調整環境音各層、迷霧對音樂的影響、偶爾的鳥叫 */
  update(mix: AmbienceMix, mist: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.layers) return;
    const t = ctx.currentTime;
    this.layers.wind.gain.setTargetAtTime(mix.wind * 0.22, t, 0.6);
    this.layers.drone.gain.setTargetAtTime(mix.drone * 0.35, t, 0.8);
    this.layers.water.gain.setTargetAtTime(mix.water * 0.3, t, 0.6);
    this.mist = mist;
    this.musicFilter.frequency.setTargetAtTime(6000 * (1 - mist) + 900 * mist, t, 0.8);
    this.birdsLevel = mix.birds;
    if (mix.birds > 0.05 && Math.random() < dt * 0.35 * mix.birds) this.chirp(mix.birds);
  }

  /** 程式合成的鳥叫：快速上下滑的短音 2–4 聲 */
  private chirp(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 2400 + Math.random() * 1600;
    const count = 2 + Math.floor(Math.random() * 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambience);
    for (let i = 0; i < count; i++) {
      const start = t + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), start + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, start + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.05 * level, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(g).connect(pan);
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  get birds(): number {
    return this.birdsLevel;
  }

  setMusicPlaying(on: boolean): void {
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (!this.ctx) return;
    if (on && this.schedulerTimer === null) {
      this.nextBar = this.ctx.currentTime + 0.2;
      this.schedulerTimer = window.setInterval(() => this.schedule(), 250);
    }
    this.music.gain.setTargetAtTime(on ? this.volumes.music * 0.55 : 0, this.ctx.currentTime, 0.8);
  }

  get musicPlaying(): boolean {
    return this.musicOn;
  }

  /** 預先排好下一小節（四拍）：和弦墊音、低音、五聲音階的旋律 */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    while (this.nextBar < ctx.currentTime + 1.2) {
      const progression = this.mist > 0.55 ? A_MINOR : C_MAJOR;
      const chord = progression[Math.floor(this.bar / 2) % progression.length]!;
      const start = this.nextBar;
      const len = BEAT * 4;
      for (const note of chord) this.tone(midiToHz(note), start, len, 'sine', 0.05, 0.6, 0.8);
      this.tone(midiToHz(chord[0]! - 12), start, len, 'triangle', 0.07, 0.05, 0.6);
      for (let b = 0; b < 8; b++) {
        if (Math.random() > 0.55) continue;
        this.melodyNote = Math.max(0, Math.min(PENTATONIC.length - 1, this.melodyNote + Math.floor(Math.random() * 3) - 1));
        const note = PENTATONIC[this.melodyNote]! - (this.mist > 0.55 ? 3 : 0);
        this.tone(midiToHz(note), start + (b * BEAT) / 2, BEAT * 0.9, 'triangle', 0.045, 0.005, 0.5);
      }
      this.nextBar += len;
      this.bar += 1;
    }
  }

  private tone(freq: number, start: number, length: number, type: OscillatorType, peak: number, attack: number, release: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.setTargetAtTime(0, start + length - release * 0.5, release / 3);
    osc.connect(g).connect(this.music);
    osc.start(start);
    osc.stop(start + length + release);
  }
}

export const audio = new AudioEngine();

/** 第一次使用者操作時建立 AudioContext（瀏覽器的自動播放限制） */
export function installAudioUnlock(): void {
  const unlock = () => audio.unlock();
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('pointerdown', unlock, true);
}
