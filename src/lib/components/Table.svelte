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

	const canDraw = $derived(myTurn && v.turnState === 'awaiting_draw' && !v.pendingGive);

	// points board between rounds — fewest total points leads
	const standings = $derived([...v.players].sort((a, b) => a.totalPoints - b.totalPoints));
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
	class="grid h-dvh w-screen overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
	style:grid-template-areas={LAYOUTS[seatedPlayers.length] ?? LAYOUTS[6]}
	style:grid-auto-rows="minmax(0, 1fr)"
>
	{#each seatedPlayers as player, i (player.id)}
		<Seat {player} area="p{i + 1}" orientation={orientationFor(i)} />
	{/each}

	<div class="flex flex-col items-center justify-center gap-2 p-2 sm:gap-3" style="grid-area: table">
		<p class="max-w-md text-center text-xs font-semibold text-dark sm:text-sm">{status}</p>

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

				<!-- discard pile -->
				<div
					class="text-center {pileCardWidth()}"
					style:visibility={client.isFlightTarget('discard') ? 'hidden' : 'visible'}
					use:cardLocation={'discard'}
				>
					<PlayingCard
						card={v.discardTop}
						clickable={canDraw && v.discardTop !== null && !v.discardBurnt}
						onclick={() => client.send({ method: 'draw', from: 'discard' })}
					/>
					<span class="text-xs text-dark/60">{v.discardBurnt ? '🔥 burnt' : 'discard'}</span>
				</div>
			</div>
		{:else}
			<!-- points board: this round + running total across rounds -->
			<table class="rounded-xl bg-white/80 text-xs shadow-sm sm:text-sm">
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
		{/if}

		<div class="flex flex-wrap justify-center gap-2">
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

		<!-- game log: inside the table on mobile, where seats never overlap it -->
		<div class="flex max-w-full flex-col gap-0.5 overflow-hidden sm:hidden">
			{#each v.log.slice(-3) as entry, i (v.log.length + i)}
				<span
					class="truncate text-center text-[10px] leading-tight
						{entry === v.log.at(-1) ? 'font-medium text-dark/80' : 'text-dark/40'}"
				>
					{entry}
				</span>
			{/each}
		</div>
	</div>
</div>

<!-- game log: bottom right corner on desktop, where there is plenty of room -->
<div class="pointer-events-none fixed right-2 bottom-2 hidden w-72 flex-col gap-0.5 text-right sm:flex">
	{#each v.log.slice(-6) as entry, i (v.log.length + i)}
		<span class="text-xs {entry === v.log.at(-1) ? 'font-semibold text-dark/80' : 'text-dark/50'}">
			{entry}
		</span>
	{/each}
</div>

<FlyingCards />

<!-- flip hint, only while the flip race is open -->
{#if client.showHints && v.phase === 'playing' && !v.pendingGive && client.flipOpen && v.selfId !== v.cambioCallerId}
	<div class="fixed bottom-2 left-2 max-w-48 text-left text-xs text-dark/50">
		⚡ Flip race! Tap a card matching the discard — wrong flips cost you a card.
	</div>
{/if}

<!-- room code -->
<div class="fixed top-2 left-2 text-xs text-dark/50">
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
