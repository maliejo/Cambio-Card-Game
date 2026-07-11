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

	// the caller's cards are usually locked — but that is a house rule
	const callerLocked = (id: string) => v.rules.callerLocked && id === v.cambioCallerId;

	if (v.currentPlayerId === self) {
		if (v.turnState === 'holding' && playerId === self) return 'replace';
		if (v.turnState === 'power') {
			switch (v.activePower) {
				case 'peek_self':
					return playerId === self ? 'peek' : null;
				case 'peek_other':
					return playerId !== self && !callerLocked(playerId) ? 'peek' : null;
				case 'blind_swap':
					return !callerLocked(playerId) ? 'pick' : null;
				case 'peek_swap': {
					if (callerLocked(playerId)) return null;
					// house rule: the two peeked cards may have to belong to different players —
					// after the first pick, that player's other cards stop being clickable
					// (the picked card itself stays clickable so it can be deselected)
					const alreadyPicked = client.picks.some(
						(p) => p.playerId === playerId && p.index !== index
					);
					if (v.rules.peeking === 'two_players' && alreadyPicked) return null;
					return 'pick';
				}
			}
		}
		if (v.turnState === 'king_decide') return null;
	}

	// no contextual action → tapping a card is a flip attempt, but only
	// while the flip race is open (shortly after a discard)
	if (
		client.flipOpen &&
		self !== v.cambioCallerId &&
		!callerLocked(playerId) &&
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
