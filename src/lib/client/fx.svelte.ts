import type { CardMove, GameView } from '$lib/shared/types';
import { cardLocations } from './locations';
import { sfx } from './sfx.svelte';

/** What a moving card means when it lands — drives the landing effect. */
export type Impact = 'flip' | 'penalty' | 'shuffle' | null;

export interface Banner {
	id: number;
	title: string;
	subtitle?: string;
	tone: 'gold' | 'danger' | 'primary';
}

export interface Burst {
	id: number;
	x: number;
	y: number;
}

const reducedMotion = () =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Game "juice": sounds, banners, sparks and shakes. Everything here is purely
 * cosmetic and derived from what the server already tells us — the game client
 * reports moves and state changes, this decides how they should feel.
 */
class Effects {
	banner = $state<Banner | null>(null);
	bursts = $state<Burst[]>([]);

	private seq = 0;
	private bannerTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Classify a batch of moves. A hand card going to the discard without a drawn
	 * card taking its place is a correct flip; a card dealt from the deck straight
	 * into a hand is a penalty for a wrong one.
	 */
	impactsOf(moves: CardMove[]): Impact[] {
		const replaced = moves.some((m) => m.from === 'drawn' && typeof m.to === 'object');
		return moves.map((m) => {
			if (m.from === 'discard' && m.to === 'deck') return 'shuffle';
			if (m.from === 'deck' && typeof m.to === 'object') return 'penalty';
			if (typeof m.from === 'object' && m.to === 'discard' && !replaced) return 'flip';
			return null;
		});
	}

	/** A card left its spot — drawing one makes the only everyday sound. */
	launch(move: CardMove) {
		if (move.to === 'drawn') sfx.play('draw');
	}

	/** A flying card arrived at the location `key`. */
	land(key: string, impact: Impact) {
		const el = cardLocations.get(key);
		if (impact === 'flip') {
			sfx.play('success');
			const rect = el?.getBoundingClientRect();
			if (rect) this.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
		} else if (impact === 'penalty') {
			sfx.play('penalty');
			this.shake(el?.closest<HTMLElement>('[data-seat]') ?? el);
		} else if (impact === 'shuffle' && el && !reducedMotion()) {
			// the deck takes each returning card with a little bump
			el.animate([{ scale: '1' }, { scale: '1.06' }, { scale: '1' }], { duration: 180, easing: 'ease-out' });
		}
	}

	/** React to what changed between two consecutive states. */
	stateChanged(prev: GameView | null, next: GameView) {
		if (!prev) return;
		const name = (id: string | null) => next.players.find((p) => p.id === id)?.name ?? '';

		if (next.cambioCallerId && !prev.cambioCallerId) {
			sfx.play('cambio');
			const self = next.cambioCallerId === next.selfId;
			this.showBanner({
				title: 'Cambio!',
				subtitle: self ? 'Everyone else gets one last turn' : `${name(next.cambioCallerId)} rang the bell — last round`,
				tone: 'danger'
			});
		}

		if (next.phase === 'finished' && prev.phase !== 'finished') {
			const won = next.winnerIds?.includes(next.selfId) ?? false;
			const winners = (next.winnerIds ?? []).map(name).join(' & ');
			this.showBanner(
				won
					? { title: 'You win!', subtitle: 'Lowest hand at the table', tone: 'gold' }
					: { title: `${winners} wins`, subtitle: 'Better luck next round', tone: 'primary' }
			);
			if (won) this.confetti();
		}
	}

	error() {
		this.shake(document.querySelector<HTMLElement>('[data-status]'));
	}

	private showBanner(banner: Omit<Banner, 'id'>) {
		clearTimeout(this.bannerTimer);
		this.banner = { ...banner, id: ++this.seq };
		this.bannerTimer = setTimeout(() => (this.banner = null), 2200);
	}

	private burst(x: number, y: number) {
		const id = ++this.seq;
		this.bursts.push({ id, x, y });
		setTimeout(() => (this.bursts = this.bursts.filter((b) => b.id !== id)), 900);
	}

	private confetti() {
		for (let i = 0; i < 5; i++) {
			setTimeout(() => this.burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.2 + Math.random() * 0.4)), i * 140);
		}
	}

	private shake(el: HTMLElement | null | undefined) {
		if (!el || reducedMotion()) return;
		el.animate(
			[
				{ translate: '0 0' },
				{ translate: '-6px 0' },
				{ translate: '5px 0' },
				{ translate: '-4px 0' },
				{ translate: '3px 0' },
				{ translate: '0 0' }
			],
			{ duration: 380, easing: 'ease-out' }
		);
	}
}

export const fx = new Effects();
