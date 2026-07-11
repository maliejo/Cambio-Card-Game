export type Suit = 'S' | 'D' | 'H' | 'C';
export type Rank =
	| 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K'
	| 'F'; // F stands for Joker. F as in Funny
export type Power = 'peek_self' | 'peek_other' | 'blind_swap' | 'peek_swap';

/** House rules, adjustable by the host in the lobby. */
export interface Rules {
	redKingValue: number;
	blackKingValue: number;
	/**
	 * Who gets which power: 'queen' = Jack swaps blind, Queen peeks at two cards and
	 * may swap them, King is just a bad card. 'king' = Jack & Queen swap blind, King peeks & swaps.
	 */
	powers: 'queen' | 'king';
	/**
	 * Whose cards the peek & swap power may target: 'two_players' = the two cards must belong
	 * to two different players (yourself included), 'same_player' = any two cards, even two of your own.
	 */
	peeking: 'two_players' | 'same_player';
	/**
	 * Who may flip a duplicate after a discard: only the fastest player ('first_multiple'
	 * lets them keep flipping, 'single' allows one card total), or 'everyone' at their leisure.
	 */
	flipping: 'first_multiple' | 'single' | 'everyone';
	/** Whether you may keep trying after a wrong flip already cost you a penalty card. */
	retryFlip: boolean;
	/** Whether the Cambio caller's cards are locked — nobody may peek, swap or flip them. */
	callerLocked: boolean;
	/** The caller's gamble: won as a bonus (negative) with the least points, taken as a penalty otherwise. */
	cambioStake: number;
}

/** Every legal value per rule — first entry is the default. The server rejects anything else. */
export const RULE_OPTIONS = {
	redKingValue: [-2, -1],
	blackKingValue: [10, 5, 20],
	powers: ['queen', 'king'],
	peeking: ['two_players', 'same_player'],
	flipping: ['first_multiple', 'single', 'everyone'],
	retryFlip: [true, false],
	callerLocked: [true, false],
	cambioStake: [5, 10]
} as const satisfies { [K in keyof Rules]: readonly Rules[K][] };

export const DEFAULT_RULES: Rules = Object.fromEntries(
	Object.entries(RULE_OPTIONS).map(([key, options]) => [key, options[0]])
) as unknown as Rules;

/** How strong practice-mode bots play: mostly their reaction speed and accuracy. */
export type BotDifficulty = 'easy' | 'medium' | 'hard';
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

export interface CardData {
	rank: Rank;
	suit: Suit;
}

export type Phase = 'waiting' | 'initial_peek' | 'playing' | 'finished';
export type TurnState = 'awaiting_draw' | 'holding' | 'power' | 'king_decide';

/** A hand slot as one player sees it: a revealed card, a face-down card, or an empty slot. */
export type HandSlot = CardData | 'hidden' | null;

export interface CardRef {
	playerId: string;
	index: number;
}

export interface PlayerView {
	id: string;
	name: string;
	isBot: boolean;
	connected: boolean;
	ready: boolean;
	gamesWon: number;
	hand: HandSlot[];
	score: number | null;
	/** Points scored in the last finished round (hand + cambio bonus). Null while a round runs. */
	roundPoints: number | null;
	/** Points collected across all rounds — lower is better. */
	totalPoints: number;
}

export interface GameView {
	gameId: string;
	phase: Phase;
	hostId: string;
	selfId: string;
	players: PlayerView[];
	deckCount: number;
	discardTop: CardData | null;
	/** Up to two cards peeking out beneath the top discard, deepest first — purely visual. */
	discardUnder: CardData[];
	/** The top discard is a flipped duplicate ("burnt") — it cannot be drawn. */
	discardBurnt: boolean;
	discardCount: number;
	currentPlayerId: string | null;
	turnState: TurnState | null;
	/** The card the current player is holding — only sent to that player. */
	drawnCard: CardData | null;
	drawnFrom: 'deck' | 'discard' | null;
	activePower: Power | null;
	/** The two cards picked for a peek-then-swap power — only meaningful to the current player. */
	kingRefs: CardRef[];
	/** The house rules this game runs under. */
	rules: Rules;
	cambioCallerId: string | null;
	/** Whether YOU may call Cambio: you have seen every card in your hand AND it is worth ≤5 points. */
	cambioAllowed: boolean;
	/** How long flipping is still allowed (ms) — flips are only open briefly after a discard. */
	flipRemainingMs: number;
	/** How long the current peek still blocks the next draw (ms) — everyone gets to finish looking. */
	peekRemainingMs: number;
	pendingGive: { fromId: string; toId: string } | null;
	winnerIds: string[] | null;
	log: string[];
}

/** Where a card can travel from/to during a move — used to animate it on the client. */
export type MoveEndpoint = 'deck' | 'discard' | 'drawn' | CardRef;

export interface CardMove {
	from: MoveEndpoint;
	to: MoveEndpoint;
	/** 'hidden' when the card travels face-down */
	card: CardData | 'hidden';
}

export type ClientMessage =
	| { method: 'create'; name: string }
	| { method: 'join'; gameId: string; name: string }
	/** Solo practice: a fresh game against three bots that starts immediately. */
	| { method: 'practice'; name: string; difficulty: BotDifficulty }
	| {
			method: 'resume';
			token: string;
			/** True when the token comes from this very tab (reload) — may displace a live socket. */
			takeover: boolean;
	  }
	| { method: 'start' }
	| { method: 'setRules'; rules: Rules }
	| { method: 'ready' }
	| { method: 'cambio' }
	| { method: 'draw'; from: 'deck' | 'discard' }
	| { method: 'replace'; index: number }
	| { method: 'discardDrawn' }
	| { method: 'power'; targets: CardRef[] }
	| { method: 'skipPower' }
	| { method: 'kingDecide'; swap: boolean }
	| { method: 'flip'; playerId: string; index: number }
	| { method: 'give'; index: number }
	| { method: 'playAgain' }
	/** Browser performance numbers, relayed server-side to analytics. */
	| { method: 'perf'; metrics: Record<string, number> };

export type ServerMessage =
	| { method: 'connected'; clientId: string }
	| {
			method: 'resumeFailed';
			/** The seat exists but is actively used elsewhere — keep the stored session. */
			seatTaken?: boolean;
	  }
	| { method: 'superseded' }
	| { method: 'state'; state: GameView }
	| { method: 'moves'; moves: CardMove[] }
	| {
			method: 'reveal';
			cards: { ref: CardRef; card: CardData }[];
			reason: string;
			/** 0 = stays visible until the current phase/turn state ends */
			durationMs: number;
	  }
	/** Someone looked at these cards — everyone sees WHICH slots, only the peeker sees the faces. */
	| {
			method: 'peeked';
			refs: CardRef[];
			byId: string;
			/** 0 = stays marked until the current phase/turn state ends */
			durationMs: number;
	  }
	| { method: 'error'; message: string };
