import type {
	CardData,
	CardMove,
	CardRef,
	ClientMessage,
	GameView,
	ServerMessage
} from '$lib/shared/types';
import { tick } from 'svelte';
import { fx, type Impact } from './fx.svelte';
import { cardLocations, endpointKey } from './locations';

type Face = CardData | 'hidden';

export interface Flight {
	id: number;
	card: Face;
	/** The face shown at arrival — when it differs, the card turns over mid-flight. */
	toCard: Face;
	from: DOMRect;
	to: DOMRect;
	/** How the card lies at each endpoint (side players hold theirs a quarter
	 *  turn) — when they differ, the card rotates while it flies. */
	fromAngle: number;
	toAngle: number;
	/** Location key of the destination — that spot hides its card while the flight lasts. */
	targetKey: string;
	impact: Impact;
	/** Wait this long before taking off — cards of a reshuffle leave the pile one after another. */
	delayMs: number;
}

/** A reshuffle animates at most this many cards — enough to read as "the pile goes back". */
const RESHUFFLE_FLIGHTS = 8;
const RESHUFFLE_STAGGER_MS = 70;

/** How a card is rotated at a location — sideways slots declare it with data-angle. */
function angleOf(el: HTMLElement | undefined): number {
	return Number(el?.dataset.angle ?? 0);
}

/**
 * Per-slot marks (keyed `playerId:index`) that expire after a while, or stay
 * "sticky" (duration 0) until the game moves on to the next phase or turn.
 */
class TimedMarks<T> {
	entries = $state<Record<string, { value: T; sticky: boolean; seq: number }>>({});
	private seq = 0;

	get(key: string): T | null {
		return this.entries[key]?.value ?? null;
	}

	set(key: string, value: T, durationMs: number) {
		const seq = ++this.seq;
		this.entries[key] = { value, sticky: durationMs === 0, seq };
		if (durationMs > 0) {
			setTimeout(() => {
				if (this.entries[key]?.seq === seq) delete this.entries[key];
			}, durationMs);
		}
	}

	clear() {
		this.entries = {};
	}

	clearSticky() {
		for (const key of Object.keys(this.entries)) {
			if (this.entries[key].sticky) delete this.entries[key];
		}
	}
}

/** A flag that is true for a server-given number of milliseconds. */
class Countdown {
	active = $state(false);
	private timer: ReturnType<typeof setTimeout> | undefined;

	start(ms: number) {
		clearTimeout(this.timer);
		this.active = ms > 0;
		if (this.active) this.timer = setTimeout(() => (this.active = false), ms);
	}
}

const slotKey = (ref: CardRef) => `${ref.playerId}:${ref.index}`;

/**
 * Holds the websocket plus all state the server pushes to us.
 * The server is authoritative — the client only renders state and sends intents.
 */
class GameClient {
	clientId = $state<string | null>(null);
	connected = $state(false);
	view = $state<GameView | null>(null);
	error = $state<string | null>(null);
	/** Temporarily face-up cards (peeks, flips, king looks). */
	private reveals = new TimedMarks<CardData>();
	/** Slots someone looked at — everyone sees WHICH card was peeked, and by whom. */
	private peeks = new TimedMarks<string>();
	/** Locally accumulated picks for two-card powers (swaps). */
	picks = $state<CardRef[]>([]);
	/** Cards currently flying across the table. */
	flights = $state<Flight[]>([]);
	/** Valid moves glow softly — can be switched off in the lobby. */
	showHints = $state(true);

	/** The flip race is open (a discard happened moments ago). */
	private flipWindow = new Countdown();
	/** A peek is still on display — drawing waits until everyone finished looking. */
	private peekWindow = new Countdown();

	private socket: WebSocket | null = null;
	private errorTimer: ReturnType<typeof setTimeout> | undefined;
	private flightSeq = 0;
	private resumeTried = false;
	/** Set when another tab took over this session — stop trying to reclaim it. */
	private suppressResume = false;
	private perfSent = false;
	/** Moves whose start position was measured, waiting for the new state to render. */
	private pendingMoves: {
		startCard: Face;
		card: Face;
		from: DOMRect;
		fromAngle: number;
		toKey: string;
		impact: Impact;
		delayMs: number;
	}[] = [];

