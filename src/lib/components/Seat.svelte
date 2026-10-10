<script lang="ts">
	import Hand from './Hand.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';
	import { CARD_RATIO, handCardHeight, handCardWidth, type Orientation } from '$lib/client/ui';
	import type { PlayerView } from '$lib/shared/types';

	interface Props {
		player: PlayerView;
		area: string;
		orientation?: Orientation;
	}
	let { player, area, orientation = 0 }: Props = $props();

	const v = $derived(client.view!);
	const isCurrent = $derived(v.phase === 'playing' && v.currentPlayerId === player.id);
	const isSelf = $derived(player.id === v.selfId);
	const isWinner = $derived(v.winnerIds?.includes(player.id) ?? false);
	const holdsDrawnCard = $derived(isCurrent && v.turnState === 'holding');
	const sideways = $derived(orientation === 90 || orientation === -90);
</script>

<div
	class="flex min-h-0 flex-col items-center justify-center gap-1.5 p-1 sm:gap-2 sm:p-2"
	style:grid-area={area}
	data-seat={player.id}
>
	<div class="relative isolate flex items-center">
		<!-- whoever is on the move sits in a pool of warm light -->
		<div class="spotlight" class:on={isCurrent || isWinner} aria-hidden="true"></div>
		<Hand {player} large={isSelf} {orientation} />
		{#if holdsDrawnCard}
			<!-- the drawn card is IN the player's hand, not on the table: it floats
				 beside the laid-out cards without taking layout space, lifted and
				 tilted toward its holder like a card someone just picked up -->
			{#if sideways}
				<!-- side players hold it rotated like their other cards, just above
					 their layout so it never collides with the name or the table -->
				<div
					class="absolute bottom-full left-1/2 z-10 mb-1.5 aspect-[7/5] shrink-0 sm:mb-2 {handCardHeight()}"
					style:transform="translateX(-50%) perspective(600px) rotateY({orientation === 90
						? -18
						: 18}deg) scale(1.05)"
					style:visibility={client.isFlightTarget('drawn') ? 'hidden' : 'visible'}
					data-angle={orientation}
					use:cardLocation={'drawn'}
				>
					<div class="absolute inset-0 grid place-items-center">
						<div class={orientation === 90 ? 'rotate-90' : '-rotate-90'} style:width="{CARD_RATIO * 100}%">
							<PlayingCard card="hidden" highlighted />
						</div>
					</div>
				</div>
			{:else}
				<div
					class="absolute top-1/2 left-full z-10 ml-1.5 shrink-0 sm:ml-2 {handCardWidth(isSelf)}"
					style:transform="translateY(-50%) perspective(600px) rotateX(-18deg) scale(1.05)"
					style:visibility={client.isFlightTarget('drawn') ? 'hidden' : 'visible'}
					use:cardLocation={'drawn'}
				>
					<PlayingCard card={isSelf ? (v.drawnCard ?? 'hidden') : 'hidden'} highlighted sway={7} />
				</div>
			{/if}
		{/if}
	</div>

	<div
		class="flex max-w-full items-center gap-1.5 text-xs font-semibold sm:text-sm
			{isCurrent || isWinner ? 'text-gold' : 'text-light/75'}"
	>
		{#if isCurrent}
			<span class="turn-marker" aria-label="their turn"></span>
		{/if}
		{#if isWinner}<span title="won this round">👑</span>{/if}
		<span class="truncate">
			{player.isBot ? '🤖 ' : ''}{player.name}{#if isSelf}<span class="font-normal text-light/45"> (you)</span>{/if}
		</span>
		{#if player.gamesWon > 0}
			<span class="text-[10px] font-medium text-light/45" title="rounds won">🏆{player.gamesWon}</span>
		{/if}
		{#if v.cambioCallerId === player.id}
			<span class="rounded bg-danger px-1.5 py-px text-[10px] font-bold tracking-wider text-white uppercase shadow-[0_2px_0_var(--color-danger-deep)]">
				Cambio
			</span>
		{/if}
		{#if v.phase === 'initial_peek' && player.ready}
			<span class="text-[10px] font-medium text-emerald-300">ready</span>
		{/if}
		{#if !player.connected}<span class="text-[10px] font-medium text-light/40">offline</span>{/if}
		{#if player.score !== null}
			<span class="tabular-nums text-gold">{player.score} pts</span>
		{/if}
	</div>
</div>

<style>
	.spotlight {
		position: absolute;
		inset: -30% -20%;
		z-index: -1;
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(255 201 74 / 0.22), rgb(220 125 248 / 0.08) 60%, transparent);
		opacity: 0;
		scale: 0.85;
		transition:
			opacity 400ms,
			scale 400ms;
		pointer-events: none;
	}
	.spotlight.on {
		opacity: 1;
		scale: 1;
		animation: breathe 2.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			scale: 1.06;
			opacity: 0.75;
		}
	}

	.turn-marker {
		width: 0;
		height: 0;
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
		border-left: 7px solid var(--color-gold);
		animation: nudge 0.9s ease-in-out infinite;
	}
	@keyframes nudge {
		50% {
			translate: 3px 0;
		}
	}
</style>
