import Card from './Card';
import Deck from './Deck';
import Player from './Player';
import type {
	CardData,
	CardMove,
	CardRef,
	GameView,
	MoveEndpoint,
	Phase,
	Power,
	TurnState
} from '$lib/shared/types';

export const MAX_PLAYERS = 6;
const HAND_SIZE = 4;
const LOG_LIMIT = 30;

/** Rule violations and bad requests — the message is safe to show to the player. */
export class GameError extends Error {}

type RevealFn = (
	toPlayerIds: string[],
	cards: { ref: CardRef; card: CardData }[],
	reason: string,
	durationMs: number
) => void;

export default class Game {
	uid: string;
	players: Player[] = [];
	deck = new Deck();
	discards: Card[] = [];

	phase: Phase = 'waiting';
	currentPlayerIndex = 0;
	turnState: TurnState | null = null;
	drawnCard: Card | null = null;
	drawnFrom: 'deck' | 'discard' | null = null;
	activePower: Power | null = null;
	kingRefs: CardRef[] = [];
	cambioCallerId: string | null = null;
	finalTurnsLeft = 0;
	pendingGive: { fromId: string; toId: string; toIndex: number } | null = null;
	/** Who claimed the current discard by flipping correctly first. Resets on every turn discard. */
	flipOwnerId: string | null = null;
	winnerIds: string[] | null = null;
	log: string[] = [];

	/** Wired up by the transport layer to push transient card reveals to specific players. */
	onReveal: RevealFn = () => {};

	/** Card movements of the last action, so the client can animate them. */
	private moves: CardMove[] = [];

	private recordMove(from: MoveEndpoint, to: MoveEndpoint, faceUpCard?: Card) {
		this.moves.push({ from, to, card: faceUpCard ? faceUpCard.toData() : 'hidden' });
	}

	takeMoves(): CardMove[] {
		const moves = this.moves;
		this.moves = [];
		return moves;
	}

	constructor(uid: string) {
		this.uid = uid;
	}

	static generateUID(): string {
		// short, human friendly, no ambiguous characters (0/O, 1/I/L)
		const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
		return Array.from(
			{ length: 6 },
			() => alphabet[Math.floor(Math.random() * alphabet.length)]
		).join('');
	}

	get host(): Player | null {
		return this.players.find((p) => p.connected) ?? null;
	}

	get currentPlayer(): Player | null {
		return this.phase === 'playing' ? (this.players[this.currentPlayerIndex] ?? null) : null;
	}

	get discardTop(): Card | null {
		return this.discards[this.discards.length - 1] ?? null;
	}

	private addLog(message: string) {
		this.log.push(message);
		if (this.log.length > LOG_LIMIT) this.log.shift();
	}

	private playerById(id: string): Player {
		const player = this.players.find((p) => p.id === id);
		if (!player) throw new GameError('Unknown player');
		return player;
	}

	private cardAt(ref: CardRef): Card {
		const card = this.playerById(ref.playerId).hand[ref.index];
		if (!card) throw new GameError('There is no card in that spot');
		return card;
	}

	// ---------- lobby ----------

	addPlayer(player: Player) {
		if (this.phase !== 'waiting') throw new GameError('Game already started');
		if (this.players.length >= MAX_PLAYERS) throw new GameError('Game is full');
		this.players.push(player);
		this.addLog(`${player.name} joined the game`);
	}

	removePlayer(player: Player) {
		this.players = this.players.filter((p) => p !== player);
		this.addLog(`${player.name} left the game`);
	}

	start(by: Player) {
		if (this.phase !== 'waiting') throw new GameError('Game already started');
		if (by !== this.host) throw new GameError('Only the host can start the game');
		if (this.players.length < 2) throw new GameError('You need at least 2 players');
		this.deal();
	}

	private deal() {
		this.deck = new Deck();
		this.deck.loadFullDeck();
		this.deck.shuffle();
		this.discards = [];
		this.drawnCard = null;
		this.drawnFrom = null;
		this.activePower = null;
		this.kingRefs = [];
		this.cambioCallerId = null;
		this.pendingGive = null;
		this.flipOwnerId = null;
		this.winnerIds = null;

		for (const player of this.players) {
			player.hand = Array.from({ length: HAND_SIZE }, () => this.deck.drawCard());
			player.ready = false;
		}
		this.phase = 'initial_peek';
		this.addLog('Cards dealt — memorize your two bottom cards!');

		// everyone gets to memorize their two bottom cards until they press ready
		for (const player of this.players) {
			this.onReveal(
				[player.id],
				[2, 3].map((index) => ({
					ref: { playerId: player.id, index },
					card: player.hand[index]!.toData()
				})),
				'Memorize these two cards!',
				0
			);
		}
	}

