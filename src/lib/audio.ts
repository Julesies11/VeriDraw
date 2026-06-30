class AudioManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem('vd_muted') === 'true';
    }
  }

  public getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    return this.ctx;
  }

  public resume(): void {
    const context = this.getContext();
    if (context && context.state === 'suspended') {
      context.resume().catch((err) => console.warn('Failed to resume AudioContext:', err));
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    localStorage.setItem('vd_muted', val ? 'true' : 'false');
  }

  public playTick(speedPercentage: number = 0.5): void {
    if (this.muted) return;
    const context = this.getContext();
    if (!context) return;
    this.resume();

    try {
      const now = context.currentTime;

      // 1. Oscillator click
      const osc = context.createOscillator();
      const gainOsc = context.createGain();

      osc.connect(gainOsc);
      gainOsc.connect(context.destination);

      osc.type = 'triangle';
      
      // Dynamic frequency based on speed
      const baseFreq = 300 + (300 * speedPercentage); // 300Hz to 600Hz
      const endFreq = 80 + (70 * speedPercentage);   // 80Hz to 150Hz
      const duration = 0.02 + (0.02 * speedPercentage); // 20ms to 40ms

      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

      const maxGain = 0.04 + (0.04 * speedPercentage); // 0.04 to 0.08
      gainOsc.gain.setValueAtTime(maxGain, now);
      gainOsc.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);

      // 2. High-pass noise click for mechanical snap sound
      const bufferSize = context.sampleRate * 0.01; // 10ms of noise
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSource = context.createBufferSource();
      noiseSource.buffer = buffer;

      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(1500, now);

      const gainNoise = context.createGain();
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(gainNoise);
      gainNoise.connect(context.destination);

      const noiseGain = 0.01 + (0.02 * speedPercentage); // 0.01 to 0.03
      gainNoise.gain.setValueAtTime(noiseGain, now);
      gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

      noiseSource.start(now);
      noiseSource.stop(now + 0.01);

    } catch (err) {
      console.warn('Audio click error:', err);
    }
  }

  public playWin(): void {
    if (this.muted) return;
    const context = this.getContext();
    if (!context) return;
    this.resume();

    try {
      const now = context.currentTime;
      
      // Sequence of notes in a sparkly chime arpeggio: C5, E5, G5, C6, E6, G6
      const notes = [
        { freq: 523.25, time: 0 },      // C5
        { freq: 659.25, time: 0.10 },   // E5
        { freq: 783.99, time: 0.20 },   // G5
        { freq: 1046.50, time: 0.30 },  // C6
        { freq: 1318.51, time: 0.40 },  // E6
        { freq: 1567.98, time: 0.50 }   // G6
      ];

      notes.forEach((note) => {
        const osc = context.createOscillator();
        const gainNode = context.createGain();

        osc.connect(gainNode);
        gainNode.connect(context.destination);

        // Sine wave is pure and bell-like
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        // Bell envelope: instant attack, long exponential decay
        const playTime = now + note.time;
        gainNode.gain.setValueAtTime(0, playTime);
        gainNode.gain.linearRampToValueAtTime(0.12, playTime + 0.02); // 20ms attack
        gainNode.gain.setValueAtTime(0.12, playTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + 0.8); // 800ms decay

        osc.start(playTime);
        osc.stop(playTime + 0.85);
      });

    } catch (err) {
      console.warn('Audio victory play error:', err);
    }
  }
}

export const audioManager = new AudioManager();
