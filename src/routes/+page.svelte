<script lang="ts">
	import { onMount } from 'svelte';
	import { client } from '$lib/client/game.svelte';
	import Lobby from '$lib/components/Lobby.svelte';
	import WaitingRoom from '$lib/components/WaitingRoom.svelte';
	import Table from '$lib/components/Table.svelte';

	onMount(() => client.connect());
</script>

<div class="flex min-h-dvh bg-light">
	<main class="m-auto">
		{#if !client.view}
			<Lobby />
		{:else if client.view.phase === 'waiting'}
			<WaitingRoom />
		{:else}
			<Table />
		{/if}
	</main>
</div>

{#if client.error}
	<div
		class="fixed top-4 left-1/2 -translate-x-1/2 rounded bg-danger px-4 py-2 text-sm font-semibold text-white shadow-lg"
	>
		{client.error}
	</div>
{/if}

{#if client.clientId && !client.connected}
	<div
		class="fixed top-4 left-1/2 -translate-x-1/2 rounded bg-dark px-4 py-2 text-sm font-semibold text-white shadow-lg"
	>
		Connection lost — reload the page
	</div>
{/if}
