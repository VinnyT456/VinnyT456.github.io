export type WorldSoundscape = {
  setEnabled(enabled: boolean): void;
  cue(kind: 'car' | 'takeoff' | 'landing'): void;
  dispose(): void;
};

type AudioContextConstructor = new () => AudioContext;

/** A small, opt-in sound bed for the voxel town. Audio is created only on enable. */
export function createWorldSoundscape(): WorldSoundscape {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  const activeNodes = new Set<AudioNode>();

  function remember<T extends AudioNode>(node: T): T {
    activeNodes.add(node);
    return node;
  }

  function forget(node: AudioNode) {
    activeNodes.delete(node);
    try { node.disconnect(); } catch { /* already disconnected */ }
  }

  function makeContext() {
    if (context && master) return;
    const AudioContextClass = (globalThis as typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    }).AudioContext ?? (globalThis as typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable in this browser.');

    let created: AudioContext | null = null;
    try {
      created = new AudioContextClass();
      const bus = created.createGain();
      bus.gain.value = 0;
      bus.connect(created.destination);

      // Soft, slowly modulated filtered noise suggests distant air without masking the scene.
      const length = Math.max(1, Math.floor(created.sampleRate * 3));
      const buffer = created.createBuffer(1, length, created.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
      const noise = created.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = created.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      filter.Q.value = 0.35;
      const wind = created.createGain();
      wind.gain.value = 0.12;
      noise.connect(filter);
      filter.connect(wind);
      wind.connect(bus);
      noise.start();

      context = created;
      master = bus;
      remember(bus);
      remember(noise);
      remember(filter);
      remember(wind);
    } catch (error) {
      if (created) {
        try { void created.close(); } catch { /* best-effort cleanup */ }
      }
      context = null;
      master = null;
      activeNodes.clear();
      throw error;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    for (const node of activeNodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    activeNodes.clear();
    const oldContext = context;
    context = null;
    master = null;
    if (oldContext) {
      try { void oldContext.close(); } catch { /* best-effort cleanup */ }
    }
  }

  function setEnabled(next: boolean) {
    if (disposed || next === enabled) return;
    if (!next) {
      enabled = false;
      if (context && master) {
        const now = context.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0, now, 0.045);
        if (suspendTimer !== null) clearTimeout(suspendTimer);
        suspendTimer = setTimeout(() => {
          suspendTimer = null;
          if (!enabled && context?.state === 'running') void context.suspend().catch(() => undefined);
        }, 180);
      }
      return;
    }

    makeContext();
    enabled = true;
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    const current = context!;
    const bus = master!;
    // resume() is invoked directly in the caller's gesture stack.
    void current.resume().then(() => {
      if (disposed || !enabled || context !== current) return;
      const now = current.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.min(bus.gain.value, 0.16), now);
      bus.gain.linearRampToValueAtTime(0.16, now + 0.7);
    }).catch(() => {
      // A later explicit enable may retry if the browser rejected resuming.
    });
  }

  function cue(kind: 'car' | 'takeoff' | 'landing') {
    if (!enabled || disposed || !context || !master || context.state !== 'running') return;
    const ctx = context;
    const now = ctx.currentTime;
    const oscillator = remember(ctx.createOscillator());
    const tone = remember(ctx.createGain());
    const filter = remember(ctx.createBiquadFilter());
    filter.type = 'lowpass';
    oscillator.connect(filter);
    filter.connect(tone);
    tone.connect(master);

    const configs = {
      car: { from: 92, to: 148, duration: 0.72, peak: 0.17, cutoff: 420 },
      takeoff: { from: 115, to: 520, duration: 1.55, peak: 0.11, cutoff: 780 },
      landing: { from: 410, to: 82, duration: 1.2, peak: 0.12, cutoff: 620 },
    } as const;
    const sound = configs[kind];
    oscillator.type = kind === 'car' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(sound.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(sound.to, now + sound.duration);
    filter.frequency.setValueAtTime(sound.cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, sound.cutoff * 0.55), now + sound.duration);
    tone.gain.setValueAtTime(0.0001, now);
    tone.gain.linearRampToValueAtTime(sound.peak, now + 0.08);
    tone.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration);
    oscillator.onended = () => {
      forget(oscillator);
      forget(filter);
      forget(tone);
    };
    oscillator.start(now);
    oscillator.stop(now + sound.duration + 0.03);
  }

  return { setEnabled, cue, dispose };
}
