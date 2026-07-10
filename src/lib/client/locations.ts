import type { MoveEndpoint } from '$lib/shared/types';

/**
 * Registry of where each card location lives on screen, so flying-card
 * animations know their start and end points. Keys: 'deck', 'discard',
 * 'drawn' and '<playerId>:<index>' for hand slots.
 */
export const cardLocations = new Map<string, HTMLElement>();

export function endpointKey(endpoint: MoveEndpoint): string {
	return typeof endpoint === 'string' ? endpoint : `${endpoint.playerId}:${endpoint.index}`;
}

/** Svelte action: register this element as a card location. */
export function cardLocation(node: HTMLElement, key: string) {
	cardLocations.set(key, node);
	return {
		update(newKey: string) {
			if (cardLocations.get(key) === node) cardLocations.delete(key);
			key = newKey;
			cardLocations.set(key, node);
		},
		destroy() {
			if (cardLocations.get(key) === node) cardLocations.delete(key);
		}
	};
}
