// relative import: this file is loaded by vite.config.ts where the $lib alias does not exist
import {
	DEFAULT_RULES,
	SUIT_SYMBOLS,
	isRed,
	type CardData,
	type Power,
	type Rank,
	type Rules,
	type Suit
} from '../../shared/types';

const FIXED_VALUES: Partial<Record<Rank, number>> = { A: 1, T: 10, J: 11, Q: 12, F: 0 };
const RANK_NAMES: Partial<Record<Rank, string>> = {
	A: 'Ace',
	T: '10',
	J: 'Jack',
	Q: 'Queen',
	K: 'King',
	F: 'Joker'
};

export default class Card implements CardData {
	suit: Suit;
	rank: Rank;
	shortName: string;
	value: number;
	power: Power | null;

	constructor(rank: Rank, suit: Suit, rules: Rules = DEFAULT_RULES) {
		this.suit = suit;
		this.rank = rank;
		this.shortName = this.rank + this.suit;
		this.value = this.getValue(rules);
		this.power = this.getPower(rules);
	}

	get isRed(): boolean {
		return isRed(this.suit);
	}

	getValue(rules: Rules): number {
		// red kings are the best cards in the game, black kings the worst
		if (this.rank === 'K') return this.isRed ? rules.redKingValue : rules.blackKingValue;
		const value = FIXED_VALUES[this.rank] ?? parseInt(this.rank);
		if (!Number.isInteger(value)) throw new Error('Invalid card rank');
		return value;
	}

	getPower(rules: Rules): Power | null {
		switch (this.rank) {
			case '7':
			case '8':
				return 'peek_self';
			case '9':
			case 'T':
				return 'peek_other';
			case 'J':
				return 'blind_swap';
			case 'Q':
				return rules.powers === 'queen' ? 'peek_swap' : 'blind_swap';
			case 'K':
				// by default the king has no power at all — it is just a bad card
				return rules.powers === 'king' ? 'peek_swap' : null;
			default:
				return null;
		}
	}

	get displayName(): string {
		const rank = RANK_NAMES[this.rank] ?? this.rank;
		return this.rank === 'F' ? rank : rank + SUIT_SYMBOLS[this.suit];
	}

	toData(): CardData {
		return { rank: this.rank, suit: this.suit };
	}
}
