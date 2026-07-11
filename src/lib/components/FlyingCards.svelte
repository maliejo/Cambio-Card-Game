<script lang="ts">
	import { client, type Flight } from '$lib/client/game.svelte';
	import PlayingCard from './PlayingCard.svelte';

	const faceKey = (c: Flight['card']) => (c === 'hidden' ? 'back' : c.rank + c.suit);

	/** Svelte action: fly the element from its start rect to the flight's target rect. */
	function fly(node: HTMLElement, flight: Flight) {
		const dx = flight.to.left - flight.from.left;
		const dy = flight.to.top - flight.from.top;
		const scale = flight.to.width / flight.from.width;
		// like svelte's crossfade: duration follows the travelled distance
		const duration = Math.min(900, 300 + Math.sqrt(dx * dx + dy * dy) * 0.9);
		const animation = node.animate(
			[
				{ transform: 'translate(0px, 0px) scale(1)', offset: 0 },
				{ transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(1 + scale) / 2 + 0.15})`, offset: 0.5 },
				{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 }
			],
			{ duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
		);
		animation.onfinish = () => client.endFlight(flight.id);

		// turning over happens IN the air: the card rotates edge-on towards the middle
		// of the flight, swaps its face there, and lands fully turned
		let flipAnimation: Animation | undefined;
		let flipTimer: ReturnType<typeof setTimeout> | undefined;
		if (faceKey(flight.card) !== faceKey(flight.toCard)) {
			const inner = node.firstElementChild as HTMLElement | null;
			flipAnimation = inner?.animate(
				[
					{ transform: 'rotateY(0deg)', offset: 0 },
					{ transform: 'rotateY(90deg)', offset: 0.5 },
					{ transform: 'rotateY(-90deg)', offset: 0.5001 },
					{ transform: 'rotateY(0deg)', offset: 1 }
				],
				{ duration, easing: 'linear', fill: 'forwards' }
			);
			flipTimer = setTimeout(() => (flight.card = flight.toCard), duration / 2);
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
	<div
		class="pointer-events-none fixed z-50 origin-top-left drop-shadow-xl [perspective:600px]"
		style:left="{flight.from.left}px"
		style:top="{flight.from.top}px"
		style:width="{flight.from.width}px"
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
