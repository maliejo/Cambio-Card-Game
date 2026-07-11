import Game, { GameError } from './game/Game';
import Player from './game/Player';
import type Card from './game/Card';
import type { BotDifficulty, CardRef } from '../shared/types';

/** What a face-down card is assumed to be worth — the deck averages ~6 points. */
const UNKNOWN_VALUE = 6;

const BOT_NAMES = ['Ada', 'Bender', 'Chip', 'Clank', 'Eliza', 'Gizmo', 'Hal', 'Rusty', 'Wall-E'];

interface Profile {
	/** How long a normal turn decision takes: [min, max] ms. */
	think: [number, number];
	/** How fast they spot a flippable duplicate: [min, max] ms. */
	flipReaction: [number, number];
	/** Chance they go for a flip they spotted at all. */
	flipChance: number;
	/** Chance the flip hits the right card — a miss grabs a neighboring slot instead. */
	flipAccuracy: number;
	/** Chance they use a card power when it would help — below 1 they sometimes just feel overwhelmed. */
	powerUse: number;
	/** They call Cambio once they know their whole hand and it is worth at most this. */
	cambioAt: number;
	/** The highest discard value they bother picking up (if it also beats their worst slot). */
	discardGreed: number;
}

/** Exported so the numbers are easy to tune after playtesting. */
export const PROFILES: Record<BotDifficulty, Profile> = {
	easy: {
		think: [1800, 4200],
		flipReaction: [2600, 5400],
		flipChance: 0.5,
		flipAccuracy: 0.65,
		powerUse: 0.55,
		cambioAt: 2,
		discardGreed: 1
	},
	medium: {
		think: [1200, 3000],
		flipReaction: [1300, 3200],
		flipChance: 0.8,
		flipAccuracy: 0.85,
		powerUse: 0.9,
		cambioAt: 3,
		discardGreed: 2
	},
	hard: {
		think: [700, 1900],
		flipReaction: [500, 1400],
		flipChance: 0.97,
		flipAccuracy: 0.96,
		powerUse: 1,
		cambioAt: 5,
		discardGreed: 4
	}
};

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
const pick = <T>(options: T[]): T => options[Math.floor(Math.random() * options.length)];

interface Slot {
	index: number;
	card: Card;
	est: number;
}

/** Every filled slot of `owner`, valued through the bot's eyes (unseen cards count as average). */
function slotsOf(bot: Player, owner: Player = bot): Slot[] {
	const slots: Slot[] = [];
	owner.hand.forEach((card, index) => {
		if (card) slots.push({ index, card, est: bot.known.has(card) ? card.value : UNKNOWN_VALUE });
	});
	return slots;
}

/** The slot the bot most wants to get rid of. */
function worstSlot(bot: Player): Slot | null {
	return slotsOf(bot).reduce<Slot | null>((w, s) => (!w || s.est > w.est ? s : w), null);
}

/** Everyone else whose cards may legally be targeted. */
function opponents(game: Game, bot: Player): Player[] {
	return game.players.filter(
		(p) => p !== bot && !(game.rules.callerLocked && p.id === game.cambioCallerId)
	);
}

/** What a bot wants to do next and how long it pretends to think about it. */
interface Plan {
	/** Replans with the same key keep the already-running timer. */
	key: string;
	delayMs: number;
	act: () => void;
}

interface BotSeat {
	player: Player;
	profile: Profile;
	timer: ReturnType<typeof setTimeout> | null;
	planKey: string | null;
	/** One dice roll per flip race, so replanning never rerolls the reaction. */
	race: { key: string; attempt: boolean; accurate: boolean; delayMs: number } | null;
}

/**
 * Drives bot players from the outside, through the same Game methods a human uses.
 * After every state broadcast each bot computes a plan and runs it on a humanlike timer.
 */
export class BotManager {
	private seats = new Map<Game, BotSeat[]>();

