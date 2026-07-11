<script lang="ts">
	import Hand from './Hand.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';
	import { handCardHeight, handCardWidth, type Orientation } from '$lib/client/ui';
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
	const holdsDrawnCard = $derived(isCurrent && v.turnState === 'holding');
	const sideways = $derived(orientation === 90 || orientation === -90);
</script>

<div
	class="flex min-h-0 flex-col items-center justify-center gap-1 p-1 sm:p-2"
	style:grid-area={area}
>
	<div class="relative flex items-center">
		<Hand {player} large={isSelf} {orientation} />
		{#if holdsDrawnCard}
			<!-- the drawn card is IN the player's hand, not on the table: it floats
				 beside the laid-out cards without taking layout space, lifted and
				 tilted toward its holder like a card someone just picked up -->
			{#if sideways}
				<!-- side players hold it rotated like their other cards, on the side
					 of their hand that faces the table -->
				<div
					class="absolute top-1/2 z-10 aspect-[7/5] shrink-0 drop-shadow-lg {handCardHeight()}
						{orientation === 90 ? 'left-full ml-1.5 sm:ml-2' : 'right-full mr-1.5 sm:mr-2'}"
					style:transform="translateY(-50%) perspective(600px) rotateY({orientation === 90
						? -18
						: 18}deg) scale(1.05)"
					style:visibility={client.isFlightTarget('drawn') ? 'hidden' : 'visible'}
					use:cardLocation={'drawn'}
				>
					<div class="absolute inset-0 grid place-items-center">
						<div class={orientation === 90 ? 'rotate-90' : '-rotate-90'} style:width="71.43%">
							<PlayingCard card="hidden" highlighted />
						</div>
					</div>
				</div>
			{:else}
				<div
					class="absolute top-1/2 left-full z-10 ml-1.5 shrink-0 drop-shadow-lg sm:ml-2 {handCardWidth(
						isSelf
					)}"
					style:transform="translateY(-50%) perspective(600px) rotateX(-18deg) scale(1.05)"
					style:visibility={client.isFlightTarget('drawn') ? 'hidden' : 'visible'}
					use:cardLocation={'drawn'}
				>
					<PlayingCard card={isSelf ? (v.drawnCard ?? 'hidden') : 'hidden'} highlighted />
				</div>
			{/if}
		{/if}
	</div>
	<div
		class="flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm sm:text-sm
			{sideways ? 'mt-1 sm:mt-1.5' : ''}
			{isCurrent ? 'animate-pulse bg-primary text-white' : 'bg-white/80 text-dark'}"
	>
		{#if v.winnerIds?.includes(player.id)}<span>👑</span>{/if}
		<span class="truncate">{player.isBot ? '🤖 ' : ''}{player.name}{isSelf ? ' (you)' : ''}</span>
		{#if player.gamesWon > 0}<span class="text-[10px]" title="rounds won">🏆{player.gamesWon}</span>{/if}
		{#if v.cambioCallerId === player.id}
			<span class="rounded-full bg-danger px-1.5 text-[10px] text-white">CAMBIO</span>
		{/if}
		{#if v.phase === 'initial_peek' && player.ready}<span>✅</span>{/if}
		{#if !player.connected}<span class="text-[10px] opacity-60">offline</span>{/if}
		{#if player.score !== null}
			<span class="rounded-full bg-dark px-1.5 text-[10px] text-white">{player.score} pts</span>
		{/if}
	</div>
</div>
