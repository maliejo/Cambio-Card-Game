<script lang="ts">
	import { client } from '$lib/client/game.svelte';
	import type { Rules } from '$lib/shared/types';

	const v = $derived(client.view!);
	const isHost = $derived(v.hostId === v.selfId);
	let copied = $state(false);
	let showRules = $state(false);

	async function copyCode() {
		await navigator.clipboard.writeText(v.gameId);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	// one select per house rule — the first option is the default
	const RULES_UI: { key: keyof Rules; label: string; options: { value: Rules[keyof Rules]; label: string }[] }[] = [
		{
			key: 'redKingValue',
			label: 'Red king value',
			options: [
				{ value: -2, label: '-2 points' },
				{ value: -1, label: '-1 point' }
			]
		},
		{
			key: 'blackKingValue',
			label: 'Black king value',
			options: [
				{ value: 10, label: '+10 points' },
				{ value: 5, label: '+5 points' },
				{ value: 20, label: '+20 points' }
			]
		},
		{
			key: 'powers',
			label: 'Card powers',
			options: [
				{ value: 'queen', label: 'Queen peeks 2 cards & may swap · King has no power' },
				{ value: 'king', label: 'Queen swaps blind · King peeks 2 cards & may swap' }
			]
		},
		{
			key: 'peeking',
			label: 'Peek & swap targets',
			options: [
				{ value: 'two_players', label: 'Two different players (yourself included)' },
				{ value: 'same_player', label: 'Any two cards, even two of your own' }
			]
		},
		{
			key: 'flipping',
			label: 'Flipping duplicates',
			options: [
				{ value: 'first_multiple', label: 'Fastest player only, several cards' },
				{ value: 'single', label: 'Fastest player only, one card' },
				{ value: 'everyone', label: 'Everyone may flip, no race' }
			]
		},
		{
			key: 'callerLocked',
			label: "Cambio caller's cards",
			options: [
				{ value: true, label: 'Locked — nobody may touch them' },
				{ value: false, label: 'May still be swapped & flipped' }
			]
		},
		{
			key: 'cambioBonus',
			label: 'Cambio bonus',
			options: [
				{ value: -5, label: '-5 points' },
				{ value: -10, label: '-10 points' }
			]
		},
		{
			key: 'cambioPenalty',
			label: 'Wrong cambio penalty',
			options: [
				{ value: 5, label: '+5 points' },
				{ value: 10, label: '+10 points' }
			]
		}
	];

	function setRule(key: keyof Rules, encoded: string) {
		// option values are JSON-encoded so numbers, strings and booleans survive the <select>
		client.send({ method: 'setRules', rules: { ...v.rules, [key]: JSON.parse(encoded) } });
	}
</script>

<div class="relative w-80 rounded border bg-white text-center shadow-xl">
	<button
		class="absolute top-2 right-2 rounded-full p-1.5 text-lg leading-none transition-colors hover:bg-gray-100
			{showRules ? 'bg-gray-100' : ''}"
		onclick={() => (showRules = !showRules)}
		title="game rules"
		aria-label="game rules"
	>
		⚙️
	</button>

	<h1 class="pt-4 text-2xl font-bold">Waiting for players…</h1>
	<button class="group mx-auto block p-4" onclick={copyCode} title="copy to clipboard">
		<span class="font-mono text-4xl font-bold tracking-widest text-primary">{v.gameId}</span>
		<span class="block text-xs text-gray-400">
			{copied ? 'copied!' : 'share this code — click to copy'}
		</span>
	</button>

	{#if showRules}
		<!-- everyone sees the rules, only the host may change them -->
		<div class="mx-auto w-5/6 border-t py-3 text-left">
			{#each RULES_UI as rule (rule.key)}
				<label class="block pb-2">
					<span class="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
						{rule.label}
					</span>
					<select
						class="mt-0.5 w-full truncate rounded border border-gray-200 bg-white px-1.5 py-1 text-xs
							disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
						disabled={!isHost}
						onchange={(e) => setRule(rule.key, e.currentTarget.value)}
					>
						{#each rule.options as option, i (option.label)}
							<option value={JSON.stringify(option.value)} selected={v.rules[rule.key] === option.value}>
								{option.label}{i === 0 ? ' (default)' : ''}
							</option>
						{/each}
					</select>
				</label>
			{/each}
			{#if !isHost}
				<p class="text-center text-[10px] text-gray-400">only the host can change the rules</p>
			{/if}
		</div>
	{/if}

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