	connect() {
		if (this.socket) return;
		this.showHints = localStorage.getItem('cambio.hints') !== '0';
		this.resumeTried = false;
		const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
		this.socket = new WebSocket(`${protocol}://${location.host}/ws`);
		this.socket.onmessage = (event) => this.handle(JSON.parse(event.data));
		this.socket.onclose = () => {
			this.connected = false;
			this.socket = null;
			// keep trying — on success the stored session resumes the running game
			setTimeout(() => this.connect(), 1500);
		};
	}

	send(message: ClientMessage) {
		this.socket?.send(JSON.stringify(message));
	}

	get self() {
		return this.view?.players.find((p) => p.id === this.view?.selfId) ?? null;
	}

	get isMyTurn() {
		return !!this.view && this.view.currentPlayerId === this.view.selfId;
	}

	get flipOpen() {
		return this.flipWindow.active;
	}

	get peekWait() {
		return this.peekWindow.active;
	}

	revealFor(playerId: string, index: number): CardData | null {
		return this.reveals.get(`${playerId}:${index}`);
	}

	/** Id of the player who is looking at this slot right now, or null. */
	peekerOf(playerId: string, index: number): string | null {
		return this.peeks.get(`${playerId}:${index}`);
	}

	/** Name of the player who just looked at this slot, or null. */
	peekedBy(playerId: string, index: number): string | null {
		const byId = this.peeks.get(`${playerId}:${index}`);
		return byId ? (this.view?.players.find((p) => p.id === byId)?.name ?? null) : null;
	}

	setShowHints(show: boolean) {
		this.showHints = show;
		localStorage.setItem('cambio.hints', show ? '1' : '0');
	}

	/** Leave the room for the main menu — and forget the session, so nothing resumes it. */
	leave() {
		this.send({ method: 'leave' });
		sessionStorage.removeItem('cambio.session');
		localStorage.removeItem('cambio.session');
		this.view = null;
		this.picks = [];
		this.flights = [];
		this.pendingMoves = [];
		this.reveals.clear();
		this.peeks.clear();
	}

	togglePick(ref: CardRef) {
		const found = this.picks.findIndex((p) => p.playerId === ref.playerId && p.index === ref.index);
		if (found !== -1) this.picks.splice(found, 1);
		else this.picks.push(ref);

		if (this.picks.length === 2) {
			this.send({ method: 'power', targets: [...this.picks] });
			this.picks = [];
		}
	}

	// ---------- flying cards ----------

	endFlight(flight: Flight) {
		this.flights = this.flights.filter((f) => f.id !== flight.id);
		fx.land(flight.targetKey, flight.impact);
	}

	/** Is a card currently flying towards this location? Then the spot hides its own card. */
	isFlightTarget(key: string): boolean {
		return this.flights.some((f) => f.targetKey === key);
	}

	/**
	 * What a location shows of a card: hand slots and the deck lie face-down,
	 * the discard is face-up, the drawn card only for its holder.
	 */
	private faceAt(key: string, card: Face): Face {
		if (key === 'discard') return card;
		if (key === 'drawn' && this.isMyTurn) return this.view?.drawnCard ?? 'hidden';
		return 'hidden';
	}

	/** Measure where the moving cards start, while the old layout is still on screen. */
	private prepareFlights(moves: CardMove[]) {
		const impacts = fx.impactsOf(moves);
		let reshuffled = 0;
		moves.forEach((move, i) => {
			if (impacts[i] === 'shuffle' && ++reshuffled > RESHUFFLE_FLIGHTS) return;
			const key = endpointKey(move.from);
			const fromEl = cardLocations.get(key);
			const from = fromEl?.getBoundingClientRect();
			if (!from) return;
			this.pendingMoves.push({
				startCard: this.faceAt(key, move.card),
				card: move.card,
				from,
				fromAngle: angleOf(fromEl),
				toKey: endpointKey(move.to),
				impact: impacts[i],
				delayMs: impacts[i] === 'shuffle' ? (reshuffled - 1) * RESHUFFLE_STAGGER_MS : 0
			});
			fx.launch(move);
		});
	}

	/** After the new state rendered, measure the destinations and launch the flights. */
	private async launchFlights() {
		if (!this.pendingMoves.length) return;
		const moves = this.pendingMoves;
		this.pendingMoves = [];
		await tick(); // let Svelte render the new state first, so freshly added slots exist
		for (const move of moves) {
			const toEl = cardLocations.get(move.toKey);
			const to = toEl?.getBoundingClientRect();
			if (!to) continue;
			this.flights.push({
				id: ++this.flightSeq,
				card: move.startCard,
				// a differing face at the destination turns over during the flight
				toCard: this.faceAt(move.toKey, move.card),
				from: move.from,
				to,
				fromAngle: move.fromAngle,
				toAngle: angleOf(toEl),
				targetKey: move.toKey,
				impact: move.impact,
				delayMs: move.delayMs
			});
		}
	}

