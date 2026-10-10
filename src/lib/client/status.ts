import type { GameView, Power } from '$lib/shared/types';

const POWER_PROMPTS: Record<Power, string> = {
	peek_self: 'peek at one of your own cards',
	peek_other: "peek at someone else's card",
	blind_swap: 'pick two cards to swap them blindly',
	peek_swap: 'pick two cards to look at'
};

export interface Status {
	text: string;
	/** Whether the message asks ME to do something — the status bar lights up. */
	urgent: boolean;
}

/** The one-line message in the status bar: what is happening and what I should do. */
export function statusFor(v: GameView, peekWait: boolean): Status {
	const self = v.players.find((p) => p.id === v.selfId);
	const nameOf = (id: string | null) => v.players.find((p) => p.id === id)?.name ?? '';
	const myTurn = v.currentPlayerId === v.selfId;
	const mine = (text: string) => ({ text, urgent: true });
	const theirs = (text: string) => ({ text, urgent: false });

	if (v.phase === 'initial_peek') {
		return self?.ready ? theirs('Waiting for the others…') : mine('Memorize your two revealed cards!');
	}
	if (v.phase === 'finished') {
		const winners = v.players.filter((p) => v.winnerIds?.includes(p.id)).map((p) => p.name);
		return theirs(`${winners.join(' & ')} won this round!`);
	}
	if (v.pendingGive) {
		return v.pendingGive.fromId === v.selfId
			? mine('Correct flip! Click one of your cards to give it away')
			: theirs(`${nameOf(v.pendingGive.fromId)} is choosing a card to give away…`);
	}

	if (v.lastFlips) {
		return v.selfId === v.cambioCallerId
			? theirs('Last flips — the round is about to be scored…')
			: mine('Last chance! Flip a matching card now');
	}

	const current = nameOf(v.currentPlayerId);
	switch (v.turnState) {
		case 'awaiting_draw':
			if (peekWait) return theirs('Wait until everyone has seen the peeked card…');
			return myTurn ? mine('Your turn — draw a card') : theirs(`${current}'s turn`);
		case 'holding':
			return myTurn
				? mine('Swap it into your hand, or drop it on the discard pile')
				: theirs(`${current} drew a card…`);
		case 'power':
			return myTurn
				? mine(`Card power! Click to ${POWER_PROMPTS[v.activePower!]}`)
				: theirs(`${current} is using a card power…`);
		case 'king_decide':
			return myTurn ? mine('Swap the two cards you looked at?') : theirs(`${current} is deciding…`);
	}
	return theirs('');
}
