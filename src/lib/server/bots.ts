import Game, { GameError } from './game/Game';
import Player from './game/Player';
import type Card from './game/Card';
import type { BotDifficulty, CardRef } from '../shared/types';

/** What a face-down card is assumed to be worth — the deck averages ~6 points. */
const UNKNOWN_VALUE = 6;
/** How often a remembered card of ANOTHER player risks fading from a bot's memory. */
const FORGET_INTERVAL_MS = 30_000;

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
	/** Chance a sighting of ANOTHER player's card sticks in memory at all. Own cards always stick. */
	oppRecall: number;
	/** Chance per ~30s that a remembered card of another player fades again. */
	forgetChance: number;
	/** Chance to grab a neighboring slot when swap-targeting a remembered card ("was it left or right?"). */
	mixup: number;
	/** Whether they read a declined peek & swap as "that player kept something better". */
	infers: boolean;
}

/** Exported so the numbers are easy to tune after playtesting. */
export const PROFILES: Record<BotDifficulty, Profile> = {
	// plays along, mostly minding their own hand — barely tracks what others hold
	easy: {
		think: [1800, 4200],
		flipReaction: [2600, 5400],
		flipChance: 0.5,
		flipAccuracy: 0.65,
		powerUse: 0.55,
		cambioAt: 2,
		discardGreed: 1,
		oppRecall: 0.4,
		forgetChance: 0.45,
		mixup: 0.25,
		infers: false
	},
	// competitive: watches the table, but memory is human
	medium: {
		think: [1200, 3000],
		flipReaction: [1300, 3200],
		flipChance: 0.8,
		flipAccuracy: 0.85,
		powerUse: 0.9,
		cambioAt: 3,
		discardGreed: 2,
		oppRecall: 0.9,
		forgetChance: 0.12,
		mixup: 0.1,
		infers: true
	},
	// plays the best move it can see and never forgets
	hard: {
		think: [700, 1900],
		flipReaction: [500, 1400],
		flipChance: 0.97,
		flipAccuracy: 0.96,
		powerUse: 1,
		cambioAt: 5,
		discardGreed: 4,
		oppRecall: 1,
		forgetChance: 0,
		mixup: 0,
		infers: true
	}
};

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
const pick = <T>(options: T[]): T => options[Math.floor(Math.random() * options.length)];

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
	/** Sightings of other players' cards that stuck, mapped to when they next risk fading. */
	seen: Map<Card, number>;
	/** Cards this bot has seen but can no longer place. */
	forgotten: Set<Card>;
	/** Value estimates for cards never seen, inferred from watching (declined swaps). */
	hints: Map<Card, number>;
	/** game.startedAt the memory belongs to — a new deal wipes the table. */
	roundStamp: number;
}

interface Slot {
	index: number;
	card: Card;
	/** What the bot believes the card is worth (hints and averages fill the gaps). */
	est: number;
	/** Whether the bot can actually place this card right now. */
	known: boolean;
}

/** Whether the bot can still recall a card: the own hand always, others' cards fade. */
function recalls(seat: BotSeat, card: Card, owner: Player): boolean {
	if (!seat.player.known.has(card)) return false;
	return owner === seat.player || !seat.forgotten.has(card);
}

/** Every filled slot of `owner`, valued through the bot's eyes. */
function slotsOf(seat: BotSeat, owner: Player = seat.player): Slot[] {
	const slots: Slot[] = [];
	owner.hand.forEach((card, index) => {
		if (!card) return;
		const known = recalls(seat, card, owner);
		slots.push({ index, card, known, est: known ? card.value : (seat.hints.get(card) ?? UNKNOWN_VALUE) });
	});
	return slots;
}

/** The slot the bot most wants to get rid of. */
function worstSlot(seat: BotSeat): Slot | null {
	return slotsOf(seat).reduce<Slot | null>((w, s) => (!w || s.est > w.est ? s : w), null);
}

/** Everyone else whose cards may legally be targeted. */
function opponents(game: Game, bot: Player): Player[] {
	return game.players.filter(
		(p) => p !== bot && !(game.rules.callerLocked && p.id === game.cambioCallerId)
	);
}

/** The opponent closest to winning — fewest cards, then the lowest hand the bot can see. */
function threat(game: Game, seat: BotSeat): Player | null {
	const rivals = opponents(game, seat.player).filter((p) => p.cardsLeft > 0);
	if (!rivals.length) return null;
	const estScore = (p: Player) => slotsOf(seat, p).reduce((sum, s) => sum + s.est, 0);
	return rivals.reduce((lead, p) => {
		if (p.cardsLeft !== lead.cardsLeft) return p.cardsLeft < lead.cardsLeft ? p : lead;
		return estScore(p) < estScore(lead) ? p : lead;
	});
}

/** A deliberate look (re-)fixes a memory. */
function bump(seat: BotSeat, card: Card) {
	seat.forgotten.delete(card);
	seat.seen.set(card, Date.now() + FORGET_INTERVAL_MS);
	seat.hints.delete(card);
}

