<script lang="ts">
	import { client, type Flight } from '$lib/client/game.svelte';
	import PlayingCard from './PlayingCard.svelte';

	/** Svelte action: fly the element from its start rect to the flight's target rect. */
	function fly(node: HTMLElement, flight: Flight) {
		const dx = flight.to.left - flight.from.left;
		const dy = flight.to.top - flight.from.top;
		const scale = flight.to.width / flight.from.width;
		// like svelte's crossfade: duration follows the travelled distance
		const duration = 300 + Math.sqrt(dx * dx + dy * dy) * 0.9;
		const animation = node.animate(
			[
				{ transform: 'translate(0px, 0px) scale(1)', offset: 0 },
				{ transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(1 + scale) / 2 + 0.15})`, offset: 0.5 },
				{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 }
			],
			{ duration: Math.min(900, duration), easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
		);
		animation.onfinish = () => client.endFlight(flight.id);
		return {
			destroy: () => animation.cancel()
		};
	}
</script>

{#each client.flights as flight (flight.id)}
	<div
		class="pointer-events-none fixed z-50 origin-top-left drop-shadow-xl"
		style:left="{flight.from.left}px"
		style:top="{flight.from.top}px"
		style:width="{flight.from.width}px"
		use:fly={flight}
	>
		<PlayingCard card={flight.card === 'hidden' ? 'hidden' : flight.card} />
	</div>
{/each}