	constructor(private broadcast: (game: Game) => void) {}

	addBots(game: Game, difficulty: BotDifficulty, count: number) {
		const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
		const seats = names.map((name) => {
			const player = new Player(`bot-${crypto.randomUUID()}`, true);
			player.name = name;
			game.addPlayer(player);
			return { player, profile: PROFILES[difficulty], timer: null, planKey: null, race: null };
		});
		this.seats.set(game, seats);
	}

	has(game: Game): boolean {
		return this.seats.has(game);
	}

	/** Freeze all pending bot actions (the human left) — the next onState resumes them. */
	pause(game: Game) {
		for (const seat of this.seats.get(game) ?? []) {
			if (seat.timer) clearTimeout(seat.timer);
			seat.timer = null;
			seat.planKey = null;
		}
	}

	dispose(game: Game) {
		this.pause(game);
		this.seats.delete(game);
	}

	/** Called after every state broadcast — (re)schedules what each bot wants to do next. */
	onState(game: Game) {
		for (const seat of this.seats.get(game) ?? []) this.schedule(game, seat);
	}

	private schedule(game: Game, seat: BotSeat) {
		const plan = this.planFor(game, seat);
		if (!plan) {
			if (seat.timer) clearTimeout(seat.timer);
			seat.timer = null;
			seat.planKey = null;
			return;
		}
		if (plan.key === seat.planKey) return; // already underway — keep the running timer
		if (seat.timer) clearTimeout(seat.timer);
		seat.planKey = plan.key;
		seat.timer = setTimeout(() => {
			seat.timer = null;
			seat.planKey = null;
			try {
				plan.act();
			} catch (error) {
				// an illegal move just means the state changed under us — the broadcast replans
				if (!(error instanceof GameError)) console.error('bot error:', error);
			}
			this.broadcast(game);
		}, plan.delayMs);
	}

	private planFor(game: Game, seat: BotSeat): Plan | null {
		const bot = seat.player;
		const profile = seat.profile;

		if (game.phase === 'initial_peek') {
			if (bot.ready) return null;
			return { key: 'ready', delayMs: between(profile.think) + 1200, act: () => game.setReady(bot) };
		}
		if (game.phase !== 'playing') return null;

		if (game.pendingGive) {
			if (game.pendingGive.fromId !== bot.id) return null; // flips are frozen anyway — wait
			return {
				key: 'give',
				delayMs: between(profile.think),
				act: () => {
					const worst = worstSlot(bot);
					if (worst) game.give(bot, worst.index);
				}
			};
		}

		// a flip chance trumps the own turn — the race window is short
		const flip = this.flipPlan(game, seat);
		if (flip) return flip;

		if (game.currentPlayer !== bot) return null;
		switch (game.turnState) {
			case 'awaiting_draw':
				return this.drawPlan(game, seat);
			case 'holding':
				return this.holdPlan(game, seat);
			case 'power':
				return this.powerPlan(game, seat);
			case 'king_decide':
				return this.decidePlan(game, seat);
		}
		return null;
	}

	// ---------- turn plans ----------

	private drawPlan(game: Game, seat: BotSeat): Plan {
		const bot = seat.player;
		const profile = seat.profile;
		// a running peek blocks the draw — politely wait it out
		const peekMs = game.peekUntil ? Math.max(0, game.peekUntil - Date.now()) : 0;
		return {
			key: `turn:${game.turnCount}:draw`,
			delayMs: peekMs + between(profile.think),
			act: () => {
				if (!game.cambioCallerId && bot.knowsWholeHand && bot.score <= profile.cambioAt)
					return game.callCambio(bot);
				const top = game.discardTop;
				const worst = worstSlot(bot);
				if (
					top &&
					worst &&
					!game.burntCards.has(top) &&
					top.value <= profile.discardGreed &&
					top.value < worst.est - 1
				)
					return game.draw(bot, 'discard');
				game.draw(bot, 'deck');
			}
		};
	}

