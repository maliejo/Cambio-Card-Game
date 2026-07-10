<script lang="ts">
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { actionFor, handleCardClick } from '$lib/client/actions';
	import { cardLocation } from '$lib/client/locations';
	import type { PlayerView } from '$lib/shared/types';

	let { player }: { player: PlayerView } = $props();

	// two fixed rows: the memorized cards (2, 3) stay at the bottom,
	// extra cards (penalties, gifts) extend the top row to the right
	const topRow = $derived(player.hand.map((_, i) => i).filter((i) => i !== 2 && i !== 3));
	const bottomRow = $derived([2, 3].filter((i) => i < player.hand.length));
</script>

{#snippet slot(index: number)}
	<div class="w-12 shrink-0 sm:w-16" use:cardLocation={`${player.id}:${index}`}>
		<PlayingCard
			card={client.revealFor(player.id, index) ?? player.hand[index]}
			clickable={actionFor(player.id, index) !== null}
			selected={client.picks.some((p) => p.playerId === player.id && p.index === index)}
			highlighted={client.revealFor(player.id, index) !== null}
			onclick={() => handleCardClick(player.id, index)}
		/>
	</div>
{/snippet}

<div class="flex flex-col gap-1">
	<div class="flex gap-1">
		{#each topRow as index (index)}{@render slot(index)}{/each}
	</div>
	<div class="flex gap-1">
		{#each bottomRow as index (index)}{@render slot(index)}{/each}
	</div>
</div>