	setReady(player: Player) {
		if (this.phase !== 'initial_peek') throw new GameError('Nothing to be ready for');
		player.ready = true;
		if (this.players.every((p) => p.ready || !p.connected)) {
			this.phase = 'playing';
			this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
			this.turnState = 'awaiting_draw';
			this.addLog(`Game started — ${this.currentPlayer?.name} goes first`);
		}
	}

	// ---------- turn actions ----------

	private assertTurn(player: Player, state: TurnState) {
		if (this.phase !== 'playing') throw new GameError('The game is not running');
		if (this.pendingGive) throw new GameError('Waiting for a card to be given away');
		if (this.currentPlayer !== player) throw new GameError('It is not your turn');
		if (this.turnState !== state) throw new GameError('You cannot do that right now');
	}

	callCambio(player: Player) {
		this.assertTurn(player, 'awaiting_draw');
		if (this.cambioCallerId) throw new GameError('Cambio has already been called');
		this.cambioCallerId = player.id;
		this.finalTurnsLeft = this.players.filter((p) => p !== player && p.connected).length;
		this.addLog(`🔔 ${player.name} called CAMBIO! Everyone gets one last turn.`);
		this.advanceTurn();
	}

	draw(player: Player, from: 'deck' | 'discard') {
		this.assertTurn(player, 'awaiting_draw');
		if (from === 'discard') {
			const card = this.discards.pop();
			if (!card) throw new GameError('The discard pile is empty');
			this.drawnCard = card;
			this.flipOwnerId = null; // new discard top, new flip race
			this.recordMove('discard', 'drawn', card); // taking from the discard is public
		} else {
			this.drawnCard = this.drawFromDeck();
			this.recordMove('deck', 'drawn');
		}
		this.drawnFrom = from;
		this.turnState = 'holding';
		this.addLog(`${player.name} drew from the ${from === 'deck' ? 'deck' : 'discard pile'}`);
	}

	replace(player: Player, index: number) {
		this.assertTurn(player, 'holding');
		const oldCard = player.hand[index];
		if (!oldCard) throw new GameError('There is no card in that spot');
		player.hand[index] = this.drawnCard;
		this.pushDiscard(oldCard);
		this.recordMove('drawn', { playerId: player.id, index });
		this.recordMove({ playerId: player.id, index }, 'discard', oldCard);
		this.addLog(`${player.name} swapped the drawn card into their hand, discarding a ${oldCard.displayName}`);
		this.endTurn();
	}

	discardDrawn(player: Player) {
		this.assertTurn(player, 'holding');
		const card = this.drawnCard!;
		this.pushDiscard(card);
		this.drawnCard = null;
		this.recordMove('drawn', 'discard', card);
		this.addLog(`${player.name} discarded the drawn ${card.displayName}`);

		// powers only trigger on cards drawn from the deck
		if (this.drawnFrom === 'deck' && card.power) {
			this.activePower = card.power;
			this.turnState = 'power';
		} else {
			this.endTurn();
		}
	}

	usePower(player: Player, targets: CardRef[]) {
		this.assertTurn(player, 'power');
		const power = this.activePower!;

		for (const ref of targets) {
			if (ref.playerId === this.cambioCallerId)
				throw new GameError('You cannot touch the cards of whoever called Cambio');
			this.cardAt(ref); // validates the slot
		}

		switch (power) {
			case 'peek_self': {
				const [ref] = targets;
				if (targets.length !== 1 || ref.playerId !== player.id)
					throw new GameError('Pick one of your own cards to peek at');
				this.onReveal([player.id], [{ ref, card: this.cardAt(ref).toData() }], 'Your card', 6000);
				this.addLog(`👁️ ${player.name} peeked at one of their own cards`);
				this.endTurn();
				break;
			}
			case 'peek_other': {
				const [ref] = targets;
				if (targets.length !== 1 || ref.playerId === player.id)
					throw new GameError("Pick someone else's card to peek at");
				this.onReveal([player.id], [{ ref, card: this.cardAt(ref).toData() }], `${this.playerById(ref.playerId).name}'s card`, 6000);
				this.addLog(`👁️ ${player.name} peeked at one of ${this.playerById(ref.playerId).name}'s cards`);
				this.endTurn();
				break;
			}
			case 'blind_swap': {
				if (targets.length !== 2) throw new GameError('Pick two cards to swap');
				const [a, b] = targets;
				if (a.playerId === b.playerId && a.index === b.index)
					throw new GameError('Pick two different cards');
				this.swapCards(a, b);
				this.addLog(
					`🔀 ${player.name} blindly swapped a card of ${this.playerById(a.playerId).name} with a card of ${this.playerById(b.playerId).name}`
				);
				this.endTurn();
				break;
			}
			case 'king_swap': {
				if (targets.length !== 2) throw new GameError('Pick two cards to look at');
				const [a, b] = targets;
				if (a.playerId === b.playerId && a.index === b.index)
					throw new GameError('Pick two different cards');
				this.kingRefs = targets;
				this.onReveal(
					[player.id],
					targets.map((ref) => ({ ref, card: this.cardAt(ref).toData() })),
					'Swap these two cards?',
					0
				);
				this.turnState = 'king_decide';
				this.addLog(`👑 ${player.name} is looking at two cards...`);
				break;
			}
		}
	}