	private holdPlan(game: Game, seat: BotSeat): Plan {
		const bot = seat.player;
		const profile = seat.profile;
		return {
			key: `turn:${game.turnCount}:hold`,
			delayMs: between(profile.think),
			act: () => {
				const drawn = game.drawnCard;
				if (!drawn) return;
				const worst = worstSlot(bot);
				// a power card is worth discarding for its power unless swapping is clearly better
				const wantsPower =
					game.drawnFrom === 'deck' && drawn.power !== null && Math.random() < profile.powerUse;
				const margin = wantsPower ? 2 : 0;
				if (worst && drawn.value < worst.est - margin) return game.replace(bot, worst.index);
				game.discardDrawn(bot);
			}
		};
	}

	private powerPlan(game: Game, seat: BotSeat): Plan {
		const bot = seat.player;
		const profile = seat.profile;
		return {
			key: `turn:${game.turnCount}:power:${game.activePower}`,
			delayMs: between(profile.think),
			act: () => {
				const skip = () => game.skipPower(bot);
				// weaker bots sometimes get overwhelmed and let a useful power slide
				if (Math.random() >= profile.powerUse) return skip();

				const oppSlots: { ref: CardRef; card: Card }[] = [];
				for (const opp of opponents(game, bot))
					for (const s of slotsOf(bot, opp))
						oppSlots.push({ ref: { playerId: opp.id, index: s.index }, card: s.card });
				const oppUnknown = oppSlots.filter((s) => !bot.known.has(s.card));

				switch (game.activePower) {
					case 'peek_self': {
						const unknown = slotsOf(bot).filter((s) => !bot.known.has(s.card));
						if (!unknown.length) return skip(); // nothing left to learn
						return game.usePower(bot, [{ playerId: bot.id, index: pick(unknown).index }]);
					}
					case 'peek_other': {
						if (!oppUnknown.length) return skip();
						return game.usePower(bot, [pick(oppUnknown).ref]);
					}
					case 'blind_swap': {
						const worst = worstSlot(bot);
						if (!worst) return skip();
						const mine: CardRef = { playerId: bot.id, index: worst.index };
						// best: trade the worst card for one they know is low in someone else's hand
						let bestKnown: { ref: CardRef; value: number } | null = null;
						for (const s of oppSlots) {
							if (!bot.known.has(s.card)) continue;
							if (!bestKnown || s.card.value < bestKnown.value)
								bestKnown = { ref: s.ref, value: s.card.value };
						}
						if (bestKnown && bestKnown.value < worst.est - 1)
							return game.usePower(bot, [mine, bestKnown.ref]);
						// gamble: a known-bad card for a random unknown one
						if (worst.est >= UNKNOWN_VALUE + 2 && oppUnknown.length)
							return game.usePower(bot, [mine, pick(oppUnknown).ref]);
						return skip();
					}
					case 'peek_swap': {
						const ownUnknown = slotsOf(bot).filter((s) => !bot.known.has(s.card));
						const targets: CardRef[] = [];
						if (game.rules.peeking === 'same_player' && ownUnknown.length >= 2) {
							// house rule permitting: learn two of their own cards at once
							targets.push(
								{ playerId: bot.id, index: ownUnknown[0].index },
								{ playerId: bot.id, index: ownUnknown[1].index }
							);
						} else if (ownUnknown.length && oppSlots.length) {
							targets.push(
								{ playerId: bot.id, index: pick(ownUnknown).index },
								pick(oppUnknown.length ? oppUnknown : oppSlots).ref
							);
						} else if (oppSlots.length) {
							// they know their own hand — scout the table instead
							const first = pick(oppUnknown.length ? oppUnknown : oppSlots).ref;
							const otherPlayer = oppSlots.filter((s) => s.ref.playerId !== first.playerId);
							const second =
								game.rules.peeking === 'same_player'
									? oppSlots.filter(
											(s) => s.ref.playerId !== first.playerId || s.ref.index !== first.index
										)
									: otherPlayer;
							const worst = worstSlot(bot);
							if (second.length) targets.push(first, pick(second).ref);
							else if (worst) targets.push({ playerId: bot.id, index: worst.index }, first);
							else return skip();
						} else {
							return skip();
						}
						return game.usePower(bot, targets);
					}
				}
				return skip();
			}
		};
	}

