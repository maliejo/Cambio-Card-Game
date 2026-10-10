<script lang="ts">
	import Seat from './Seat.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import FlyingCards from './FlyingCards.svelte';
	import Results from './Results.svelte';
	import LeaveButton from './LeaveButton.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';
	import { statusFor } from '$lib/client/status';
	import { pileCardWidth, type Orientation } from '$lib/client/ui';
	import type { CardData } from '$lib/shared/types';

	const v = $derived(client.view!);
	const self = $derived(client.self!);
	const myTurn = $derived(client.isMyTurn);

	// self always sits at the bottom (p1), the others follow clockwise
	const seatedPlayers = $derived.by(() => {
		const selfIndex = v.players.findIndex((p) => p.id === v.selfId);
		return [...v.players.slice(selfIndex), ...v.players.slice(0, selfIndex)];
	});

	const LAYOUTS: Record<number, string> = {
		2: '"p2" "table" "p1"',
		3: '"p2 p3" "table table" "p1 p1"',
		4: '". p3 ." "p2 table p4" ". p1 ."',
		5: '". p3 p4 ." "p2 table table p5" ". p1 p1 ."',
		6: '"p3 p4 p5" "p2 table p6" ". p1 ."'
	};

	// where each seat faces: hands render rotated to match, like at a real table
	function orientationFor(position: number): Orientation {
		const count = seatedPlayers.length;
		if (position === 0) return 0; // me, at the bottom
		if (count >= 4 && position === 1) return 90; // left edge of the table
		if (count >= 4 && position === count - 1) return -90; // right edge
		return 180; // across the table
	}

	const canDraw = $derived(
		myTurn && v.turnState === 'awaiting_draw' && !v.pendingGive && !client.peekWait
	);
	const canDrawDeck = $derived(canDraw && v.deckCount + v.discardCount > 1);
	const canDrawDiscard = $derived(canDraw && v.discardTop !== null && !v.discardBurnt);
	// while holding a drawn card, the discard pile is a drop target instead of a draw source
	const holding = $derived(myTurn && v.turnState === 'holding');
	const isHost = $derived(v.hostId === v.selfId);

	const status = $derived(statusFor(v, client.peekWait));

	// the scoreboard opens with every finished round, and can be hidden to study the revealed hands
	let resultsOpen = $state(true);
	// a primitive derived only notifies on an actual change — not on every new state message
	const phase = $derived(v.phase);
	$effect(() => {
		if (phase === 'finished') resultsOpen = true;
	});

	/** Stable per-card tilt so the discard pile looks casually thrown together. */
	function tilt(card: CardData): number {
		let h = 0;
		for (const ch of card.rank + card.suit) h = (h * 31 + ch.charCodeAt(0)) % 997;
		return (h % 13) - 6; // -6° … +6°
	}
</script>

<div
	class="grid h-dvh w-screen overflow-hidden pt-9 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-11"
	style:grid-template-areas={LAYOUTS[seatedPlayers.length] ?? LAYOUTS[6]}
	style:grid-auto-rows="minmax(0, 1fr)"
