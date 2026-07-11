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

	// two rows as the OWNER sees them: the memorized cards (2, 3) stay bottom-left,
	// extra cards (penalties, gifts) alternate between the rows. Emptied slots are
	// dropped entirely so the remaining cards slide together — no gaps.
	const ownRows = $derived.by(() => {
		const top = [0, 1];
		const bottom = [2, 3].filter((i) => i < player.hand.length);
		for (let i = 4; i < player.hand.length; i++) {
			(top.length <= bottom.length ? top : bottom).push(i);
		}
		return [
			top.filter((i) => player.hand[i] !== null),
			bottom.filter((i) => player.hand[i] !== null)
		];
	});

	// a strict grid, rotated to where the owner sits: across = upside down,
	// left/right edge = a quarter turn. Rows/columns of unequal length are
	// flush-aligned towards the owner's row start, so everything stays lined up.
	const layout = $derived.by(() => {
		const [top, bottom] = ownRows;
		switch (orientation) {
			case 180:
				return {
					rows: [[...bottom].reverse(), [...top].reverse()].filter((r) => r.length),
					flushEnd: true
				};
			// sideways seats: the owner's rows become my columns
			case 90:
				return { cols: [bottom, top].filter((c) => c.length), flushEnd: false };
			case -90:
				return {
					cols: [[...top].reverse(), [...bottom].reverse()].filter((c) => c.length),
					flushEnd: true
				};
			default:
				return { rows: [top, bottom].filter((r) => r.length), flushEnd: false };
		}
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

{#if layout.rows}
	<div class="flex flex-col gap-1.5 sm:gap-2 {layout.flushEnd ? 'items-end' : 'items-start'}">
		{#each layout.rows as row, r (r)}
			<div class="flex gap-1.5 sm:gap-2">
				{#each row as index (index)}{@render slot(index)}{/each}
			</div>
		{/each}
	</div>
{:else}
	<div class="flex gap-1.5 sm:gap-2 {layout.flushEnd ? 'items-end' : 'items-start'}">
		{#each layout.cols ?? [] as col, c (c)}
			<div class="flex flex-col gap-1.5 sm:gap-2">
				{#each col as index (index)}{@render slot(index)}{/each}
			</div>
		{/each}
	</div>
{/if}
