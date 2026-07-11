<script lang="ts">
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { actionFor, handleCardClick } from '$lib/client/actions';
	import { cardLocation } from '$lib/client/locations';
	import { handCardWidth, handCardHeight, type Orientation } from '$lib/client/ui';
	import type { PlayerView } from '$lib/shared/types';

	interface Props {
		player: PlayerView;
		large?: boolean;
		/** How this player sits relative to me: 180 = across, 90 = left edge, -90 = right edge. */
		orientation?: Orientation;
	}
	let { player, large = false, orientation = 0 }: Props = $props();

	// two fixed rows as the OWNER sees them: the memorized cards (2, 3) stay
	// bottom-left, extra cards (penalties, gifts) alternate between the rows
	const ownRows = $derived.by(() => {
		const top = [0, 1];
		const bottom = [2, 3].filter((i) => i < player.hand.length);
		for (let i = 4; i < player.hand.length; i++) {
			(top.length <= bottom.length ? top : bottom).push(i);
		}
		return [top, bottom];
	});

	// what I see is the owner's layout rotated to where they sit at the table:
	// across = upside down, left/right edge = turned a quarter
	const grid = $derived.by(() => {
		const rows = ownRows;
		if (orientation === 0) return rows;
		if (orientation === 180) return [...rows].reverse().map((row) => [...row].reverse());
		const cols = Math.max(...rows.map((r) => r.length));
		const out: number[][] = [];
		for (let c = 0; c < cols; c++) {
			const row: number[] = [];
			for (let r = 0; r < rows.length; r++) {
				const index =
					orientation === 90
						? rows[rows.length - 1 - r][c] // their bottom row lands on my left
						: rows[r][cols - 1 - c]; // their bottom row lands on my right
				if (index !== undefined) row.push(index);
			}
			out.push(row);
		}
		return out;
	});

	const sideways = $derived(orientation === 90 || orientation === -90);
</script>

{#snippet card(index: number)}
	<PlayingCard
		card={client.revealFor(player.id, index) ?? player.hand[index]}
		clickable={actionFor(player.id, index) !== null}
		selected={client.picks.some((p) => p.playerId === player.id && p.index === index)}
		highlighted={client.revealFor(player.id, index) !== null &&
			client.view?.phase !== 'initial_peek'}
		onclick={() => handleCardClick(player.id, index)}
	/>
{/snippet}

{#snippet peekBadge(index: number)}
	{@const peeker = client.peekedBy(player.id, index)}
	<!-- who looked at a card is public — everyone sees the eye on that exact slot -->
	{#if peeker && player.hand[index]}
		<span
			class="pointer-events-none absolute -top-1.5 -right-1.5 z-10 rounded-full bg-dark px-1 text-[10px] leading-4 shadow-md"
			title="{peeker} looked at this card"
		>
			👁️
		</span>
	{/if}
{/snippet}

{#snippet slot(index: number)}
	{#if sideways}
		<!-- the card lies on its side: the wrapper is landscape, the card rotated into it -->
		<div
			class="relative aspect-[7/5] shrink-0 {handCardHeight()}"
			style:visibility={client.isFlightTarget(`${player.id}:${index}`) ? 'hidden' : 'visible'}
			use:cardLocation={`${player.id}:${index}`}
		>
			<div class="absolute inset-0 grid place-items-center">
				<div class={orientation === 90 ? 'rotate-90' : '-rotate-90'} style:width="71.43%">
					{@render card(index)}
				</div>
			</div>
			{@render peekBadge(index)}
		</div>
	{:else}
		<div
			class="relative shrink-0 {handCardWidth(large)}"
			style:visibility={client.isFlightTarget(`${player.id}:${index}`) ? 'hidden' : 'visible'}
			use:cardLocation={`${player.id}:${index}`}
		>
			{@render card(index)}
			{@render peekBadge(index)}
		</div>
	{/if}
{/snippet}

<div class="flex flex-col gap-1.5 sm:gap-2">
	{#each grid as row, r (r)}
		<div class="flex justify-center gap-1.5 sm:gap-2">
			{#each row as index (index)}{@render slot(index)}{/each}
		</div>
	{/each}
</div>
