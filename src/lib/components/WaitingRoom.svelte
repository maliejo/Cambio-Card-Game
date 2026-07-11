<script lang="ts">
	import { client } from '$lib/client/game.svelte';
	import type { Rules } from '$lib/shared/types';

	const v = $derived(client.view!);
	const isHost = $derived(v.hostId === v.selfId);
	let copied = $state(false);
	let showRules = $state(false);
	/** Which rule's info popover is open. */
	let openInfo = $state<keyof Rules | null>(null);

	async function copyCode() {
		await navigator.clipboard.writeText(v.gameId);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	interface RuleUI {
		key: keyof Rules;
		label: string;
		info: string;
		options: { value: Rules[keyof Rules]; label: string }[];
	}

	// grouped into sections; the first option of every rule is the default
	const SECTIONS: { title: string; rules: RuleUI[] }[] = [
		{
			title: 'Points',
			rules: [
				{
					key: 'cambioStake',
					label: 'Cambio stake',
					info: 'Calling Cambio is a gamble: end the round with strictly the least points and the stake is subtracted from your score as a bonus. If anyone else has less, you pay it on top as a penalty.',
					options: [
						{ value: 5, label: '-5 bonus · +5 penalty' },
						{ value: 10, label: '-10 bonus · +10 penalty' }
					]
				},
				{
					key: 'redKingValue',
					label: 'Red king value',
					info: 'Red kings count negative — the only cards that lower your score. Holding both is the best hand in the game.',
					options: [
						{ value: -2, label: '-2 points' },
						{ value: -1, label: '-1 point' }
					]
				},
				{
					key: 'blackKingValue',
					label: 'Black king value',
					info: 'Black kings are the worst card in the game: no power, just points. Raise this to punish them even harder.',
					options: [
						{ value: 10, label: '+10 points' },
						{ value: 5, label: '+5 points' },
						{ value: 20, label: '+20 points' }
					]
				}
			]
		},
		{
			title: 'Gameplay',
			rules: [
				{
					key: 'powers',
					label: 'Card powers',
					info: 'Discarding a drawn Jack lets you blindly swap any two cards. By default the Queen looks at two cards first and then decides whether to swap them, while the King has no power at all. The alternative gives that peek & swap power to the King and lets the Queen swap blind.',
					options: [
						{ value: 'queen', label: 'Queen peeks & swaps · King powerless' },
						{ value: 'king', label: 'Queen swaps blind · King peeks & swaps' }
					]
				},
				{
					key: 'peeking',
					label: 'Peek & swap targets',
					info: 'Which cards the peek & swap power may look at. By default the two cards must belong to two different players — you may be one of them. The alternative also allows two cards of a single player, even two of your own.',
					options: [
						{ value: 'two_players', label: 'Two different players' },
						{ value: 'same_player', label: 'Any two cards, even your own' }
					]
				},
				{
					key: 'flipping',
					label: 'Flipping duplicates',
					info: 'When a card lands on the discard pile, everyone may race to flip a matching card out of any hand. By default only the fastest player gets the flip and may keep flipping further duplicates. Alternatives: the fastest player may flip exactly one card, or the race is off entirely and everyone may flip calmly.',
					options: [
						{ value: 'first_multiple', label: 'Fastest player, several cards' },
						{ value: 'single', label: 'Fastest player, one card' },
						{ value: 'everyone', label: 'Everyone may flip, no race' }
					]
				},
				{
					key: 'retryFlip',
					label: 'After a wrong flip',
					info: 'A wrong flip always costs you a penalty card. By default you may keep trying anyway. The alternative locks you out after one wrong flip until the next card is discarded.',
					options: [
						{ value: true, label: 'You may try again' },
						{ value: false, label: 'One wrong try locks you out' }
					]
				},
				{
					key: 'callerLocked',
					label: "Cambio caller's cards",
					info: 'Whoever calls Cambio took the risk — by default their cards are locked for the final round: nobody may peek at, swap or flip them. The alternative leaves their cards fair game.',
					options: [
						{ value: true, label: 'Locked — nobody may touch them' },
						{ value: false, label: 'May still be swapped & flipped' }
					]
				}
			]
		}
	];

	function setRule(key: keyof Rules, encoded: string) {
		// option values are JSON-encoded so numbers, strings and booleans survive the <select>
		client.send({ method: 'setRules', rules: { ...v.rules, [key]: JSON.parse(encoded) } });
	}

	function closeRules() {
		showRules = false;
		openInfo = null;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeRules()} />

<div class="relative w-80 rounded border bg-white text-center shadow-xl">
	<button
		class="absolute top-2 right-2 rounded-full p-1.5 text-lg leading-none transition-colors hover:bg-gray-100"
		onclick={() => (showRules = true)}
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

	<ul class="mx-auto w-5/6 border-t py-4">
		{#each v.players as player (player.id)}
			<li class="py-1 font-semibold">
				{player.isBot ? '🤖 ' : ''}{player.name}
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

{#if showRules}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/40" aria-label="close rules" onclick={closeRules}
		></button>
		<div
			class="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 text-left shadow-2xl"
			role="dialog"
			aria-label="game rules"
		>
			<div class="flex items-baseline justify-between pb-1">
				<h2 class="text-lg font-bold">Game rules</h2>
				<button
					class="rounded-full px-2 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					onclick={closeRules}
					aria-label="close"
				>
					✕
				</button>
			</div>
			<p class="pb-3 text-xs text-gray-400">
				{isHost ? 'You are the host — your changes apply for everyone.' : 'Only the host can change the rules.'}
			</p>

			<div class="grid gap-x-10 gap-y-4 sm:grid-cols-2">
				{#each SECTIONS as section (section.title)}
					<section>
						<h3 class="border-b pb-1 text-xs font-bold tracking-wide text-gray-500 uppercase">
							{section.title}
						</h3>
						{#each section.rules as rule (rule.key)}
							<div class="relative pt-2.5">
								<div class="flex items-center gap-1">
									<span class="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
										{rule.label}
									</span>
									<button
										class="grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none
											{openInfo === rule.key ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}"
										onclick={() => (openInfo = openInfo === rule.key ? null : rule.key)}
										aria-label="explain {rule.label}"
									>
										i
									</button>
								</div>
								{#if openInfo === rule.key}
									<div
										class="absolute inset-x-0 top-8 z-10 rounded-lg bg-dark p-2.5 text-xs leading-relaxed text-white shadow-lg"
									>
										{rule.info}
									</div>
								{/if}
								<select
									class="mt-1 w-full truncate rounded border border-gray-200 bg-white px-1.5 py-1.5 text-xs
										disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
									disabled={!isHost}
									onchange={(e) => setRule(rule.key, e.currentTarget.value)}
								>
									{#each rule.options as option, i (option.label)}
										<option
											value={JSON.stringify(option.value)}
											selected={v.rules[rule.key] === option.value}
										>
											{option.label}{i === 0 ? ' (default)' : ''}
										</option>
									{/each}
								</select>
							</div>
						{/each}
					</section>
				{/each}
			</div>
		</div>
	</div>
{/if}
