import Card from './Card';
import type { Rank, Suit } from '$lib/shared/types';

export default class Deck {
	cards: Card[];

	constructor(cards: Card[] = []) {
		this.cards = cards;
	}

	loadFullDeck() {
		const cardsTemplates = [
			'AC', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC', 'JC', 'QC', 'KC',
			'AD', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', 'TD', 'JD', 'QD', 'KD',
			'AH', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH', 'JH', 'QH', 'KH',
			'AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS',
			'FC', 'FH' // one black joker, one red joker
		];

		cardsTemplates.forEach((template) =>
			this.cards.push(new Card(template[0] as Rank, template[1] as Suit))
		);
	}

	shuffle() {
		// Fisher-Yates — sort(() => Math.random() - 0.5) is biased
		for (let i = this.cards.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
		}
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
