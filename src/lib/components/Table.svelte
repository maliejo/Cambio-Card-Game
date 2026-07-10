<script lang="ts">
	import Seat from './Seat.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import FlyingCards from './FlyingCards.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';

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

	const canDraw = $derived(myTurn && v.turnState === 'awaiting_draw' && !v.pendingGive);

	const status = $derived.by(() => {
		if (v.phase === 'initial_peek') {
			return self.ready ? 'Waiting for the others…' : 'Memorize your two revealed cards!';
		}
		if (v.phase === 'finished') {
			const winners = v.players.filter((p) => v.winnerIds?.includes(p.id)).map((p) => p.name);
			return `🏆 ${winners.join(' & ')} won this round!`;
		}
		const current = v.players.find((p) => p.id === v.currentPlayerId)?.name;
		if (v.pendingGive) {
			const from = v.players.find((p) => p.id === v.pendingGive!.fromId)?.name;
			return v.pendingGive.fromId === v.selfId
				? 'Correct flip! Click one of your cards to give it away'
				: `${from} is choosing a card to give away…`;
		}
		switch (v.turnState) {
			case 'awaiting_draw':
				return myTurn ? 'Your turn — draw a card' : `${current}'s turn`;
			case 'holding':
				return myTurn
					? 'Click one of your cards to swap it in, or discard the drawn card'
					: `${current} drew a card…`;
			case 'power': {
				const labels = {
					peek_self: 'peek at one of your own cards',
					peek_other: "peek at someone else's card",
					blind_swap: 'pick two cards to swap them blindly',
					king_swap: 'pick two cards to look at'
				};
				return myTurn
					? `✨ Card power! Click to ${labels[v.activePower!]}`
					: `${current} is using a card power…`;
			}
			case 'king_decide':
				return myTurn ? 'Swap the two cards you looked at?' : `${current} is deciding…`;
		}
		return '';
	});
</script>

<div
	class="grid h-dvh w-screen overflow-hidden"
	style:grid-template-areas={LAYOUTS[seatedPlayers.length] ?? LAYOUTS[6]}
>
	{#each seatedPlayers as player, i (player.id)}
		<Seat {player} area="p{i + 1}" />
	{/each}

	<div class="flex flex-col items-center justify-center gap-3 p-2" style="grid-area: table">
		<p class="max-w-md text-center text-sm font-semibold text-dark">{status}</p>

		{#if v.phase !== 'finished'}
			<div class="flex items-start gap-4">
				<!-- draw pile -->
				<div class="w-16 text-center sm:w-20" use:cardLocation={'deck'}>
					<PlayingCard
						card={v.deckCount > 0 ? 'hidden' : null}
						clickable={canDraw && v.deckCount + v.discardCount > 1}
						onclick={() => client.send({ method: 'draw', from: 'deck' })}
					/>
					<span class="text-xs text-dark/60">deck ({v.deckCount})</span>
				</div>

				<!-- drawn card (only the holder sees its face) -->
				<div class="w-16 text-center sm:w-20" use:cardLocation={'drawn'}>
					{#if v.turnState === 'holding'}
						<PlayingCard card={v.drawnCard ?? 'hidden'} highlighted />
						<span class="text-xs text-dark/60">drawn</span>
					{:else}
						<div class="aspect-[169/245] w-full"></div>
					{/if}
				</div>

				<!-- discard pile -->
				<div class="w-16 text-center sm:w-20" use:cardLocation={'discard'}>
					<PlayingCard
						card={v.discardTop}
						clickable={canDraw && v.discardTop !== null}
						onclick={() => client.send({ method: 'draw', from: 'discard' })}
					/>
					<span class="text-xs text-dark/60">discard ({v.discardCount})</span>
				</div>
			</div>
		{/if}

		<div class="flex flex-wrap justify-center gap-2">
			{#if v.phase === 'initial_peek' && !self.ready}
				<button class="btn" onclick={() => client.send({ method: 'ready' })}>
					Got it — I'm ready
				</button>
			{/if}
			{#if canDraw && !v.cambioCallerId}
				<button class="btn bg-danger!" onclick={() => client.send({ method: 'cambio' })}>
					Call Cambio
				</button>
			{/if}
			{#if myTurn && v.turnState === 'holding'}
				<button class="btn" onclick={() => client.send({ method: 'discardDrawn' })}>
					Discard drawn card
				</button>
			{/if}
			{#if myTurn && v.turnState === 'power'}
				<button class="btn bg-gray-500!" onclick={() => client.send({ method: 'skipPower' })}>
					Skip power
				</button>
			{/if}
			{#if myTurn && v.turnState === 'king_decide'}
				<button class="btn" onclick={() => client.send({ method: 'kingDecide', swap: true })}>
					Swap them
				</button>
				<button class="btn bg-gray-500!" onclick={() => client.send({ method: 'kingDecide', swap: false })}>
					Keep them
				</button>
			{/if}
			{#if v.phase === 'finished' && v.hostId === v.selfId}
				<button class="btn" onclick={() => client.send({ method: 'playAgain' })}>
					Play another round
				</button>
			{/if}
		</div>

	</div>
</div>

<FlyingCards />

<!-- flip hint, out of the way of the seats -->
{#if client.showHints && v.phase === 'playing' && !v.pendingGive && v.discardTop && v.selfId !== v.cambioCallerId}
	<div class="fixed bottom-2 left-2 max-w-48 text-left text-xs text-dark/50">
		Spot a card matching the discard? Click it to flip — wrong flips cost you a card!
	</div>
{/if}

<!-- game log -->
<div class="pointer-events-none fixed right-2 bottom-2 flex w-64 flex-col gap-0.5 text-right">
	{#each v.log.slice(-6) as entry, i (v.log.length + i)}
		<span class="text-xs text-dark/60 {i === 5 ? 'font-semibold text-dark' : ''}">{entry}</span>
	{/each}
</div>

<!-- room code -->
<div class="fixed top-2 left-2 text-xs text-dark/50">
	Room <span class="font-mono font-bold">{v.gameId}</span>
</div>

<style>
	:global(.btn) {
		border-radius: var(--radius-md);
		background: var(--color-primary);
		color: white;
		padding: 0.5rem 1rem;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
	}
	:global(.btn:hover) {
		opacity: 0.9;
	}
</style>
