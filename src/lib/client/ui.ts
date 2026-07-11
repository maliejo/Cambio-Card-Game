import { client } from './game.svelte';

/** How a player sits relative to me: 180 = across the table, 90 = left edge, -90 = right edge. */
export type Orientation = 0 | 90 | 180 | -90;

/**
 * Card widths scale with the table: with up to 3 players there is room to
 * spare, from 4 players on everything gets more compact.
 */
export function handCardWidth(large: boolean): string {
	const compact = (client.view?.players.length ?? 0) >= 4;
	// desktop windows are wide but often not tall — don't grow past w-20 there
	if (large) return compact ? 'w-14 sm:w-20' : 'w-20';
	return compact ? 'w-9 sm:w-14' : 'w-14';
}

/**
 * Sideways cards (players seated left/right of the table) are sized by HEIGHT so
 * they match the upright cards exactly — like physically rotating the same card.
 */
export function handCardHeight(): string {
	const compact = (client.view?.players.length ?? 0) >= 4;
	return compact ? 'h-9 sm:h-14' : 'h-14';
}

export function pileCardWidth(): string {
	const compact = (client.view?.players.length ?? 0) >= 4;
	return compact ? 'w-12 sm:w-20' : 'w-16 sm:w-20';
}
