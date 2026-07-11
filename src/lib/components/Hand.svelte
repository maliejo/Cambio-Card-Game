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

	// rendered as COLUMNS so the two rows always line up, rotated to where the
	// owner sits at the table: across = upside down, left/right edge = a quarter turn
	const columns = $derived.by(() => {
		const [top, bottom] = ownRows;
		// sideways seats: the owner's rows become my columns
		if (orientation === 90) return [bottom, top].filter((c) => c.length);
		if (orientation === -90)
			return [[...top].reverse(), [...bottom].reverse()].filter((c) => c.length);
		const cols: number[][] = [];
		for (let c = 0; c < Math.max(top.length, bottom.length); c++) {
			cols.push([top[c], bottom[c]].filter((i) => i !== undefined));
		}
		if (orientation === 180) return cols.reverse().map((col) => col.reverse());
		return cols;
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

<div class="flex items-center gap-1.5 sm:gap-2">
	{#each columns as col, c (c)}
		<div class="flex flex-col justify-center gap-1.5 sm:gap-2">
			{#each col as index (index)}{@render slot(index)}{/each}
		</div>
	{/each}
</div>