	// ---------- server messages ----------

	private handle(message: ServerMessage) {
		switch (message.method) {
			case 'connected': {
				this.clientId = message.clientId;
				this.connected = true;
				this.reportPerformance();
				// a token from THIS tab (reload) may displace its own lingering socket;
				// the browser-wide token only resumes a seat that is really offline
				const tabSession = sessionStorage.getItem('cambio.session');
				const session = tabSession ?? localStorage.getItem('cambio.session');
				if (session && session !== message.clientId && !this.resumeTried && !this.suppressResume) {
					this.resumeTried = true;
					this.send({ method: 'resume', token: session, takeover: tabSession !== null });
				}
				break;
			}
			case 'resumeFailed':
				// forget the session if the game is truly gone — but not when the
				// seat is simply in use by another (still valid) tab
				if (!message.seatTaken) {
					sessionStorage.removeItem('cambio.session');
					localStorage.removeItem('cambio.session');
				}
				break;
			case 'superseded':
				this.suppressResume = true;
				this.view = null;
				this.showError('You opened this game in another window', 6000);
				break;
			case 'state': {
				// being in a game is what makes the session worth remembering
				if (this.clientId) {
					sessionStorage.setItem('cambio.session', this.clientId);
					localStorage.setItem('cambio.session', this.clientId);
				}
				const prev = this.view;
				const next = message.state;
				this.view = next;
				this.picks = [];
				this.flipWindow.start(next.flipRemainingMs);
				this.peekWindow.start(next.peekRemainingMs);
				// sticky reveals (initial peek, king look) live until the game moves on
				const moved =
					prev?.phase !== next.phase ||
					prev?.turnState !== next.turnState ||
					prev?.currentPlayerId !== next.currentPlayerId;
				if (moved) {
					this.reveals.clearSticky();
					this.peeks.clearSticky();
				}
				fx.stateChanged(prev, next);
				this.launchFlights();
				break;
			}
			case 'reveal':
				for (const { ref, card } of message.cards) {
					// a reveal for a slot that no longer holds a card (it just flew off to
					// the discard pile) would render a phantom duplicate — skip it
					const slot = this.view?.players.find((p) => p.id === ref.playerId)?.hand[ref.index];
					if (slot === null || slot === undefined) continue;
					this.reveals.set(slotKey(ref), card, message.durationMs);
				}
				break;
			case 'peeked':
				for (const ref of message.refs) this.peeks.set(slotKey(ref), message.byId, message.durationMs);
				break;
			case 'moves':
				this.prepareFlights(message.moves);
				break;
			case 'error':
				this.showError(message.message, 4000);
				fx.error();
				break;
		}
	}

	private showError(text: string, durationMs: number) {
		this.error = text;
		clearTimeout(this.errorTimer);
		this.errorTimer = setTimeout(() => (this.error = null), durationMs);
	}

	/**
	 * Measure page performance and hand it to the server (once per page load).
	 * It travels over our own websocket, so adblockers never see an analytics request.
	 */
	private reportPerformance() {
		if (this.perfSent) return;
		this.perfSent = true;

		let lcp = 0;
		try {
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) lcp = entry.startTime;
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		} catch {
			// not supported in this browser
		}

		const report = () => {
			const metrics: Record<string, number> = {};
			const nav = performance.getEntriesByType('navigation')[0] as
				| PerformanceNavigationTiming
				| undefined;
			if (nav) {
				metrics.ttfb = nav.responseStart;
				metrics.domContentLoaded = nav.domContentLoadedEventEnd;
				metrics.load = nav.loadEventEnd;
			}
			const fcp = performance
				.getEntriesByType('paint')
				.find((p) => p.name === 'first-contentful-paint');
			if (fcp) metrics.fcp = fcp.startTime;
			if (lcp) metrics.lcp = lcp;
			if (Object.keys(metrics).length) this.send({ method: 'perf', metrics });
		};

		// give LCP a moment to settle after the page is fully loaded
		if (document.readyState === 'complete') setTimeout(report, 3000);
		else window.addEventListener('load', () => setTimeout(report, 3000), { once: true });
	}
}

export const client = new GameClient();
