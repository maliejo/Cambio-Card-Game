<script lang="ts">
	import { client } from '$lib/client/game.svelte';

	const v = $derived(client.view!);
	const isHost = $derived(v.hostId === v.selfId);
	let copied = $state(false);

	async function copyCode() {
		await navigator.clipboard.writeText(v.gameId);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="w-80 rounded border bg-white text-center shadow-xl">
	<h1 class="pt-4 text-2xl font-bold">Waiting for players…</h1>
	<button class="group mx-auto block p-4" onclick={copyCode} title="copy to clipboard">
		<span class="font-mono text-4xl font-bold tracking-widest text-primary">{v.gameId}</span>
		<span class="block text-xs text-gray-400">
			{copied ? 'copied!' : 'share this code — click to copy'}
		</span>
	</button>
	<ul class="mx-auto w-5/6 border-t py-4">
		{#each v.players as player (player.id)}
			<li class="py-1 font-semibold">
				{player.name}
				{player.id === v.hostId ? '👑' : ''}
				{player.id === v.selfId ? '(you)' : ''}
			</li>
		{/each}
	</ul>
	<div class="p-4 pt-0">
		{#if isHost}
			<button
				onclick={() => client.send({ method: 'start' })}
				disabled={v.players.length < 2}
				class="w-full rounded bg-primary p-2 text-white disabled:cursor-not-allowed disabled:bg-gray-400"
			>
				{v.players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
			</button>
		{:else}
			<p class="text-sm text-gray-500">The host starts the game</p>
		{/if}
	</div>
</div>
