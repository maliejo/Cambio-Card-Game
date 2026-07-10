<script lang="ts">
	import Hand from './Hand.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';
	import { handCardWidth } from '$lib/client/ui';
	import type { PlayerView } from '$lib/shared/types';

	let { player, area }: { player: PlayerView; area: string } = $props();

	const v = $derived(client.view!);
	const isCurrent = $derived(v.phase === 'playing' && v.currentPlayerId === player.id);
	const isSelf = $derived(player.id === v.selfId);
	const holdsDrawnCard = $derived(isCurrent && v.turnState === 'holding');
</script>

<div
	class="flex min-h-0 flex-col items-center justify-center gap-1 p-1 sm:p-2"
	style:grid-area={area}
>
	<div class="flex items-center gap-1.5 sm:gap-3">
		{#if holdsDrawnCard}
			<div
				class="shrink-0 {handCardWidth(isSelf)}"
				style:visibility={client.isFlightTarget('drawn') ? 'hidden' : 'visible'}
				use:cardLocation={'drawn'}
			>
				<PlayingCard card={isSelf ? (v.drawnCard ?? 'hidden') : 'hidden'} highlighted />
			</div>
		{/if}
		<Hand {player} large={isSelf} />
	</div>
	<div
		class="flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm sm:text-sm
			{isCurrent ? 'animate-pulse bg-primary text-white' : 'bg-white/80 text-dark'}"
	>
		{#if v.winnerIds?.includes(player.id)}<span>👑</span>{/if}
		<span class="truncate">{player.name}{isSelf ? ' (you)' : ''}</span>
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
