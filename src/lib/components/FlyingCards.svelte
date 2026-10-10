<script lang="ts">
	import { client, type Flight } from '$lib/client/game.svelte';
	import { CARD_RATIO as RATIO } from '$lib/client/ui';
	import PlayingCard from './PlayingCard.svelte';

	const faceKey = (c: Flight['card']) => (c === 'hidden' ? 'back' : c.rank + c.suit);

	/**
	 * The flyer is always a portrait card. A rotated endpoint holds its card a
	 * quarter turn inside a landscape box, so start from that inner card's size
	 * and place the flyer so their centers coincide.
	 */
	function geo(f: Flight) {
		const w = f.fromAngle ? f.from.width * RATIO : f.from.width;
		const h = w / RATIO;
		return {
			w,
			h,
			left: f.from.left + f.from.width / 2 - w / 2,
			top: f.from.top + f.from.height / 2 - h / 2
		};
	}

	/** Svelte action: fly the element from its start rect to the flight's target rect. */
	function fly(node: HTMLElement, flight: Flight) {
		const g = geo(flight);
		const toW = flight.toAngle ? flight.to.width * RATIO : flight.to.width;
		const scale = toW / g.w;
		// aim center at center — with rotated endpoints the boxes are landscape,
		// so top-left corners would not line up
		const dx = flight.to.left + flight.to.width / 2 - (g.left + (g.w * scale) / 2);
		const dy = flight.to.top + flight.to.height / 2 - (g.top + (g.h * scale) / 2);
		// like svelte's crossfade: duration follows the travelled distance
		const duration = Math.min(900, 300 + Math.sqrt(dx * dx + dy * dy) * 0.9);
		const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
		const delay = flight.delayMs;
		const animation = node.animate(
			[
				{ transform: 'translate(0px, 0px) scale(1)', offset: 0 },
				{
					transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(1 + scale) / 2 + 0.15})`,
					offset: 0.5
				},
				{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 }
			],
			{ duration, delay, easing, fill: 'both' }
		);
		animation.onfinish = () => client.endFlight(flight);

		// the card swings into its direction of travel and lifts off the table on the way
		const swing = Math.max(-14, Math.min(14, dx / 25));
		const swingAnimation = (node.firstElementChild as HTMLElement | null)?.animate(
			[
				{ rotate: '0deg', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.4))' },
				{ rotate: `${swing}deg`, filter: 'drop-shadow(0 18px 14px rgb(0 0 0 / 0.45))', offset: 0.45 },
				{ rotate: '0deg', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.4))' }
			],
			{ duration, delay, easing: 'ease-in-out' }
		);

		// turning over and quarter turns both happen IN the air: the face swaps
		// edge-on at the middle of the flight, the rotation eases in throughout,
		// and the card lands exactly as its destination slot holds it
		const inner = node.firstElementChild?.firstElementChild as HTMLElement | null;
		const turns = faceKey(flight.card) !== faceKey(flight.toCard);
		const spins = flight.fromAngle !== flight.toAngle;
		let flipAnimation: Animation | undefined;
		let flipTimer: ReturnType<typeof setTimeout> | undefined;
		if (inner && (turns || spins)) {
			const mid = (flight.fromAngle + flight.toAngle) / 2;
			flipAnimation = inner.animate(
				turns
					? [
							{ transform: `rotate(${flight.fromAngle}deg) rotateY(0deg)`, offset: 0 },
							{ transform: `rotate(${mid}deg) rotateY(90deg)`, offset: 0.5 },
							{ transform: `rotate(${mid}deg) rotateY(-90deg)`, offset: 0.5001 },
							{ transform: `rotate(${flight.toAngle}deg) rotateY(0deg)`, offset: 1 }
						]
					: [
							{ transform: `rotate(${flight.fromAngle}deg)` },
							{ transform: `rotate(${flight.toAngle}deg)` }
						],
				{ duration, delay, easing: turns ? 'linear' : easing, fill: 'both' }
			);
			if (turns) flipTimer = setTimeout(() => (flight.card = flight.toCard), delay + duration / 2);
		}

		return {
			destroy: () => {
				animation.cancel();
				swingAnimation?.cancel();
				flipAnimation?.cancel();
				clearTimeout(flipTimer);
			}
		};
	}
</script>

{#each client.flights as flight (flight.id)}
	{@const g = geo(flight)}
	<div
		class="pointer-events-none fixed z-50 origin-top-left"
		style:left="{g.left}px"
		style:top="{g.top}px"
		style:width="{g.w}px"
		use:fly={flight}
	>
		<div class="[perspective:600px]">
			<div>
				<!-- keyed so the mid-flight face swap replaces the card instead of
					 triggering PlayingCard's own (competing) flip animation -->
				{#key faceKey(flight.card)}
					<PlayingCard card={flight.card} />
				{/key}
			</div>
		</div>
	</div>
{/each}
