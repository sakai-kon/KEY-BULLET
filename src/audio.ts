type SoundName = 'type' | 'shot' | 'hit' | 'graze' | 'bomb' | 'clear' | 'error';

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private muted = false;
  private phase: 'typing' | 'bullet' = 'typing';
  private step = 0;

  get isMuted(): boolean { return this.muted; }

  async start(phase: 'typing' | 'bullet' = 'typing'): Promise<void> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.12;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.setPhase(phase);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.12, this.context.currentTime, 0.03);
    }
  }

  setPhase(phase: 'typing' | 'bullet'): void {
    this.phase = phase;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    if (!this.context || !this.master) return;
    this.step = 0;
    const interval = phase === 'typing' ? 260 : 155;
    this.musicTimer = window.setInterval(() => this.playMusicStep(), interval);
  }

  play(name: SoundName): void {
    if (!this.context || !this.master || this.muted) return;
    const patterns: Record<SoundName, { f: number; d: number; type?: OscillatorType; volume?: number }> = {
      type: { f: 820, d: 0.045, volume: 0.15 },
      shot: { f: 440, d: 0.09, type: 'square', volume: 0.18 },
      hit: { f: 130, d: 0.16, type: 'sawtooth', volume: 0.22 },
      graze: { f: 1150, d: 0.035, volume: 0.08 },
      bomb: { f: 82, d: 0.42, type: 'sawtooth', volume: 0.28 },
      clear: { f: 880, d: 0.3, volume: 0.2 },
      error: { f: 190, d: 0.07, type: 'square', volume: 0.12 },
    };
    const p = patterns[name];
    this.tone(p.f, p.d, p.type ?? 'square', p.volume ?? 0.15);
    if (name === 'clear') window.setTimeout(() => this.tone(1320, 0.38, 'square', 0.18), 120);
    if (name === 'bomb') window.setTimeout(() => this.tone(55, 0.35, 'sawtooth', 0.2), 90);
  }

  destroy(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private playMusicStep(): void {
    if (!this.context || !this.master || this.muted) return;
    const typing = [220, 277, 330, 392, 330, 277, 247, 330];
    const bullet = [110, 165, 196, 220, 165, 147, 196, 247, 220, 165, 147, 123];
    const notes = this.phase === 'typing' ? typing : bullet;
    const f = notes[this.step % notes.length] ?? 220;
    this.tone(f, this.phase === 'typing' ? 0.14 : 0.11, 'square', this.phase === 'typing' ? 0.07 : 0.09);
    if (this.phase === 'bullet' && this.step % 3 === 0) this.tone(f / 2, 0.13, 'triangle', 0.07);
    this.step++;
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
