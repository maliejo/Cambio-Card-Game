import Card from './Card';
// relative import: this file is loaded by vite.config.ts where the $lib alias does not exist
import { DEFAULT_RULES, RANKS, SUITS, type Rules } from '../../shared/types';

export default class Deck {
	cards: Card[];

	constructor(cards: Card[] = []) {
		this.cards = cards;
	}

	/** All 52 cards plus one black and one red joker. */
	loadFullDeck(rules: Rules = DEFAULT_RULES) {
		for (const suit of SUITS) {
			for (const rank of RANKS) this.cards.push(new Card(rank, suit, rules));
		}
		this.cards.push(new Card('F', 'C', rules), new Card('F', 'H', rules));
	}

	shuffle() {
		shuffle(this.cards);
	}

	drawCard(): Card {
		const card = this.cards.shift();
		if (!card) throw new Error('deck is empty! should not happen');
		return card;
	}

	get count(): number {
		return this.cards.length;
	}
}

/** Fisher-Yates in place — sort(() => Math.random() - 0.5) is biased. */
export function shuffle<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}
