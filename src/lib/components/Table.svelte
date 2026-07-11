<script lang="ts">
	import Seat from './Seat.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import FlyingCards from './FlyingCards.svelte';
	import { client } from '$lib/client/game.svelte';
	import { cardLocation } from '$lib/client/locations';
	import { pileCardWidth } from '$lib/client/ui';

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
	function orientationFor(position: number): 0 | 90 | 180 | -90 {
		const count = seatedPlayers.length;
		if (position === 0) return 0; // me, at the bottom
		if (count >= 4 && position === 1) return 90; // left edge of the table
		if (count >= 4 && position === count - 1) return -90; // right edge
		return 180; // across the table
	}

	const canDraw = $derived(
		myTurn && v.turnState === 'awaiting_draw' && !v.pendingGive && !client.peekWait
	);
	// while holding a drawn card, the discard pile is a drop target instead of a draw source
	const holding = $derived(myTurn && v.turnState === 'holding');

	// points board between rounds — fewest total points leads
	const standings = $derived([...v.players].sort((a, b) => a.totalPoints - b.totalPoints));

	/** Stable per-card tilt so the discard pile looks casually thrown together. */
	function tilt(card: { rank: string; suit: string }): number {
		let h = 0;
		for (const ch of card.rank + card.suit) h = (h * 31 + ch.charCodeAt(0)) % 997;
		return (h % 13) - 6; // -6° … +6°
	}
	const cambioBonus = (p: (typeof v.players)[number]) =>
		p.roundPoints !== null && p.score !== null ? p.roundPoints - p.score : 0;

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
				if (client.peekWait) return '👁️ Wait until everyone has seen the peeked card…';
				return myTurn ? 'Your turn — draw a card' : `${current}'s turn`;
			case 'holding':
				return myTurn
					? 'Swap it into your hand, or drop it on the discard pile'
					: `${current} drew a card…`;
			case 'power': {
				const labels = {
					peek_self: 'peek at one of your own cards',
					peek_other: "peek at someone else's card",
					blind_swap: 'pick two cards to swap them blindly',
					peek_swap: 'pick two cards to look at'
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
	class="grid h-dvh w-screen overflow-hidden pt-8 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-10"
	style:grid-template-areas={LAYOUTS[seatedPlayers.length] ?? LAYOUTS[6]}
	style:grid-auto-rows="minmax(0, 1fr)"
>
	{#each seatedPlayers as player, i (player.id)}
		<Seat {player} area="p{i + 1}" orientation={orientationFor(i)} />
	{/each}

	<div class="flex flex-col items-center justify-center gap-2 p-2 sm:gap-3" style="grid-area: table">
		{#if v.phase !== 'finished'}
			<div class="flex items-start gap-2 sm:gap-4">
				<!-- draw pile -->
				<div class="text-center {pileCardWidth()}" use:cardLocation={'deck'}>
					<PlayingCard
						card={v.deckCount > 0 ? 'hidden' : null}
						clickable={canDraw && v.deckCount + v.discardCount > 1}
						onclick={() => client.send({ method: 'draw', from: 'deck' })}
					/>
					<span class="text-xs text-dark/60">deck</span>
				</div>

				<!-- discard pile: a casually thrown-together stack, all face up -->
				<div class="text-center {pileCardWidth()}" use:cardLocation={'discard'}>
					<div class="relative">
						{#each v.discardUnder as under, i (i)}
							<div class="absolute inset-0" style:transform="rotate({tilt(under)}deg)">
								<PlayingCard card={under} />
							</div>
						{/each}
						<div
							class="relative"
							style:transform="rotate({v.discardTop ? tilt(v.discardTop) : 0}deg)"
							style:visibility={client.isFlightTarget('discard') ? 'hidden' : 'visible'}
						>
							<PlayingCard
								card={v.discardTop}
								clickable={(canDraw && v.discardTop !== null && !v.discardBurnt) || holding}
								droppable={holding}
								onclick={() =>
									client.send(
										holding ? { method: 'discardDrawn' } : { method: 'draw', from: 'discard' }
									)}
							/>
						</div>
					</div>
					<span class="text-xs text-dark/60">{v.discardBurnt ? '🔥 burnt' : 'discard'}</span>
				</div>
			</div>
		{:else}
			<!-- points board: on the felt on desktop, a popup on mobile so it doesn't squeeze the seats -->
			<div
				class="flex flex-col items-center gap-2 max-sm:fixed max-sm:inset-0 max-sm:z-40 max-sm:justify-center max-sm:gap-3 max-sm:bg-black/50 max-sm:p-4"
			>
				<p class="text-center text-xs font-semibold text-white sm:hidden">{status}</p>
				<table class="rounded-xl bg-white/80 text-xs shadow-sm max-sm:bg-white sm:text-sm">
				<thead>
					<tr class="text-[10px] text-dark/50 uppercase">
						<th class="px-3 pt-2 pb-1 text-left font-medium">player</th>
						<th class="px-3 pt-2 pb-1 text-right font-medium">round</th>
						<th class="px-3 pt-2 pb-1 text-right font-medium">total</th>
					</tr>
				</thead>
				<tbody>
					{#each standings as p (p.id)}
						<tr class="border-t border-dark/5 {p.id === v.selfId ? 'font-semibold' : ''}">
							<td class="max-w-32 truncate px-3 py-1 text-left">
								{#if v.winnerIds?.includes(p.id)}👑 {/if}{p.name}
							</td>
							<td class="px-3 py-1 text-right whitespace-nowrap">
								{#if cambioBonus(p) !== 0}
									<span
										class="mr-1 rounded-full px-1.5 text-[10px] text-white
											{cambioBonus(p) < 0 ? 'bg-primary' : 'bg-danger'}"
										title="Cambio {cambioBonus(p) < 0 ? 'bonus' : 'penalty'}"
									>
										🔔 {cambioBonus(p) > 0 ? '+' : ''}{cambioBonus(p)}
									</span>
								{/if}
								{p.roundPoints}
							</td>
							<td class="px-3 py-1 text-right">{p.totalPoints}</td>
						</tr>
					{/each}
				</tbody>
				</table>
				{#if v.hostId === v.selfId}
					<button class="btn sm:hidden" onclick={() => client.send({ method: 'playAgain' })}>
						Play another round
					</button>
				{/if}
			</div>
		{/if}

		<!-- min-height so appearing/disappearing buttons don't shift the board either -->
		<div class="flex min-h-8 flex-wrap items-start justify-center gap-2">
			{#if v.phase === 'initial_peek' && !self.ready}
				<button class="btn" onclick={() => client.send({ method: 'ready' })}>
					Got it — I'm ready
				</button>
			{/if}
			{#if canDraw && !v.cambioCallerId && v.cambioAllowed}
				<button class="btn bg-danger!" onclick={() => client.send({ method: 'cambio' })}>
					Call Cambio
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
				<!-- on mobile this button lives inside the results popup instead -->
				<button class="btn max-sm:hidden" onclick={() => client.send({ method: 'playAgain' })}>
					Play another round
				</button>
			{/if}
		</div>

	</div>
</div>

<FlyingCards />

<!-- status bar: a full-width strip along the top edge, outside the board grid,
	 so the message can be any length without ever nudging the table -->
<div class="pointer-events-none fixed inset-x-0 top-0 z-30 border-b border-dark/10 bg-white shadow-sm">
	<p class="px-4 py-1.5 text-center text-xs font-semibold text-dark sm:py-2 sm:text-sm">{status}</p>
</div>

<!-- room code: bottom corner, so the status bar owns the top edge -->
<div class="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 text-xs text-dark/50">
	Room <span class="font-mono font-bold">{v.gameId}</span>
</div>

<style>
	:global(.btn) {
		border-radius: var(--radius-md);
		background: var(--color-primary);
		color: white;
		padding: 0.4rem 0.8rem;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
	}
	:global(.btn:hover) {
		opacity: 0.9;
	}
</style>
