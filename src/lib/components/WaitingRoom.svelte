<script lang="ts">
	import { client } from '$lib/client/game.svelte';
	import { MAX_PLAYERS, type Rules } from '$lib/shared/types';
	import LeaveButton from './LeaveButton.svelte';

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

	let linkCopied = $state(false);
	/** An invite link carries my name, so its preview reads "<me> dealt you in". */
	async function shareInvite() {
		const self = v.players.find((p) => p.id === v.selfId);
		const url = new URL(`/join/${v.gameId}`, location.origin);
		if (self) url.searchParams.set('from', self.name);
		// phones get the native share sheet (WhatsApp & co), desktops a copied link
		if (navigator.share && matchMedia('(pointer: coarse)').matches) {
			try {
				await navigator.share({ title: 'Cambio', url: url.href });
				return;
			} catch {
				// dismissed — fall through to copying
			}
		}
		await navigator.clipboard.writeText(url.href);
		linkCopied = true;
		setTimeout(() => (linkCopied = false), 2000);
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
					info: 'A wrong flip always costs you a penalty card. By default it also locks you out until the next card is discarded, so nobody can grab cards at random. The alternative lets you keep trying, a penalty card each time.',
					options: [
						{ value: false, label: 'One wrong try locks you out' },
						{ value: true, label: 'You may try again' }
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

<div class="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col items-center">
	<p class="eyebrow pb-2">Room code</p>
	<button class="group pb-1" onclick={copyCode} title="copy to clipboard">
		<span class="code">{v.gameId}</span>
	</button>
	<p class="pb-4 text-xs text-light/45">{copied ? 'Copied!' : 'Tap to copy the code'}</p>
	<button class="btn mb-6" onclick={shareInvite}>
		{linkCopied ? '✓ Invite link copied' : '🔗 Invite friends'}
	</button>

	<div class="panel w-full p-5">
		<div class="flex items-center justify-between pb-3">
			<h1 class="text-lg font-bold">Players <span class="text-light/40">{v.players.length}/{MAX_PLAYERS}</span></h1>
			<button class="btn btn-muted px-3! py-1.5! text-xs!" onclick={() => (showRules = true)}>
				⚙ House rules
			</button>
		</div>

		<ul class="flex flex-col gap-1.5">
			{#each v.players as player, i (player.id)}
				<li class="player flex items-center gap-3 rounded-xl bg-ink/60 px-3 py-2" style:animation-delay="{i * 60}ms">
					<span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel-raised text-sm font-bold text-secondary shadow-[0_2px_0_var(--color-panel-edge)]">
						{player.isBot ? '🤖' : player.name.slice(0, 1).toUpperCase()}
					</span>
					<span class="truncate font-semibold">{player.name}</span>
					{#if player.id === v.selfId}<span class="text-sm text-light/40">(you)</span>{/if}
					{#if player.id === v.hostId}<span class="ml-auto text-xs font-bold text-gold">👑 Host</span>{/if}
				</li>
			{/each}
			{#each { length: Math.max(0, 2 - v.players.length) }, i (i)}
				<li class="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-light/30">
					<span class="h-8 w-8 rounded-lg border border-dashed border-white/10"></span>
					waiting for a player…
				</li>
			{/each}
		</ul>

		<div class="pt-5">
			{#if isHost}
				<button
					onclick={() => client.send({ method: 'start' })}
					disabled={v.players.length < 2}
					class="btn btn-gold w-full"
				>
					{v.players.length < 2 ? 'Need at least 2 players' : 'Deal the cards'}
				</button>
			{:else}
				<p class="text-center text-sm text-light/45">The host starts the game</p>
			{/if}
		</div>
	</div>
	<div class="pt-4"><LeaveButton label="Back to main menu" /></div>
</div>

{#if showRules}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-ink/75 backdrop-blur-sm" aria-label="close rules" onclick={closeRules}
		></button>
		<div
			class="panel dialog relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-5 text-left sm:p-6"
			role="dialog"
			aria-label="game rules"
		>
			<div class="flex items-baseline justify-between pb-1">
				<h2 class="text-xl font-bold">House rules</h2>
				<button
					class="grid h-8 w-8 place-items-center rounded-lg text-light/40 hover:bg-white/5 hover:text-light"
					onclick={closeRules}
					aria-label="close"
				>
					✕
				</button>
			</div>
			<p class="pb-4 text-xs text-light/45">
				{isHost ? 'You are the host — your changes apply for everyone.' : 'Only the host can change the rules.'}
			</p>

			<div class="grid gap-x-10 gap-y-5 sm:grid-cols-2">
				{#each SECTIONS as section (section.title)}
					<section>
						<h3 class="eyebrow border-b border-white/10 pb-1.5 text-secondary!">
							{section.title}
						</h3>
						{#each section.rules as rule (rule.key)}
							<div class="relative pt-3">
								<div class="flex items-center gap-1.5">
									<span class="text-xs font-semibold text-light/70">
										{rule.label}
									</span>
									<button
										class="grid h-4 w-4 place-items-center rounded text-[10px] leading-none font-bold
											{openInfo === rule.key ? 'bg-primary text-white' : 'bg-white/10 text-light/50 hover:bg-white/20'}"
										onclick={() => (openInfo = openInfo === rule.key ? null : rule.key)}
										aria-label="explain {rule.label}"
									>
										i
									</button>
								</div>
								{#if openInfo === rule.key}
									<div
										class="absolute inset-x-0 top-9 z-10 rounded-lg border border-white/10 bg-panel-raised p-3 text-xs leading-relaxed text-light/85 shadow-xl"
									>
										{rule.info}
									</div>
								{/if}
								<select
									class="field mt-1.5 w-full truncate py-1.5! text-xs"
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

<style>
	.code {
		display: block;
		font-family: ui-monospace, monospace;
		font-size: 3.5rem;
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.25em;
		margin-right: -0.25em;
		color: var(--color-gold);
		text-shadow: 0 4px 0 var(--color-gold-deep);
		transition: scale 150ms;
	}
	.group:hover .code {
		scale: 1.04;
	}
	.player {
		animation: rise 360ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	.dialog {
		animation: rise 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 12px;
		}
	}
</style>
