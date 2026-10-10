/**
 * Tiny synthesized sound effects — Web Audio only, no asset files.
 * The AudioContext is created lazily on the first user gesture (browsers
 * refuse to play sound before one) and every sound is throttled, so twenty
 * cards turning over at once read as one flourish instead of a wall of noise.
 */

export type Sound = 'draw' | 'success' | 'penalty' | 'cambio';

interface ToneOptions {
	type?: OscillatorType;
	/** Seconds from now. */
	at?: number;
	duration: number;
	gain: number;
	/** Glide to this frequency over the tone's duration. */
	slideTo?: number;
	attack?: number;
}

interface NoiseOptions {
	at?: number;
	duration: number;
	gain: number;
	filter: BiquadFilterType;
	frequency: number;
	/** Sweep the filter to this frequency over the duration. */
	sweepTo?: number;
	q?: number;
}

/** Minimum gap between two plays of the same sound (ms). */
const THROTTLE_MS: Partial<Record<Sound, number>> = { draw: 45 };

class Sfx {
	muted = $state(false);

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private noiseBuffer: AudioBuffer | null = null;
	private lastPlayed: Partial<Record<Sound, number>> = {};

	init() {
		try {
			this.muted = localStorage.getItem('cambio.muted') === '1';
		} catch {
			// storage blocked — sound stays on
		}
		window.addEventListener('pointerdown', () => this.context(), { once: true });
	}

	toggleMute() {
		this.muted = !this.muted;
		try {
			localStorage.setItem('cambio.muted', this.muted ? '1' : '0');
		} catch {
			// not remembered, but still applied
		}
	}

	play(sound: Sound) {
		if (this.muted) return;
		const now = performance.now();
		const gap = THROTTLE_MS[sound] ?? 120;
		if (now - (this.lastPlayed[sound] ?? -Infinity) < gap) return;
		this.lastPlayed[sound] = now;
		if (!this.context()) return;
		SOUNDS[sound](this);
	}

	private context(): AudioContext | null {
		if (typeof AudioContext === 'undefined') return null;
		if (!this.ctx) {
			this.ctx = new AudioContext();
			const compressor = this.ctx.createDynamicsCompressor();
			compressor.connect(this.ctx.destination);
			this.master = this.ctx.createGain();
			this.master.gain.value = 0.55;
			this.master.connect(compressor);
			// one second of white noise, reused by every noisy sound
			this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
			const data = this.noiseBuffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}

	tone(frequency: number, { type = 'sine', at = 0, duration, gain, slideTo, attack = 0.005 }: ToneOptions) {
		const ctx = this.ctx!;
		const start = ctx.currentTime + at;
		const osc = ctx.createOscillator();
		const env = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(frequency, start);
		if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
		env.gain.setValueAtTime(0.0001, start);
		env.gain.exponentialRampToValueAtTime(gain, start + attack);
		env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		osc.connect(env).connect(this.master!);
		osc.start(start);
		osc.stop(start + duration + 0.02);
	}

	noise({ at = 0, duration, gain, filter, frequency, sweepTo, q = 1 }: NoiseOptions) {
		const ctx = this.ctx!;
		const start = ctx.currentTime + at;
		const source = ctx.createBufferSource();
		source.buffer = this.noiseBuffer;
		const biquad = ctx.createBiquadFilter();
		biquad.type = filter;
		biquad.Q.value = q;
		biquad.frequency.setValueAtTime(frequency, start);
		if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
		const env = ctx.createGain();
		env.gain.setValueAtTime(gain, start);
		env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		source.connect(biquad).connect(env).connect(this.master!);
		source.start(start, Math.random() * 0.5);
		source.stop(start + duration + 0.02);
	}

	arpeggio(notes: number[], step: number, options: Omit<ToneOptions, 'at'>) {
		notes.forEach((note, i) => this.tone(note, { ...options, at: i * step }));
	}
}

const SOUNDS: Record<Sound, (s: Sfx) => void> = {
	// a card sliding off the pile
	draw: (s) =>
		s.noise({ duration: 0.14, gain: 0.35, filter: 'bandpass', frequency: 2400, sweepTo: 700, q: 0.8 }),
	// a correct flip
	success: (s) => s.arpeggio([523, 659, 784, 1047], 0.06, { type: 'square', duration: 0.12, gain: 0.06 }),
	// a wrong flip and its penalty card
	penalty: (s) => {
		s.tone(240, { type: 'sawtooth', duration: 0.3, gain: 0.1, slideTo: 90 });
		s.tone(120, { duration: 0.25, gain: 0.25, slideTo: 60 });
	},
	// the last-round bell, struck twice
	cambio: (s) => {
		for (const at of [0, 0.32]) {
			s.tone(784, { at, duration: 1.1, gain: 0.18 });
			s.tone(1568, { at, duration: 0.7, gain: 0.07 });
			s.tone(2350, { at, duration: 0.4, gain: 0.04 });
		}
	}
};

export const sfx = new Sfx();
