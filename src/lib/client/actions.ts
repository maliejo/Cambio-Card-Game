import { client } from './game.svelte';

export type CardAction = 'replace' | 'give' | 'peek' | 'pick' | 'flip';

/**
 * What clicking a hand card would currently do. Contextual actions (replace,
 * power targets, giving) win; when nothing else applies, a click is a flip attempt.
 */
export function actionFor(playerId: string, index: number): CardAction | null {
	const v = client.view;
	if (!v || v.phase !== 'playing') return null;
	const self = v.selfId;
	const slot = v.players.find((p) => p.id === playerId)?.hand[index];
	if (slot === null || slot === undefined) return null;

	if (v.pendingGive) {
		return v.pendingGive.fromId === self && playerId === self ? 'give' : null;
	}

	if (v.currentPlayerId === self) {
		if (v.turnState === 'holding' && playerId === self) return 'replace';
		if (v.turnState === 'power') {
			switch (v.activePower) {
				case 'peek_self':
					return playerId === self ? 'peek' : null;
				case 'peek_other':
					return playerId !== self && playerId !== v.cambioCallerId ? 'peek' : null;
				case 'blind_swap':
				case 'king_swap':
					return playerId !== v.cambioCallerId ? 'pick' : null;
			}
		}
		if (v.turnState === 'king_decide') return null;
	}

	// no contextual action → tapping a card is a flip attempt, but only
	// while the flip race is open (shortly after a discard)
	if (
		client.flipOpen &&
		self !== v.cambioCallerId &&
		playerId !== v.cambioCallerId &&
		v.discardTop
	) {
		return 'flip';
	}
	return null;
}

export function handleCardClick(playerId: string, index: number) {
	switch (actionFor(playerId, index)) {
		case 'replace':
			client.send({ method: 'replace', index });
			break;
		case 'give':
			client.send({ method: 'give', index });
			break;
		case 'peek':
			client.send({ method: 'power', targets: [{ playerId, index }] });
			break;
		case 'pick':
			client.togglePick({ playerId, index });
			break;
		case 'flip':
			client.send({ method: 'flip', playerId, index });
			break;
	}
}