	skipPower(player: Player) {
		this.assertTurn(player, 'power');
		this.addLog(`${player.name} skipped the card power`);
		this.endTurn();
	}

	kingDecide(player: Player, swap: boolean) {
		this.assertTurn(player, 'king_decide');
		if (swap) {
			const [a, b] = this.kingRefs;
			this.swapCards(a, b);
			this.addLog(`👑 ${player.name} swapped the two cards they looked at`);
		} else {
			this.addLog(`👑 ${player.name} left the two cards where they are`);
		}
		this.endTurn();
	}

	private swapCards(a: CardRef, b: CardRef) {
		const playerA = this.playerById(a.playerId);
		const playerB = this.playerById(b.playerId);
		const cardA = this.cardAt(a);
		const cardB = this.cardAt(b);
		playerA.hand[a.index] = cardB;
		playerB.hand[b.index] = cardA;
		this.recordMove(a, b);
		this.recordMove(b, a);
	}

	// ---------- flipping (allowed at any time while playing) ----------

	flip(player: Player, ref: CardRef) {
		if (this.phase !== 'playing') throw new GameError('The game is not running');
		if (this.pendingGive) throw new GameError('Waiting for a card to be given away');
		if (player.id === this.cambioCallerId)
			throw new GameError('You called Cambio — no more flipping for you');
		if (ref.playerId === this.cambioCallerId)
			throw new GameError('You cannot touch the cards of whoever called Cambio');
		const top = this.discardTop;
		if (!top) throw new GameError('There is nothing on the discard pile yet');
		const card = this.cardAt(ref);
		const owner = this.playerById(ref.playerId);

		// everyone sees which card was flipped, right or wrong
		this.onReveal(
			this.players.map((p) => p.id),
			[{ ref, card: card.toData() }],
			`${player.name} flipped this card`,
			4000
		);

		const someoneElseWasFirst = this.flipOwnerId !== null && this.flipOwnerId !== player.id;
		if (card.rank === top.rank && !someoneElseWasFirst) {
			owner.hand[ref.index] = null;
			this.pushDiscard(card);
			this.flipOwnerId = player.id; // pushDiscard resets it, claim it back
			this.recordMove(ref, 'discard', card);

			if (owner === player) {
				this.addLog(`⚡ ${player.name} flipped their own ${card.displayName} — one card less!`);
			} else if (player.cardsLeft === 0) {
				this.addLog(`⚡ ${player.name} flipped ${owner.name}'s ${card.displayName} but has no card to give`);
			} else {
				this.pendingGive = { fromId: player.id, toId: owner.id, toIndex: ref.index };
				this.addLog(`⚡ ${player.name} flipped ${owner.name}'s ${card.displayName} and now gives them a card`);
			}
		} else {
			const reason = someoneElseWasFirst ? 'was too slow' : 'flipped wrong';
			const slot = player.receiveCard(this.drawFromDeck());
			this.recordMove('deck', { playerId: player.id, index: slot });
			this.addLog(`❌ ${player.name} ${reason} (${card.displayName} on a ${top.displayName}) and gains a penalty card`);
		}

		this.checkForEmptyHands();
	}

	give(player: Player, index: number) {
		if (!this.pendingGive || this.pendingGive.fromId !== player.id)
			throw new GameError('You have no card to give away');
		const card = player.hand[index];
		if (!card) throw new GameError('There is no card in that spot');
		player.hand[index] = null;
		const receiver = this.playerById(this.pendingGive.toId);
		const slot = receiver.receiveCard(card, this.pendingGive.toIndex);
		this.recordMove({ playerId: player.id, index }, { playerId: receiver.id, index: slot });
		this.addLog(`${player.name} gave a card to ${receiver.name}`);
		this.pendingGive = null;
	}

	/** Someone flipped away their last card — the round ends immediately, they cannot do better. */
	private checkForEmptyHands() {
		const emptied = this.players.find((p) => p.cardsLeft === 0 && !this.pendingGive);
		if (emptied) {
			this.addLog(`${emptied.name} has no cards left!`);
			this.finish();
		}
	}

