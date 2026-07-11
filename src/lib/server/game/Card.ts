// relative import: this file is loaded by vite.config.ts where the $lib alias does not exist
import { DEFAULT_RULES, type CardData, type Power, type Rank, type Rules, type Suit } from '../../shared/types';

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
		return this.suit === 'H' || this.suit === 'D';
	}

	getValue(rules: Rules): number {
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
				// red kings are the best cards in the game, black kings the worst
				return this.isRed ? rules.redKingValue : rules.blackKingValue;
			case 'A':
				return 1;
			case 'F':
				return 0;
			default:
				throw new Error('Invalid card rank');
		}
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
		const ranks: Partial<Record<Rank, string>> = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace', F: 'Joker' };
		const suits: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
		const rank = ranks[this.rank] ?? this.rank;
		return this.rank === 'F' ? rank : rank + suits[this.suit];
	}

	toData(): CardData {
		return { rank: this.rank, suit: this.suit };
	}
}
