import type { CardData, Power, Rank, Suit } from '$lib/shared/types';

export default class Card implements CardData {
	suit: Suit;
	rank: Rank;
	shortName: string;
	value: number;
	power: Power | null;

	constructor(rank: Rank, suit: Suit) {
		this.suit = suit;
		this.rank = rank;
		this.shortName = this.rank + this.suit;
		this.value = this.getValue();
		this.power = this.getPower();
	}

	get isRed(): boolean {
		return this.suit === 'H' || this.suit === 'D';
	}

	getValue(): number {
		const numericalValue = parseInt(this.rank);
		if (Number.isInteger(numericalValue)) return numericalValue;

		switch (this.rank) {
			case 'T':
				return 10;
			case 'J':
				return 11;
			case 'Q':
				return 12;
			case 'K':
				return this.isRed ? -1 : 13;
			case 'A':
				return 1;
			case 'F':
				return 0;
			default:
				throw new Error('Invalid card rank');
		}
	}

	getPower(): Power | null {
		switch (this.rank) {
			case '7':
			case '8':
				return 'peek_self';
			case '9':
			case 'T':
				return 'peek_other';
			case 'J':
			case 'Q':
				return 'blind_swap';
			case 'K':
				return 'king_swap';
			default:
				return null;
		}
	}

	get displayName(): string {
		const ranks: Partial<Record<Rank, string>> = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace', F: 'Joker' };
		const suits: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
		const rank = ranks[this.rank] ?? this.rank;
		return this.rank === 'F' ? rank : rank + suits[this.suit];
	}

	toData(): CardData {
		return { rank: this.rank, suit: this.suit };
	}
}
