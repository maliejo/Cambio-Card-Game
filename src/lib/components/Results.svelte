<script lang="ts">
	import { client } from '$lib/client/game.svelte';
	import { statusFor } from '$lib/client/status';
	import type { PlayerView } from '$lib/shared/types';

	let { onclose }: { onclose: () => void } = $props();

	const v = $derived(client.view!);
	const isHost = $derived(v.hostId === v.selfId);
	// points board between rounds — fewest total points leads
	const standings = $derived([...v.players].sort((a, b) => a.totalPoints - b.totalPoints));

	const cambioBonus = (p: PlayerView) =>
		p.roundPoints !== null && p.score !== null ? p.roundPoints - p.score : 0;
</script>

<!-- on the felt on desktop, a popup on mobile so it doesn't squeeze the seats -->
<div
	class="flex flex-col items-center gap-3 max-sm:fixed max-sm:inset-0 max-sm:z-40 max-sm:justify-center max-sm:bg-ink/80 max-sm:p-4 max-sm:backdrop-blur-sm"
>
	<p class="text-center text-sm font-semibold text-gold sm:hidden">{statusFor(v, false).text}</p>
	<div class="panel board relative overflow-hidden">
		<!-- hide the board to look at everyone's revealed cards; the table can bring it back -->
		<button
			class="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg text-light/45 hover:bg-white/5 hover:text-light"
			onclick={onclose}
			aria-label="hide scores"
			title="Hide scores to look at the cards"
		>
			✕
		</button>
		<table class="text-xs sm:text-sm">
			<thead>
				<tr class="eyebrow">
					<th class="px-4 pt-3 pb-2 text-left font-bold">Player</th>
					<th class="px-4 pt-3 pb-2 text-right font-bold">Round</th>
					<th class="pt-3 pr-10 pb-2 pl-4 text-right font-bold">Total</th>
				</tr>
			</thead>
			<tbody>
				{#each standings as p, rank (p.id)}
					{@const winner = v.winnerIds?.includes(p.id)}
					{@const bonus = cambioBonus(p)}
					<tr
						class="row border-t border-white/6 {winner ? 'text-gold' : 'text-light/85'}
							{p.id === v.selfId ? 'font-bold' : ''}"
						style:animation-delay="{150 + rank * 90}ms"
					>
						<td class="max-w-36 truncate px-4 py-1.5 text-left">
							{#if winner}👑 {/if}{p.name}
						</td>
						<td class="px-4 py-1.5 text-right whitespace-nowrap tabular-nums">
							{#if bonus !== 0}
								<span
									class="mr-1.5 rounded px-1.5 py-px text-[10px] font-bold text-white
										{bonus < 0 ? 'bg-primary' : 'bg-danger'}"
									title="Cambio {bonus < 0 ? 'bonus' : 'penalty'}"
								>
									🔔 {bonus > 0 ? '+' : ''}{bonus}
								</span>
							{/if}
							{p.roundPoints}
						</td>
						<td class="py-1.5 pr-10 pl-4 text-right font-bold tabular-nums">{p.totalPoints}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if isHost}
		<button class="btn btn-gold sm:hidden" onclick={() => client.send({ method: 'playAgain' })}>
			Play another round
		</button>
	{:else}
		<p class="text-xs text-light/45">Waiting for the host to deal the next round…</p>
	{/if}
</div>

<style>
	.board {
		animation: rise 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	.row {
		animation: rise 360ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 12px;
		}
	}
</style>