/**
 * Drives bot players from the outside, through the same Game methods a human uses.
 * After every state broadcast each bot refreshes its (fallible) memory, computes a
 * plan and runs it on a humanlike timer.
 */
export class BotManager {
	private seats = new Map<Game, BotSeat[]>();
	/** A pending peek & swap decision being watched — keeping the cards is information too. */
	private kingObs = new WeakMap<
		Game,
		{ deciderId: string; refs: CardRef[]; cards: (Card | null)[] }
	>();

	constructor(private broadcast: (game: Game) => void) {}

	addBots(game: Game, difficulty: BotDifficulty, count: number) {
		const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
		const seats = names.map((name) => {
			const player = new Player(`bot-${crypto.randomUUID()}`, true);
			player.name = name;
			game.addPlayer(player);
			return {
				player,
				profile: PROFILES[difficulty],
				timer: null,
				planKey: null,
				race: null,
				seen: new Map<Card, number>(),
				forgotten: new Set<Card>(),
				hints: new Map<Card, number>(),
				roundStamp: 0
			};
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
		const seats = this.seats.get(game);
		if (!seats) return;
		for (const seat of seats) this.refreshMemory(game, seat);
		this.observe(game, seats);
		for (const seat of seats) this.schedule(game, seat);
	}

	/** Human memory: new sightings of others' cards may not stick, old ones fade over time. */
	private refreshMemory(game: Game, seat: BotSeat) {
		if (seat.roundStamp !== game.startedAt) {
			// a new deal wipes the table — start with a blank memory
			seat.roundStamp = game.startedAt;
			seat.seen.clear();
			seat.forgotten.clear();
			seat.hints.clear();
		}
		const { oppRecall, forgetChance } = seat.profile;
		const now = Date.now();
		for (const card of seat.player.known) {
			if (seat.forgotten.has(card)) continue;
			const nextRoll = seat.seen.get(card);
			if (nextRoll === undefined) {
				// a fresh sighting — does it stick at all?
				if (Math.random() < oppRecall) seat.seen.set(card, now + FORGET_INTERVAL_MS);
				else seat.forgotten.add(card);
				continue;
			}
			let next = nextRoll;
			while (now >= next) {
				if (Math.random() < forgetChance) {
					seat.forgotten.add(card);
					seat.seen.delete(card);
					break;
				}
				next += FORGET_INTERVAL_MS;
				seat.seen.set(card, next);
			}
		}
	}

	/** Watch peek & swap decisions: whoever declines a swap kept something better. */
	private observe(game: Game, seats: BotSeat[]) {
		const cardAt = (ref: CardRef) =>
			game.players.find((p) => p.id === ref.playerId)?.hand[ref.index] ?? null;

		if (game.phase === 'playing' && game.turnState === 'king_decide' && game.currentPlayer) {
			this.kingObs.set(game, {
				deciderId: game.currentPlayer.id,
				refs: [...game.kingRefs],
				cards: game.kingRefs.map(cardAt)
			});
			return;
		}
		const obs = this.kingObs.get(game);
		if (!obs) return;
		this.kingObs.delete(game);

		const kept = obs.refs.every((ref, i) => cardAt(ref) === obs.cards[i]);
		if (!kept) return; // a swap moves the cards, and knowledge travels with them anyway
		const [a, b] = obs.refs;
		if (!a || !b) return;
		const aOwn = a.playerId === obs.deciderId;
		if (aOwn === (b.playerId === obs.deciderId)) return; // both or neither theirs — nothing to read
		const ownCard = aOwn ? obs.cards[0] : obs.cards[1];
		const otherCard = aOwn ? obs.cards[1] : obs.cards[0];
		if (!ownCard || !otherCard) return;

		for (const seat of seats) {
			if (!seat.profile.infers || seat.player.id === obs.deciderId) continue;
			const sees = (c: Card) => seat.player.known.has(c) && !seat.forgotten.has(c);
			if (sees(otherCard) && !sees(ownCard)) {
				// they kept their card over one this bot knows — it must be better
				seat.hints.set(ownCard, Math.max(0, otherCard.value - 2));
			} else if (sees(ownCard) && !sees(otherCard)) {
				// they turned that card down — it must be worse than what they kept
				seat.hints.set(otherCard, Math.min(12, ownCard.value + 2));
			}
		}
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
					const worst = worstSlot(seat);
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
				const worst = worstSlot(seat);
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
				const worst = worstSlot(seat);
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

				const rival = threat(game, seat);
				const oppSlots: { ref: CardRef; card: Card; est: number; known: boolean }[] = [];
				for (const opp of opponents(game, bot))
					for (const s of slotsOf(seat, opp))
						oppSlots.push({ ref: { playerId: opp.id, index: s.index }, ...s });
				const oppUnknown = oppSlots.filter((s) => !s.known);
				/** Prefer the leader's cards — messing with whoever is winning is only human. */
				const preferRival = <T extends { ref: CardRef }>(pool: T[]): T[] => {
					const rivals = pool.filter((s) => s.ref.playerId === rival?.id);
					return rivals.length ? rivals : pool;
				};

				switch (game.activePower) {
					case 'peek_self': {
						const unknown = slotsOf(seat).filter((s) => !s.known);
						if (!unknown.length) return skip(); // nothing left to learn
						const target = pick(unknown);
						game.usePower(bot, [{ playerId: bot.id, index: target.index }]);
						return bump(seat, target.card);
					}
					case 'peek_other': {
						if (!oppUnknown.length) return skip();
						const target = pick(preferRival(oppUnknown));
						game.usePower(bot, [target.ref]);
						return bump(seat, target.card);
					}
					case 'blind_swap': {
						const worst = worstSlot(seat);
						if (!worst || !oppSlots.length) return skip();
						// the best target on the table: a known or suspected low card, ideally the leader's
						const target = preferRival(
							oppSlots.filter((s) => s.est === Math.min(...oppSlots.map((o) => o.est)))
						)[0];
						if (target.est >= worst.est - 1) return skip(); // no trade worth making
						let ref = target.ref;
						if (target.known && Math.random() < profile.mixup) {
							// "wait, was it left or right?" — grabs a neighboring slot instead
							const owner = game.players.find((p) => p.id === ref.playerId)!;
							const others = slotsOf(seat, owner).filter((s) => s.index !== ref.index);
							if (others.length) ref = { playerId: owner.id, index: pick(others).index };
						}
						return game.usePower(bot, [{ playerId: bot.id, index: worst.index }, ref]);
					}
					case 'peek_swap': {
						const ownUnknown = slotsOf(seat).filter((s) => !s.known);
						const targets: CardRef[] = [];
						const cards: Card[] = [];
						if (game.rules.peeking === 'same_player' && ownUnknown.length >= 2) {
							// house rule permitting: learn two of their own cards at once
							targets.push(
								{ playerId: bot.id, index: ownUnknown[0].index },
								{ playerId: bot.id, index: ownUnknown[1].index }
							);
							cards.push(ownUnknown[0].card, ownUnknown[1].card);
						} else if (ownUnknown.length && oppSlots.length) {
							const own = pick(ownUnknown);
							const other = pick(preferRival(oppUnknown.length ? oppUnknown : oppSlots));
							targets.push({ playerId: bot.id, index: own.index }, other.ref);
							cards.push(own.card, other.card);
						} else if (oppSlots.length) {
							// they know their own hand — scout the table instead
							const first = pick(preferRival(oppUnknown.length ? oppUnknown : oppSlots));
							const pool =
								game.rules.peeking === 'same_player'
									? oppSlots.filter((s) => s.ref !== first.ref)
									: oppSlots.filter((s) => s.ref.playerId !== first.ref.playerId);
							const worst = worstSlot(seat);
							if (pool.length) {
								const second = pick(pool);
								targets.push(first.ref, second.ref);
								cards.push(first.card, second.card);
							} else if (worst) {
								targets.push({ playerId: bot.id, index: worst.index }, first.ref);
								cards.push(worst.card, first.card);
							} else {
								return skip();
							}
						} else {
							return skip();
						}
						game.usePower(bot, targets);
						for (const card of cards) bump(seat, card);
						return;
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
		if (!this.bestFlip(game, seat)) return null;

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
				const target = this.bestFlip(game, seat);
				if (!target) return;
				if (accurate) return game.flip(bot, target);
				// grabbed a neighboring slot in the rush — a very human mistake
				const owner = game.players.find((p) => p.id === target.playerId)!;
				const others = slotsOf(seat, owner).filter((s) => s.index !== target.index);
				game.flip(bot, others.length ? { playerId: owner.id, index: pick(others).index } : target);
			}
		};
	}

	/** The most rewarding card the bot can still PLACE that matches the discard, or null. */
	private bestFlip(game: Game, seat: BotSeat): CardRef | null {
		const bot = seat.player;
		const top = game.discardTop;
		if (!top) return null;
		const worst = worstSlot(seat);
		const rival = threat(game, seat);
		let best: { ref: CardRef; gain: number } | null = null;
		for (const p of game.players) {
			if (game.rules.callerLocked && p.id === game.cambioCallerId) continue;
			for (const s of slotsOf(seat, p)) {
				if (!s.known || s.card.rank !== top.rank) continue;
				// own card: sheds its points. Someone else's: a chance to dump the worst card on them —
				// extra sweet when it saddles whoever is closest to winning.
				let gain = p === bot ? s.card.value : worst ? worst.est - 1 : 0;
				if (p !== bot && p === rival) gain += 1.5;
				if (gain < 0) continue; // never flip away the own red king
				if (!best || gain > best.gain) best = { ref: { playerId: p.id, index: s.index }, gain };
			}
		}
		return best?.ref ?? null;
	}
}
