import type Card from './Card';

export default class Player {
	id: string;
	name: string | null = null;
	hand: Array<Card | null> = [];
	gamesWon = 0;
	ready = false;
	connected = true;
	/** Points collected across all rounds — lower is better. */
	totalPoints = 0;
	/** What the last finished round scored (hand + cambio bonus). Null while a round runs. */
	roundPoints: number | null = null;
	/** Every card this player has seen face-up. Knowledge travels with the card when it moves. */
	known = new Set<Card>();

	/** Bots live only on the server — no websocket ever binds to their id. */
	readonly isBot: boolean;

	constructor(id: string, isBot = false) {
		this.id = id;
		this.isBot = isBot;
	}

	learn(card: Card) {
		this.known.add(card);
	}

	/** Whether the player has seen every card currently in their hand. */
	get knowsWholeHand(): boolean {
		return this.hand.every((card) => !card || this.known.has(card));
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
