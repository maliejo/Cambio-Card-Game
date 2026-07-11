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

	// columns as the OWNER sees them, each [top, bottom]: the base 2x2 grid is
	// (0,2) and (1,3), extra cards (penalties, gifts) pair up into new columns.
	// The cards lie on the table: a flipped-away card leaves a GAP so nothing
	// shifts around — only a fully emptied column is removed.
	const ownCols = $derived.by(() => {
		const pairs: [number, number][] = [
			[0, 2],
			[1, 3]
		];
		for (let i = 4; i < player.hand.length; i += 2) pairs.push([i, i + 1]);
		const cols: [number | null, number | null][] = [];
		for (const [t, b] of pairs) {
			const top = player.hand[t] != null ? t : null;
			const bottom = player.hand[b] != null ? b : null;
			if (top !== null || bottom !== null) cols.push([top, bottom]);
		}
		return cols;
	});

	// rotated to where the owner sits: across = upside down, left/right = a quarter
	// turn (the owner's columns become my rows)
	const grid = $derived.by(() => {
		switch (orientation) {
			case 180:
				return { cols: [...ownCols].reverse().map(([t, b]) => [b, t]) };
			case 90:
				return { rows: ownCols.map(([t, b]) => [b, t]) };
			case -90:
				return { rows: [...ownCols].reverse() };
			default:
				return { cols: ownCols };
		}
	});

	const sideways = $derived(orientation === 90 || orientation === -90);
</script>

{#snippet card(index: number)}
	<PlayingCard
		card={client.revealFor(player.id, index) ?? player.hand[index]}
		clickable={actionFor(player.id, index) !== null}
		hinted={actionFor(player.id, index) === 'replace'}
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

{#snippet gap()}
	<!-- an emptied slot: invisible, but it keeps its spot on the table -->
	{#if sideways}
		<div class="aspect-[7/5] shrink-0 {handCardHeight()}"></div>
	{:else}
		<div class="aspect-[5/7] shrink-0 {handCardWidth(large)}"></div>
	{/if}
{/snippet}

{#if grid.rows}
	<div class="flex flex-col gap-1.5 sm:gap-2">
		{#each grid.rows as row, r (r)}
			<div class="flex gap-1.5 sm:gap-2">
				{#each row as index, c (c)}
					{#if index !== null}{@render slot(index)}{:else}{@render gap()}{/if}
				{/each}
			</div>
		{/each}
	</div>
{:else}
	<div class="flex gap-1.5 sm:gap-2">
		{#each grid.cols ?? [] as col, c (c)}
			<div class="flex flex-col gap-1.5 sm:gap-2">
				{#each col as index, r (r)}
					{#if index !== null}{@render slot(index)}{:else}{@render gap()}{/if}
				{/each}
			</div>
		{/each}
	</div>
{/if}