	private decidePlan(game: Game, seat: BotSeat): Plan {
		const bot = seat.player;
		return {
			key: `turn:${game.turnCount}:decide`,
			delayMs: between(seat.profile.think),
			act: () => {
				const cardOf = (ref: CardRef) =>
					game.players.find((p) => p.id === ref.playerId)?.hand[ref.index];
				const [a, b] = game.kingRefs;
				const cardA = a && cardOf(a);
				const cardB = b && cardOf(b);
				let swap = false;
				if (cardA && cardB && (a.playerId === bot.id) !== (b.playerId === bot.id)) {
					// exactly one card is the bot's own — always take the lower one
					const mine = a.playerId === bot.id ? cardA : cardB;
					const theirs = a.playerId === bot.id ? cardB : cardA;
					swap = theirs.value < mine.value;
				}
				game.kingDecide(bot, swap);
			}
		};
	}

	// ---------- the flip race ----------

	private flipPlan(game: Game, seat: BotSeat): Plan | null {
		const bot = seat.player;
		const profile = seat.profile;
		const top = game.discardTop;
		if (!top || !game.flipUntil || Date.now() >= game.flipUntil) return null;
		if (bot.id === game.cambioCallerId) return null;
		if (!game.rules.retryFlip && game.failedFlippers.has(bot.id)) return null;
		const claimed = game.flipOwnerId !== null;
		if (game.rules.flipping === 'single' && claimed) return null;
		if (game.rules.flipping === 'first_multiple' && claimed && game.flipOwnerId !== bot.id)
			return null;
		if (!this.bestFlip(game, bot)) return null;

		const key = `flip:${game.discards.length}:${top.shortName}`;
		if (seat.race?.key !== key) {
			seat.race = {
				key,
				attempt: Math.random() < profile.flipChance,
				accurate: Math.random() < profile.flipAccuracy,
				delayMs: between(profile.flipReaction)
			};
		}
		if (!seat.race.attempt) return null; // didn't notice this one
		const { accurate, delayMs } = seat.race;

		return {
			key,
			delayMs,
			act: () => {
				const target = this.bestFlip(game, bot);
				if (!target) return;
				if (accurate) return game.flip(bot, target);
				// grabbed a neighboring slot in the rush — a very human mistake
				const owner = game.players.find((p) => p.id === target.playerId)!;
				const others = slotsOf(bot, owner).filter((s) => s.index !== target.index);
				game.flip(
					bot,
					others.length ? { playerId: owner.id, index: pick(others).index } : target
				);
			}
		};
	}

	/** The most rewarding card the bot KNOWS matches the discard, or null. */
	private bestFlip(game: Game, bot: Player): CardRef | null {
		const top = game.discardTop;
		if (!top) return null;
		const worst = worstSlot(bot);
		let best: { ref: CardRef; gain: number } | null = null;
		for (const p of game.players) {
			if (game.rules.callerLocked && p.id === game.cambioCallerId) continue;
			for (const [index, card] of p.hand.entries()) {
				if (!card || !bot.known.has(card) || card.rank !== top.rank) continue;
				// own card: sheds its points. Someone else's: a chance to dump the worst card on them.
				const gain = p === bot ? card.value : worst ? worst.est - 1 : 0;
				if (gain < 0) continue; // never flip away the own red king
				if (!best || gain > best.gain) best = { ref: { playerId: p.id, index }, gain };
			}
		}
		return best?.ref ?? null;
	}
}
