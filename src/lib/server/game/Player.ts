import type Card from './Card';

export default class Player {
	id: string;
	name: string | null = null;
	hand: Array<Card | null> = [];
	gamesWon = 0;
	ready = false;
	connected = true;

	constructor(id: string) {
		this.id = id;
	}

	get score(): number {
		return this.hand.reduce((sum, card) => sum + (card?.value ?? 0), 0);
	}

	get cardsLeft(): number {
		return this.hand.filter(Boolean).length;
	}

	/** Put a card into the first empty slot, or append if the hand is full. Returns the slot index. */
	receiveCard(card: Card, preferredIndex?: number): number {
		if (preferredIndex !== undefined && this.hand[preferredIndex] === null) {
			this.hand[preferredIndex] = card;
			return preferredIndex;
		}
		const emptySlot = this.hand.indexOf(null);
		if (emptySlot !== -1) {
			this.hand[emptySlot] = card;
			return emptySlot;
		}
		this.hand.push(card);
		return this.hand.length - 1;
	}
}