	// ---------- turn/round bookkeeping ----------

	private pushDiscard(card: Card) {
		this.discards.push(card);
		this.flipOwnerId = null;
	}

	private drawFromDeck(): Card {
		if (this.deck.count === 0) {
			// shuffle everything but the top discard back into the deck
			const top = this.discards.pop() ?? null;
			this.deck = new Deck(this.discards);
			this.discards = top ? [top] : [];
			this.deck.shuffle();
			if (this.deck.count === 0) throw new GameError('No cards left to draw');
			this.addLog('Deck was empty — discard pile shuffled back in');
		}
		return this.deck.drawCard();
	}

	private endTurn() {
		this.drawnCard = null;
		this.drawnFrom = null;
		this.activePower = null;
		this.kingRefs = [];
		this.turnState = 'awaiting_draw';

		if (this.phase !== 'playing') return; // a flip may have ended the round mid-turn

		if (this.cambioCallerId) {
			this.finalTurnsLeft--;
			if (this.finalTurnsLeft <= 0) return this.finish();
		}
		this.advanceTurn();
	}

	private advanceTurn() {
		for (let step = 1; step <= this.players.length; step++) {
			const candidate = this.players[(this.currentPlayerIndex + step) % this.players.length];
			if (candidate.connected && candidate.id !== this.cambioCallerId) {
				this.currentPlayerIndex = this.players.indexOf(candidate);
				this.turnState = 'awaiting_draw';
				return;
			}
		}
		this.finish(); // nobody left who can take a turn
	}

	private finish() {
		this.phase = 'finished';
		this.turnState = null;
		this.pendingGive = null;

		const scores = this.players.map((p) => p.score);
		const minScore = Math.min(...scores);
		let winners = this.players.filter((p) => p.score === minScore);
		// the caller loses ties: "If someone else ties you or has fewer points, they win!"
		if (winners.length > 1 && this.cambioCallerId)
			winners = winners.filter((p) => p.id !== this.cambioCallerId) || winners;

		this.winnerIds = winners.map((p) => p.id);
		winners.forEach((p) => p.gamesWon++);
		this.addLog(`🏆 ${winners.map((p) => p.name).join(' & ')} won with ${minScore} points!`);
	}

	playAgain(by: Player) {
		if (this.phase !== 'finished') throw new GameError('The round is not over yet');
		if (by !== this.host) throw new GameError('Only the host can start the next round');
		this.deal();
	}

	// ---------- connection handling ----------

	handleDisconnect(player: Player) {
		player.connected = false;
		if (this.phase === 'waiting' || this.phase === 'finished') {
			this.removePlayer(player);
			return;
		}
		this.addLog(`${player.name} disconnected`);

		if (this.pendingGive?.fromId === player.id) {
			const index = player.hand.findIndex(Boolean);
			if (index !== -1) this.give(player, index);
			else this.pendingGive = null;
		}

		if (this.phase === 'initial_peek') {
			this.setReady(player); // don't block the others
			return;
		}

		if (this.phase === 'playing' && this.currentPlayer === player) {
			// abandon their turn: discard whatever they were holding, no power
			if (this.drawnCard) this.pushDiscard(this.drawnCard);
			this.endTurn();
		}

		if (this.phase === 'playing' && this.players.filter((p) => p.connected).length < 2) {
			this.finish();
		}
	}

	// ---------- per-player serialization ----------

	viewFor(player: Player): GameView {
		const revealed = this.phase === 'finished';
		return {
			gameId: this.uid,
			phase: this.phase,
			hostId: this.host?.id ?? '',
			selfId: player.id,
			players: this.players.map((p) => ({
				id: p.id,
				name: p.name ?? '???',
				connected: p.connected,
				ready: p.ready,
				gamesWon: p.gamesWon,
				hand: p.hand.map((card) => (card ? (revealed ? card.toData() : 'hidden') : null)),
				score: revealed ? p.score : null
			})),
			deckCount: this.deck.count,
			discardTop: this.discardTop?.toData() ?? null,
			discardCount: this.discards.length,
			currentPlayerId: this.currentPlayer?.id ?? null,
			turnState: this.turnState,
			drawnCard: this.currentPlayer === player ? (this.drawnCard?.toData() ?? null) : null,
			drawnFrom: this.drawnFrom,
			activePower: this.activePower,
			kingRefs: this.kingRefs,
			cambioCallerId: this.cambioCallerId,
			pendingGive: this.pendingGive
				? { fromId: this.pendingGive.fromId, toId: this.pendingGive.toId }
				: null,
			winnerIds: this.winnerIds,
			log: this.log
		};
	}
}
