import { client } from './game.svelte';

/**
 * Card widths scale with the table: with up to 3 players there is room to
 * spare, from 4 players on everything gets more compact.
 */
export function handCardWidth(large: boolean): string {
	const compact = (client.view?.players.length ?? 0) >= 4;
	if (large) return compact ? 'w-14 sm:w-20' : 'w-20 sm:w-24';
	return compact ? 'w-9 sm:w-14' : 'w-14 sm:w-16';
}

export function pileCardWidth(): string {
	const compact = (client.view?.players.length ?? 0) >= 4;
	return compact ? 'w-12 sm:w-20' : 'w-16 sm:w-20';
}
