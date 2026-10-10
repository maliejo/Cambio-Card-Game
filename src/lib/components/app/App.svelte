<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { client } from '$lib/client/game.svelte';
	import { sfx } from '$lib/client/sfx.svelte';
	import Lobby, { type Invite } from '$lib/components/Lobby.svelte';
	import WaitingRoom from '$lib/components/WaitingRoom.svelte';
	import Table from '$lib/components/Table.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import Bursts from '$lib/components/Bursts.svelte';
	import MuteButton from '$lib/components/MuteButton.svelte';

	/** Set when the page was opened through an invite link. */
	let { invite = null }: { invite?: Invite | null } = $props();

	onMount(() => {
		sfx.init();
		client.connect();
	});

	// once inside a room the invite link has served its purpose — a reload should
	// resume the game, not show the invite again
	$effect(() => {
		if (client.view && location.pathname !== '/') replaceState('/', {});
	});

	const inGame = $derived(client.view && client.view.phase !== 'waiting');
</script>

{#if inGame}
	<Table />
{:else}
	<div class="flex min-h-dvh">
		<main class="m-auto py-8">
			{#if !client.view}
				<Lobby {invite} />
			{:else}
				<WaitingRoom />
			{/if}
		</main>
	</div>
{/if}

<Banner />
<Bursts />
<MuteButton />

{#if client.error}
	<div class="toast bg-danger shadow-[0_4px_0_var(--color-danger-deep),0_12px_24px_rgb(0_0_0/0.4)]" role="alert">
		{client.error}
	</div>
{:else if client.clientId && !client.connected}
	<div class="toast bg-panel-raised shadow-[0_4px_0_var(--color-panel-edge),0_12px_24px_rgb(0_0_0/0.4)]" role="status">
		Connection lost — reconnecting…
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		top: 3.25rem;
		left: 50%;
		z-index: 70;
		translate: -50% 0;
		max-width: calc(100vw - 2rem);
		border-radius: 0.65rem;
		padding: 0.55rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		text-align: center;
		animation: drop 300ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	@keyframes drop {
		from {
			opacity: 0;
			translate: -50% -12px;
		}
	}
</style>
