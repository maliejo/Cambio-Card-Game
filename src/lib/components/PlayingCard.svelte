<script lang="ts">
	import type { CardData, Rank, Suit } from '$lib/shared/types';
	import cardsUrl from 'svg-cards/svg-cards.svg?url';

	interface Props {
		/** A face-up card, 'hidden' for a face-down card, or null for an empty slot. */
		card: CardData | 'hidden' | null;
		clickable?: boolean;
		selected?: boolean;
		highlighted?: boolean;
		onclick?: () => void;
	}
	let { card, clickable = false, selected = false, highlighted = false, onclick }: Props = $props();

	const rankNames: Record<Rank, string> = {
		A: '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
		T: '10', J: 'jack', Q: 'queen', K: 'king', F: 'joker'
	};
	const suitNames: Record<Suit, string> = { C: 'club', D: 'diamond', H: 'heart', S: 'spade' };

	function spriteId(card: CardData | 'hidden'): string {
		if (card === 'hidden') return 'back';
		if (card.rank === 'F') return card.suit === 'H' || card.suit === 'D' ? 'joker_red' : 'joker_black';
		return `${suitNames[card.suit]}_${rankNames[card.rank]}`;
	}

	function label(card: CardData | 'hidden'): string {
		return card === 'hidden' ? 'face-down card' : spriteId(card).replace('_', ' ');
	}

	// The face actually rendered lags behind the prop by half a flip:
	// when the card changes we rotate to 90°, swap the face, and rotate back.
	const faceKey = (c: typeof card) => (c === null ? '' : c === 'hidden' ? 'back' : c.rank + c.suit);
	// svelte-ignore state_referenced_locally -- starting from the initial face is intended
	let shownFace = $state(card);
	let midFlip = $state(false);
	let flipTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (faceKey(card) === faceKey(shownFace)) return;
		if (card === null || shownFace === null) {
			// a slot appearing or emptying is not a flip
			shownFace = card;
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
	<div class="aspect-[169/245] w-full rounded-md border-2 border-dashed border-black/20"></div>
{:else}
	<button
		type="button"
		class="block aspect-[169/245] w-full rounded-md transition-transform [perspective:600px]
			{clickable ? 'cursor-pointer hover:-translate-y-1 hover:drop-shadow-lg' : 'cursor-default'}
			{selected ? 'ring-4 ring-secondary -translate-y-1' : ''}
			{highlighted ? 'ring-4 ring-primary' : ''}"
		disabled={!clickable}
		aria-label={label(card)}
		{onclick}
	>
		<svg
			viewBox="0 0 169.075 244.64"
			class="h-full w-full transition-transform duration-150 ease-in"
			style:transform={midFlip ? 'rotateY(90deg)' : 'rotateY(0deg)'}
		>
			<use href="{cardsUrl}#{spriteId(shownFace ?? card)}" />
		</svg>
	</button>
{/if}
