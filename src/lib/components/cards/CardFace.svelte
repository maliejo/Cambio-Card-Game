<script lang="ts">
	import { isRed, rankLabel, type CardData } from '$lib/shared/types';

	/**
	 * One card drawn entirely in SVG (shapes come from CardDefs). Designed to stay
	 * legible at thumbnail size: a big rank in the middle does the talking, the
	 * corner indices are there for the classic look.
	 */
	let { card }: { card: CardData | 'hidden' } = $props();

	const W = 100;
	const H = 140;

	const face = $derived(card === 'hidden' ? null : card);
	const ink = $derived(face && isRed(face.suit) ? 'var(--color-suit-red)' : 'var(--color-suit-black)');
	const tint = $derived(face && isRed(face.suit) ? '#fbe0e6' : '#e7e1f4');
	const court = $derived(face?.rank === 'J' || face?.rank === 'Q' || face?.rank === 'K');
	const joker = $derived(face?.rank === 'F');
</script>

<svg viewBox="0 0 {W} {H}" class="block h-full w-full" aria-hidden="true">
	{#if !face}
		<!-- the back: brand purple, a lattice, a gold medallion -->
		<rect width={W} height={H} rx="9" fill="url(#card-back-fill)" />
		<rect x="7" y="7" width={W - 14} height={H - 14} rx="5" fill="url(#card-back-lattice)" />
		<rect
			x="7"
			y="7"
			width={W - 14}
			height={H - 14}
			rx="5"
			fill="none"
			stroke="rgb(255 255 255 / 0.55)"
			stroke-width="2"
		/>
		<circle cx="50" cy="70" r="20" fill="#2c0a78" stroke="var(--color-gold)" stroke-width="3" />
		<use href="#ornament-star" x="37" y="56" width="26" height="26" fill="var(--color-gold)" />
	{:else}
		<rect width={W} height={H} rx="9" fill="var(--color-card)" />
		<rect
			x="1"
			y="1"
			width={W - 2}
			height={H - 2}
			rx="8"
			fill="none"
			stroke="rgb(35 23 63 / 0.14)"
			stroke-width="2"
		/>

		{#snippet corner()}
			{#if joker}
				<use href="#ornament-star" x="3" y="7" width="20" height="20" fill={ink} />
			{:else}
				<text x="13" y="25" class="index" fill={ink} text-anchor="middle">{rankLabel(face!.rank)}</text>
				<use href="#suit-{face!.suit}" x="5" y="29" width="16" height="16" fill={ink} />
			{/if}
		{/snippet}
		{@render corner()}
		<g transform="rotate(180 50 70)">{@render corner()}</g>

		{#if joker}
			<rect x="24" y="26" width="52" height="88" rx="7" fill="url(#joker-fill)" />
			<use href="#ornament-star" x="29" y="44" width="42" height="42" fill="white" />
			<use href="#ornament-star" x="33" y="88" width="10" height="10" fill="rgb(255 255 255 / 0.6)" />
			<use href="#ornament-star" x="57" y="34" width="10" height="10" fill="rgb(255 255 255 / 0.6)" />
			<text x="50" y="108" class="joker-label" fill="white" text-anchor="middle">JOKER</text>
		{:else if court}
			<!-- court cards: a framed portrait panel with the letter as the "figure" -->
			<rect x="24" y="24" width="52" height="92" rx="7" fill={tint} stroke={ink} stroke-width="2" />
			{#if face.rank !== 'J'}
				<use
					href="#ornament-crown"
					x={face.rank === 'K' ? 34 : 38}
					y={face.rank === 'K' ? 30 : 33}
					width={face.rank === 'K' ? 32 : 24}
					height={face.rank === 'K' ? 24 : 18}
					fill="var(--color-gold-deep)"
				/>
			{:else}
				<use href="#suit-{face.suit}" x="43" y="33" width="14" height="14" fill={ink} />
			{/if}
			<text x="50" y="91" class="center" fill={ink} text-anchor="middle">{face.rank}</text>
			<use href="#suit-{face.suit}" x="42" y="96" width="16" height="16" fill={ink} />
		{:else}
			<text x="50" y="86" class="center" fill={ink} text-anchor="middle">{rankLabel(face.rank)}</text>
			<use href="#suit-{face.suit}" x="38" y="92" width="24" height="24" fill={ink} />
		{/if}
	{/if}
</svg>

<style>
	text {
		font-family: var(--font-sans);
		font-weight: 800;
		user-select: none;
	}
	.index {
		font-size: 21px;
		letter-spacing: -1.5px;
	}
	.joker-label {
		font-size: 9px;
		letter-spacing: 1.5px;
	}
	.center {
		font-size: 48px;
		letter-spacing: -3px;
	}
</style>
