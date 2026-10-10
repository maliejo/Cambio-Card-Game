<script lang="ts" module>
	export interface Invite {
		code: string;
		from: string | null;
	}
</script>

<script lang="ts">
	import { client } from '$lib/client/game.svelte';
	import { BOT_DIFFICULTIES, type BotDifficulty, type CardData } from '$lib/shared/types';
	import PlayingCard from './PlayingCard.svelte';

	let { invite = null }: { invite?: Invite | null } = $props();

	let userName = $state('');
	// svelte-ignore state_referenced_locally -- the invite only seeds the form
	let roomCode = $state(invite?.code ?? '');
	let difficulty = $state<BotDifficulty>('medium');

	const named = $derived(userName.trim() !== '' && client.connected);

	const MODES = [
		{ id: 'friends', label: '👥 With friends' },
		{ id: 'bots', label: '🤖 Against bots' }
	] as const;
	let mode = $state<(typeof MODES)[number]['id']>('friends');
	let nameInput: HTMLInputElement | undefined = $state();
	// an invited player only needs to type their name
	$effect(() => {
		if (invite) nameInput?.focus();
	});

	const DIFFICULTY_NOTES: Record<BotDifficulty, string> = {
		easy: 'Slow, forgetful bots — good for learning the rules.',
		medium: 'Watches the table, but forgets like a human.',
		hard: 'Quick reactions and a perfect memory.'
	};

	// the logo's fan: the best cards in the game, a red king and a joker, around a face-down card
	const FAN: (CardData | 'hidden')[] = [
		{ rank: 'A', suit: 'S' },
		{ rank: 'K', suit: 'H' },
		'hidden',
		{ rank: 'F', suit: 'C' },
		{ rank: '7', suit: 'D' }
	];
</script>

<div class="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col items-center">
	<div class="fan" aria-hidden="true">
		{#each FAN as card, i (i)}
			<div class="fan-card" style:--i={i - (FAN.length - 1) / 2}>
				<PlayingCard {card} sway={i} />
			</div>
		{/each}
	</div>
	<h1 class="logo">Cambio</h1>

	{#if invite}
		<!-- invited: one name field and one button, nothing to choose -->
		<div class="panel w-full p-5">
			<p class="pb-4 text-center text-lg font-bold">
				{#if invite.from}<span class="text-gold">{invite.from}</span> dealt you in{:else}You're invited{/if}
				<span class="block pt-1 text-xs font-medium text-light/45">Room <span class="font-mono tracking-wider">{invite.code}</span></span>
			</p>
			<label class="eyebrow block pb-1.5" for="name">Your name</label>
			<input
				id="name"
				bind:this={nameInput}
				bind:value={userName}
				placeholder="Enter your name"
				maxlength="20"
				class="field w-full"
				onkeydown={(e) => e.key === 'Enter' && named && client.send({ method: 'join', gameId: invite.code, name: userName })}
			/>
			<button
				onclick={() => client.send({ method: 'join', gameId: invite.code, name: userName })}
				disabled={!named}
				class="btn btn-gold mt-4 w-full"
			>
				Join the table
			</button>
			<a href="/" class="block pt-4 text-center text-xs text-light/40 hover:text-light/70">or go to the main menu</a>
		</div>
	{:else}
	<div class="panel w-full p-5">
		<label class="eyebrow block pb-1.5" for="name">1 · Your name</label>
		<input
			id="name"
			bind:value={userName}
			placeholder="Enter your name"
			maxlength="20"
			class="field w-full"
		/>

		<p class="eyebrow pt-5 pb-1.5">2 · How do you want to play?</p>
		<div class="grid grid-cols-2 gap-1 rounded-xl bg-ink p-1 shadow-[inset_0_2px_4px_rgb(0_0_0/0.4)]" role="tablist">
			{#each MODES as m (m.id)}
				<button
					role="tab"
					aria-selected={mode === m.id}
					class="rounded-lg py-2 text-sm font-bold transition-colors
						{mode === m.id ? 'bg-panel-raised text-light shadow-[0_2px_0_var(--color-panel-edge)]' : 'text-light/45 hover:text-light/75'}"
					onclick={() => (mode = m.id)}
				>
					{m.label}
				</button>
			{/each}
		</div>

		<div class="pt-4" role="tabpanel">
			{#if mode === 'friends'}
				<p class="pb-3 text-xs text-light/50">Play online with 2–6 people. One of you creates a room and shares its code.</p>
				<button onclick={() => client.send({ method: 'create', name: userName })} disabled={!named} class="btn w-full">
					Create a room
				</button>
				<p class="eyebrow pt-4 pb-1.5">Got a code from a friend?</p>
				<div class="flex gap-2">
					<input
						bind:value={roomCode}
						placeholder="Room code"
						aria-label="room code"
						maxlength="4"
						class="field min-w-0 flex-1 font-mono tracking-[0.3em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
					/>
					<button
						onclick={() => client.send({ method: 'join', gameId: roomCode, name: userName })}
						disabled={!named || !roomCode.trim()}
						class="btn shrink-0"
					>
						Join
					</button>
				</div>
			{:else}
				<p class="pb-3 text-xs text-light/50">A solo game against three computer players. Starts right away.</p>
				<p class="eyebrow pb-1.5">Bot difficulty</p>
				<div class="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="bot difficulty">
					{#each BOT_DIFFICULTIES as level (level)}
						<button
							role="radio"
							aria-checked={difficulty === level}
							class="rounded-lg border py-1.5 text-xs font-bold capitalize transition-colors
								{difficulty === level ? 'border-primary bg-primary/20 text-light' : 'border-white/10 text-light/50 hover:text-light/80'}"
							onclick={() => (difficulty = level)}
						>
							{level}
						</button>
					{/each}
				</div>
				<p class="pt-1.5 text-xs text-light/40">{DIFFICULTY_NOTES[difficulty]}</p>
				<button
					onclick={() => client.send({ method: 'practice', name: userName, difficulty })}
					disabled={!named}
					class="btn mt-4 w-full"
				>
					Start practice game
				</button>
			{/if}
			{#if !userName.trim()}
				<p class="pt-2 text-center text-xs text-light/40">Enter your name first</p>
			{/if}
		</div>

		<label class="mt-5 flex cursor-pointer items-center gap-2 border-t border-white/8 pt-4 text-sm text-light/55">
			<input
				type="checkbox"
				checked={client.showHints}
				onchange={(e) => client.setShowHints(e.currentTarget.checked)}
				class="h-4 w-4 accent-primary"
			/>
			Highlight valid moves
		</label>
	</div>
	{/if}

	{#if !client.connected}
		<p class="pt-4 text-center text-xs text-light/40">connecting to server…</p>
	{/if}
</div>

<style>
	.fan {
		position: relative;
		height: 7.5rem;
		width: 100%;
		margin-bottom: 0.5rem;
	}
	.fan-card {
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 4.5rem;
		margin-left: -2.25rem;
		transform-origin: 50% 160%;
		rotate: calc(var(--i) * 11deg);
		translate: calc(var(--i) * 6px) 0;
		animation: deal 600ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
		animation-delay: calc((var(--i) + 2) * 70ms);
	}
	@keyframes deal {
		from {
			rotate: 0deg;
			translate: 0 40px;
			opacity: 0;
		}
	}
	.logo {
		font-size: 3.25rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		background: linear-gradient(180deg, #fff 30%, var(--color-secondary));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 4px 0 var(--color-primary-deep));
		padding-bottom: 1.5rem;
	}
</style>
