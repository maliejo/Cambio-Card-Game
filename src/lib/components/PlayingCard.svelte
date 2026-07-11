<script lang="ts">
	import type { CardData, Rank } from '$lib/shared/types';

	interface Props {
		/** A face-up card, 'hidden' for a face-down card, or null for an empty slot. */
		card: CardData | 'hidden' | null;
		clickable?: boolean;
		selected?: boolean;
		highlighted?: boolean;
		onclick?: () => void;
	}
	let { card, clickable = false, selected = false, highlighted = false, onclick }: Props = $props();

	// SVGs from github.com/letele/playing-cards (CC0), vendored in static/cards:
	// "<suit>-<rank>.svg"; both jokers use J-2 (the black one); back.svg is our own
	// derivative with a bolder pattern that stays readable at small sizes
	const rankNames: Partial<Record<Rank, string>> = { T: '10' };

	function fileFor(card: CardData | 'hidden'): string {
		if (card === 'hidden') return 'back';
		if (card.rank === 'F') return 'J-2';
		return `${card.suit}-${rankNames[card.rank] ?? card.rank}`;
	}

	function label(card: CardData | 'hidden'): string {
		if (card === 'hidden') return 'face-down card';
		if (card.rank === 'F') return 'joker';
		const suits = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
		return `${rankNames[card.rank] ?? card.rank} of ${suits[card.suit]}`;
	}

	// The face actually rendered lags behind the prop by half a flip:
	// when the card changes we rotate to 90°, swap the face, and rotate back.
	const faceKey = (c: typeof card) => (c === null ? '' : c === 'hidden' ? 'back' : c.rank + c.suit);
	// svelte-ignore state_referenced_locally -- starting from the initial face is intended
	let shownFace = $state(card);
	let midFlip = $state(false);
	let flipTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (faceKey(card) === faceKey(shownFace)) {
			// the face may have changed back while a flip was pending — settle upright,
			// otherwise the card stays stuck edge-on at 90° (invisible)
			midFlip = false;
			return;
		}
		if (card === null || shownFace === null) {
			// a slot appearing or emptying is not a flip
			shownFace = card;
			midFlip = false;
			return;
		}
		midFlip = true;
		clearTimeout(flipTimer);
		flipTimer = setTimeout(() => {
			shownFace = card;
			midFlip = false;
		}, 160);
		return () => clearTimeout(flipTimer);
	});
</script>

{#if card === null}
	<div class="aspect-[5/7] w-full rounded-md border-2 border-dashed border-black/20"></div>
{:else}
	<button
		type="button"
		class="block aspect-[5/7] w-full rounded-md transition-transform [perspective:600px]
			{clickable ? 'cursor-pointer hover:-translate-y-1 hover:drop-shadow-lg' : 'cursor-default'}
			{selected || highlighted ? '-translate-y-2 scale-105 drop-shadow-[0_10px_12px_rgba(6,1,17,0.45)]' : ''}"
		disabled={!clickable}
		aria-label={label(card)}
		{onclick}
	>
		<img
			src="/cards/{fileFor(shownFace ?? card)}.svg"
			alt=""
			draggable="false"
			class="h-full w-full transition-transform duration-150 ease-in select-none"
			style:transform={midFlip ? 'rotateY(90deg)' : 'rotateY(0deg)'}
		/>
	</button>
{/if}
