export type Suit = 'S' | 'D' | 'H' | 'C';
export type Rank =
	| 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K'
	| 'F'; // F stands for Joker. F as in Funny
export type Power = 'peek_self' | 'peek_other' | 'blind_swap' | 'king_swap';

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
	connected: boolean;
	ready: boolean;
	gamesWon: number;
	hand: HandSlot[];
	score: number | null;
}

export interface GameView {
	gameId: string;
	phase: Phase;
	hostId: string;
	selfId: string;
	players: PlayerView[];
	deckCount: number;
	discardTop: CardData | null;
	discardCount: number;
	currentPlayerId: string | null;
	turnState: TurnState | null;
	/** The card the current player is holding — only sent to that player. */
	drawnCard: CardData | null;
	drawnFrom: 'deck' | 'discard' | null;
	activePower: Power | null;
	/** The two cards picked for a king peek — only meaningful to the current player. */
	kingRefs: CardRef[];
	cambioCallerId: string | null;
	/** Whether YOU are allowed to call Cambio (your hand is worth 5 points or less). */
	cambioAllowed: boolean;
	/** How long flipping is still allowed (ms) — flips are only open briefly after a discard. */
	flipRemainingMs: number;
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
	| {
			method: 'resume';
			token: string;
			/** True when the token comes from this very tab (reload) — may displace a live socket. */
			takeover: boolean;
	  }
	| { method: 'start' }
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
	| { method: 'error'; message: string };
