<script lang="ts">
	import type { CardData } from '$lib/shared/types';
	import { SUIT_NAMES, rankLabel } from '$lib/shared/types';
	import { tilt } from '$lib/client/tilt';
	import CardFace from './cards/CardFace.svelte';

	interface Props {
		/** A face-up card, 'hidden' for a face-down card, or null for an empty slot. */
		card: CardData | 'hidden' | null;
		clickable?: boolean;
		selected?: boolean;
		highlighted?: boolean;
		/** A spot inviting the next move (draw source or drop target) — softly glowing. */
		hinted?: boolean;
		/** Someone is looking at this card right now — a bright border marks it for everyone. */
		peeked?: boolean;
		/** Idle sway, like a card held in a hand. The value staggers the motion between cards. */
		sway?: number | null;
		onclick?: () => void;
	}
	let {
		card,
		clickable = false,
		selected = false,
		highlighted = false,
		hinted = false,
		peeked = false,
		sway = null,
		onclick
	}: Props = $props();

	function label(card: CardData | 'hidden'): string {
		if (card === 'hidden') return 'face-down card';
		if (card.rank === 'F') return 'joker';
		return `${rankLabel(card.rank)} of ${SUIT_NAMES[card.suit]}`;
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
		if ((card === 'hidden') === (shownFace === 'hidden')) {
			// same side stays up (e.g. the discard top changing to another face-up
			// card) — only actually turning a card over animates
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
	<!-- an empty pile can still be a drop target (e.g. discarding onto a fresh pile) -->
	<button
		type="button"
		class="slot"
		class:hinted
		disabled={!clickable}
		aria-label="empty pile"
		{onclick}
	></button>
{:else}
	<button
		type="button"
		class="card"
		class:clickable
		class:lifted={selected || highlighted}
		class:hinted
		class:peeked
		disabled={!clickable}
		aria-label={label(card)}
		use:tilt={clickable}
		{onclick}
	>
		<div class="sway" class:swaying={sway !== null} style:--sway-delay="{(sway ?? 0) * -1.3}s">
			<div class="face" class:mid-flip={midFlip}>
				<CardFace card={shownFace ?? card} />
				<div class="sheen"></div>
			</div>
		</div>
	</button>
{/if}

<style>
	.card,
	.slot {
		display: block;
		aspect-ratio: 5 / 7;
		width: 100%;
		border-radius: 9% / 6.5%;
		-webkit-user-select: none;
		user-select: none;
	}

	.slot {
		border: 2px dashed rgb(255 255 255 / 0.14);
		background: rgb(0 0 0 / 0.15);
	}
	.slot:not(:disabled) {
		cursor: pointer;
	}

	.card {
		position: relative;
		cursor: default;
		/* --rx/--ry come from the tilt action, following the mouse */
		transform: perspective(500px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
		filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.35));
		transition:
			transform 160ms ease-out,
			translate 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
			scale 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
			filter 180ms;
	}
	.card.clickable {
		cursor: pointer;
	}
	.card.clickable:hover {
		translate: 0 -6%;
		scale: 1.06;
		filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.45));
		z-index: 5;
	}
	.card.clickable:active {
		scale: 0.97;
		transition-duration: 60ms;
	}
	.card.lifted {
		translate: 0 -8%;
		scale: 1.08;
		filter: drop-shadow(0 12px 12px rgb(6 1 17 / 0.55));
		z-index: 5;
	}

	/* a valid move: a warm gold glow breathing around the card */
	.hinted {
		animation: hint 1.6s ease-in-out infinite;
	}
	@keyframes hint {
		0%,
		100% {
			box-shadow: 0 0 0 2px rgb(255 201 74 / 0.65), 0 0 10px 1px rgb(255 201 74 / 0.25);
		}
		50% {
			box-shadow: 0 0 0 2px rgb(255 201 74 / 0.95), 0 0 20px 4px rgb(255 201 74 / 0.45);
		}
	}

	/* being looked at: a bright pink border with a glow, unmistakable from across the table */
	.peeked {
		box-shadow:
			0 0 0 3px var(--color-secondary),
			0 0 18px 4px rgb(220 125 248 / 0.55);
	}

	.sway {
		height: 100%;
	}
	.swaying {
		animation: sway 4.2s ease-in-out infinite;
		animation-delay: var(--sway-delay);
	}
	@keyframes sway {
		0%,
		100% {
			translate: 0 0;
			rotate: -1deg;
		}
		50% {
			translate: 0 -3%;
			rotate: 1.2deg;
		}
	}

	.face {
		position: relative;
		height: 100%;
		border-radius: 9% / 6.5%;
		transition: transform 150ms ease-in;
	}
	.face.mid-flip {
		transform: rotateY(90deg);
	}

	/* glossy light that follows the cursor across the card */
	.sheen {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		opacity: 0;
		background: radial-gradient(
			circle at var(--mx, 50%) var(--my, 0%),
			rgb(255 255 255 / 0.45),
			transparent 55%
		);
		mix-blend-mode: overlay;
		transition: opacity 200ms;
	}
	.card.clickable:hover .sheen {
		opacity: 1;
	}
</style>
