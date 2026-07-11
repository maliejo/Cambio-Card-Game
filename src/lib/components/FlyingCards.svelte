<script lang="ts">
	import { client, type Flight } from '$lib/client/game.svelte';
	import PlayingCard from './PlayingCard.svelte';

	const faceKey = (c: Flight['card']) => (c === 'hidden' ? 'back' : c.rank + c.suit);

	/** Portrait card width inside a sideways (landscape) slot box — see Hand's 71.43%. */
	const RATIO = 5 / 7;

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
		const animation = node.animate(
			[
				{ transform: 'translate(0px, 0px) scale(1)', offset: 0 },
				{
					transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(1 + scale) / 2 + 0.15})`,
					offset: 0.5
				},
				{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 }
			],
			{ duration, easing, fill: 'forwards' }
		);
		animation.onfinish = () => client.endFlight(flight.id);

		// turning over and quarter turns both happen IN the air: the face swaps
		// edge-on at the middle of the flight, the rotation eases in throughout,
		// and the card lands exactly as its destination slot holds it
		const inner = node.firstElementChild as HTMLElement | null;
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
				{ duration, easing: turns ? 'linear' : easing, fill: 'forwards' }
			);
			if (turns) flipTimer = setTimeout(() => (flight.card = flight.toCard), duration / 2);
		}

		return {
			destroy: () => {
				animation.cancel();
				flipAnimation?.cancel();
				clearTimeout(flipTimer);
			}
		};
	}
</script>

{#each client.flights as flight (flight.id)}
	{@const g = geo(flight)}
	<div
		class="pointer-events-none fixed z-50 origin-top-left drop-shadow-xl [perspective:600px]"
		style:left="{g.left}px"
		style:top="{g.top}px"
		style:width="{g.w}px"
		use:fly={flight}
	>
		<div>
			<!-- keyed so the mid-flight face swap replaces the card instead of
				 triggering PlayingCard's own (competing) flip animation -->
			{#key faceKey(flight.card)}
				<PlayingCard card={flight.card} />
			{/key}
		</div>
	</div>
{/each}
