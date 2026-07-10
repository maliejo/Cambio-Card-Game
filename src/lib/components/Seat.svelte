<script lang="ts">
	import Hand from './Hand.svelte';
	import { client } from '$lib/client/game.svelte';
	import type { PlayerView } from '$lib/shared/types';

	let { player, area }: { player: PlayerView; area: string } = $props();

	const v = $derived(client.view!);
	const isCurrent = $derived(v.phase === 'playing' && v.currentPlayerId === player.id);
	const isSelf = $derived(player.id === v.selfId);
</script>

<div class="flex min-h-0 flex-col items-center justify-center gap-1 p-2" style:grid-area={area}>
	<div class="flex items-center gap-2 text-sm font-semibold {isCurrent ? 'text-primary' : 'text-dark'}">
		{#if isCurrent}<span class="animate-pulse">▶</span>{/if}
		{#if v.winnerIds?.includes(player.id)}<span>👑</span>{/if}
		<span>{player.name}{isSelf ? ' (you)' : ''}</span>
		{#if player.gamesWon > 0}<span class="text-xs" title="rounds won">🏆{player.gamesWon}</span>{/if}
		{#if v.cambioCallerId === player.id}
			<span class="rounded bg-danger px-1.5 py-0.5 text-xs text-white">CAMBIO</span>
		{/if}
		{#if v.phase === 'initial_peek' && player.ready}<span>✅</span>{/if}
		{#if !player.connected}<span class="text-xs text-gray-400">offline</span>{/if}
		{#if player.score !== null}
			<span class="rounded bg-dark px-1.5 py-0.5 text-xs text-white">{player.score} pts</span>
		{/if}
	</div>
	<Hand {player} />
</div>