>
	{#each seatedPlayers as player, i (player.id)}
		<Seat {player} area="p{i + 1}" orientation={orientationFor(i)} />
	{/each}

	<div class="flex flex-col items-center justify-center gap-3 p-2 sm:gap-4" style="grid-area: table">
		{#if v.phase !== 'finished'}
			<!-- the felt: a recessed mat holding the two piles -->
			<div class="mat flex items-start gap-4 px-4 pt-3.5 pb-2 sm:gap-7 sm:px-7 sm:pt-5 sm:pb-3">
				<!-- draw pile: a few backs peek out beneath, so it reads as a stack -->
				<div class="flex flex-col items-center gap-1.5 {pileCardWidth()}">
					<div class="relative w-full" use:cardLocation={'deck'}>
						{#if v.deckCount > 1}
							<div class="absolute inset-0 translate-x-[3px] translate-y-[3px] opacity-70">
								<PlayingCard card="hidden" />
							</div>
						{/if}
						{#if v.deckCount > 8}
							<div class="absolute inset-0 translate-x-[6px] translate-y-[6px] opacity-40">
								<PlayingCard card="hidden" />
							</div>
						{/if}
						<div class="relative">
							<PlayingCard
								card={v.deckCount > 0 ? 'hidden' : null}
								clickable={canDrawDeck}
								hinted={client.showHints && canDrawDeck}
								onclick={() => client.send({ method: 'draw', from: 'deck' })}
							/>
						</div>
					</div>
					<span class="eyebrow tabular-nums">deck · {v.deckCount}</span>
				</div>

				<!-- discard pile: a casually thrown-together stack, all face up -->
				<div class="flex flex-col items-center gap-1.5 {pileCardWidth()}">
					<div class="relative w-full" use:cardLocation={'discard'}>
						{#each v.discardUnder as under, i (i)}
							<div class="absolute inset-0" style:rotate="{tilt(under)}deg">
								<PlayingCard card={under} />
							</div>
						{/each}
						<div
							class="relative"
							style:rotate="{v.discardTop ? tilt(v.discardTop) : 0}deg"
							style:visibility={client.isFlightTarget('discard') ? 'hidden' : 'visible'}
						>
							<PlayingCard
								card={v.discardTop}
								clickable={canDrawDiscard || holding}
								hinted={client.showHints && (canDrawDiscard || holding)}
								onclick={() =>
									client.send(holding ? { method: 'discardDrawn' } : { method: 'draw', from: 'discard' })}
							/>
						</div>
					</div>
					<span class="eyebrow {v.discardBurnt ? 'text-danger!' : ''}">
						{v.discardBurnt ? '🔥 burnt' : 'discard'}
					</span>
				</div>
			</div>
		{:else if resultsOpen}
			<Results onclose={() => (resultsOpen = false)} />
		{/if}

		<!-- min-height so appearing/disappearing buttons don't shift the board either -->
		<div class="flex min-h-10 flex-wrap items-start justify-center gap-2.5">
			{#if v.phase === 'initial_peek' && !self.ready}
				<button class="btn btn-gold" onclick={() => client.send({ method: 'ready' })}>
					Got it — I'm ready
				</button>
			{/if}
			{#if canDraw && !v.cambioCallerId && v.cambioAllowed}
				<button class="btn btn-danger" onclick={() => client.send({ method: 'cambio' })}>
					🔔 Call Cambio
				</button>
			{/if}
			{#if myTurn && v.turnState === 'power'}
				<button class="btn btn-muted" onclick={() => client.send({ method: 'skipPower' })}>
					Skip power
				</button>
			{/if}
			{#if myTurn && v.turnState === 'king_decide'}
				<button class="btn" onclick={() => client.send({ method: 'kingDecide', swap: true })}>
					Swap them
				</button>
				<button class="btn btn-muted" onclick={() => client.send({ method: 'kingDecide', swap: false })}>
					Keep them
				</button>
			{/if}
			{#if v.phase === 'finished' && !resultsOpen}
				<button class="btn btn-muted" onclick={() => (resultsOpen = true)}>Show scores</button>
			{/if}
			{#if v.phase === 'finished' && isHost}
				<!-- on mobile the open scoreboard is a popup carrying this button itself -->
				<button
					class="btn btn-gold {resultsOpen ? 'max-sm:hidden' : ''}"
					onclick={() => client.send({ method: 'playAgain' })}
				>
					Play another round
				</button>
			{/if}
		</div>
	</div>
</div>

<FlyingCards />

<!-- status bar: a full-width strip along the top edge, outside the board grid,
	 so the message can be any length without ever nudging the table. It lights
	 up whenever the message asks something of me. -->
<div
	class="pointer-events-none fixed inset-x-0 top-0 z-30 border-b transition-colors duration-300
		{status.urgent ? 'border-gold/40 bg-primary' : 'border-white/8 bg-panel'}"
	data-status
>
	{#key status.text}
		<p
			class="status-text px-4 py-2 text-center text-xs font-semibold sm:py-2.5 sm:text-sm
				{status.urgent ? 'text-white' : 'text-light/80'}"
		>
			{status.text}
		</p>
	{/key}
</div>

<!-- leave + room code: bottom corner, so the status bar owns the top edge -->
<div class="fixed bottom-[max(0.4rem,env(safe-area-inset-bottom))] left-1.5 z-30 flex items-center gap-1 text-xs text-light/35">
	<LeaveButton />
	<span>Room <span class="font-mono font-bold tracking-wider text-light/55">{v.gameId}</span></span>
</div>

<style>
	.mat {
		border-radius: 1.25rem;
		background:
			radial-gradient(ellipse at 50% 30%, rgb(255 255 255 / 0.06), transparent 70%),
			rgb(12 6 25 / 0.55);
		border: 1px solid rgb(255 255 255 / 0.07);
		box-shadow:
			inset 0 3px 12px rgb(0 0 0 / 0.55),
			0 1px 0 rgb(255 255 255 / 0.05);
	}
	.status-text {
		animation: status-in 260ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	@keyframes status-in {
		from {
			opacity: 0;
			translate: 0 -40%;
		}
	}
</style>
