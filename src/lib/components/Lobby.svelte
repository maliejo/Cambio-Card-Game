<script lang="ts">
	import { client } from '$lib/client/game.svelte';

	let userName = $state('');
	let roomCode = $state('');

	function createGame() {
		client.send({ method: 'create', name: userName });
	}

	function joinGame() {
		client.send({ method: 'join', gameId: roomCode, name: userName });
	}
</script>

<div class="w-80 rounded border bg-white shadow-xl">
	<h1 class="pt-4 text-center text-2xl font-bold">Cambio - Lobby</h1>
	<div class="p-4">
		<input bind:value={userName} placeholder="Enter your name" class="w-full rounded border p-2" />
	</div>
	<hr class="mx-auto w-5/6 border-t" />
	<div class="p-4 pt-4">
		<button
			onclick={createGame}
			disabled={!userName.trim() || !client.connected}
			class="w-full rounded bg-primary p-2 text-white disabled:cursor-not-allowed disabled:bg-gray-400"
		>
			Create Game
		</button>
	</div>
	<div class="flex items-center gap-x-2 p-4 pt-0">
		<input
			bind:value={roomCode}
			placeholder="Have a game code?"
			class="h-10 w-full min-w-40 rounded border p-2 font-mono uppercase"
		/>
		<button
			onclick={joinGame}
			disabled={!userName.trim() || !roomCode.trim() || !client.connected}
			class="h-10 w-full rounded bg-primary p-2 text-white disabled:cursor-not-allowed disabled:bg-gray-400"
		>
			Join Game
		</button>
	</div>
	<label class="flex cursor-pointer items-center gap-2 p-4 pt-0 text-sm text-gray-600">
		<input
			type="checkbox"
			checked={client.showHints}
			onchange={(e) => client.setShowHints(e.currentTarget.checked)}
			class="accent-primary"
		/>
		Show gameplay hints
	</label>
	{#if !client.connected}
		<p class="pb-4 text-center text-xs text-gray-400">connecting to server…</p>
	{/if}
</div>
