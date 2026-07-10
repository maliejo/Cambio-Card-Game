<script lang="ts">
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { actionFor, handleCardClick } from '$lib/client/actions';
	import { cardLocation } from '$lib/client/locations';
	import { handCardWidth } from '$lib/client/ui';
	import type { PlayerView } from '$lib/shared/types';

	let { player, large = false }: { player: PlayerView; large?: boolean } = $props();

	// two fixed rows: the memorized cards (2, 3) stay bottom-left, extra cards
	// (penalties, gifts) alternate between the rows so both grow evenly to the right
	const rows = $derived.by(() => {
		const top = [0, 1];
		const bottom = [2, 3].filter((i) => i < player.hand.length);
		for (let i = 4; i < player.hand.length; i++) {
			(top.length <= bottom.length ? top : bottom).push(i);
		}
		return { top, bottom };
	});
</script>

{#snippet slot(index: number)}
	<div
		class="shrink-0 {handCardWidth(large)}"
		style:visibility={client.isFlightTarget(`${player.id}:${index}`) ? 'hidden' : 'visible'}
		use:cardLocation={`${player.id}:${index}`}
	>
		<PlayingCard
			card={client.revealFor(player.id, index) ?? player.hand[index]}
			clickable={actionFor(player.id, index) !== null}
			selected={client.picks.some((p) => p.playerId === player.id && p.index === index)}
			highlighted={client.revealFor(player.id, index) !== null &&
				client.view?.phase !== 'initial_peek'}
			onclick={() => handleCardClick(player.id, index)}
		/>
	</div>
{/snippet}

<div class="flex flex-col gap-1.5 sm:gap-2">
	<div class="flex gap-1.5 sm:gap-2">
		{#each rows.top as index (index)}{@render slot(index)}{/each}
	</div>
	<div class="flex gap-1.5 sm:gap-2">
		{#each rows.bottom as index (index)}{@render slot(index)}{/each}
	</div>
</div>
