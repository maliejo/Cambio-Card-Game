import type {
	CardData,
	CardMove,
	CardRef,
	ClientMessage,
	GameView,
	ServerMessage
} from '$lib/shared/types';
import { tick } from 'svelte';
import { cardLocations, endpointKey } from './locations';

interface Reveal {
	card: CardData;
	reason: string;
	sticky: boolean;
	seq: number;
}

export interface Flight {
	id: number;
	card: CardData | 'hidden';
	from: DOMRect;
	to: DOMRect;
	/** Location key of the destination — that spot hides its card while the flight lasts. */
	targetKey: string;
}

/**
 * Holds the websocket plus all state the server pushes to us.
 * The server is authoritative — the client only renders state and sends intents.
 */
class GameClient {
	clientId = $state<string | null>(null);
	connected = $state(false);
	view = $state<GameView | null>(null);
	error = $state<string | null>(null);
	/** Temporarily face-up cards, keyed by `playerId:index` (peeks, flips, king looks). */
	reveals = $state<Record<string, Reveal>>({});
	/** Locally accumulated picks for two-card powers (swaps). */
	picks = $state<CardRef[]>([]);
	/** Cards currently flying across the table. */
	flights = $state<Flight[]>([]);
	/** Whether the flip race is currently open (a discard happened moments ago). */
	flipOpen = $state(false);
	showHints = $state(true);

	private socket: WebSocket | null = null;
	private errorTimer: ReturnType<typeof setTimeout> | undefined;
	private flipTimer: ReturnType<typeof setTimeout> | undefined;
	private revealSeq = 0;
	private flightSeq = 0;
	private resumeTried = false;
	/** Set when another tab took over this session — stop trying to reclaim it. */
	private suppressResume = false;
	private perfSent = false;
	/** Moves whose start position was measured, waiting for the new state to render. */
	private pendingMoves: { card: CardData | 'hidden'; from: DOMRect; toKey: string }[] = [];

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

	get self() {
		return this.view?.players.find((p) => p.id === this.view?.selfId) ?? null;
	}

	get isMyTurn() {
		return !!this.view && this.view.currentPlayerId === this.view.selfId;
	}

	revealFor(playerId: string, index: number): CardData | null {
		return this.reveals[`${playerId}:${index}`]?.card ?? null;
	}

	setShowHints(show: boolean) {
		this.showHints = show;
		localStorage.setItem('cambio.hints', show ? '1' : '0');
	}

	endFlight(id: number) {
		this.flights = this.flights.filter((f) => f.id !== id);
	}

	/** Is a card currently flying towards this location? Then the spot hides its own card. */
	isFlightTarget(key: string): boolean {
		return this.flights.some((f) => f.targetKey === key);
	}

	/** Measure where the moving cards start, while the old layout is still on screen. */
	private prepareFlights(moves: CardMove[]) {
		for (const move of moves) {
			const from = cardLocations.get(endpointKey(move.from))?.getBoundingClientRect();
			if (!from) continue;
			this.pendingMoves.push({ card: move.card, from, toKey: endpointKey(move.to) });
		}
	}

	/** After the new state rendered, measure the destinations and launch the flights. */
	private async launchFlights() {
		if (!this.pendingMoves.length) return;
		const moves = this.pendingMoves;
		this.pendingMoves = [];
		await tick(); // let Svelte render the new state first, so freshly added slots exist
		for (const move of moves) {
			const to = cardLocations.get(move.toKey)?.getBoundingClientRect();
			if (!to) continue;
			this.flights.push({
				id: ++this.flightSeq,
				card: move.card,
				from: move.from,
				to,
				targetKey: move.toKey
			});
		}
	}

	togglePick(ref: CardRef) {
		const found = this.picks.findIndex(
			(p) => p.playerId === ref.playerId && p.index === ref.index
		);
		if (found !== -1) this.picks.splice(found, 1);
		else this.picks.push(ref);

		if (this.picks.length === 2) {
			this.send({ method: 'power', targets: [...this.picks] });
			this.picks = [];
		}
	}

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
				this.error = 'You opened this game in another window';
				clearTimeout(this.errorTimer);
				this.errorTimer = setTimeout(() => (this.error = null), 6000);
				break;
			case 'state': {
				// being in a game is what makes the session worth remembering
				if (this.clientId) {
					sessionStorage.setItem('cambio.session', this.clientId);
					localStorage.setItem('cambio.session', this.clientId);
				}
				const prev = this.view;
				this.view = message.state;
				this.picks = [];
				clearTimeout(this.flipTimer);
				this.flipOpen = message.state.flipRemainingMs > 0;
				if (this.flipOpen) {
					this.flipTimer = setTimeout(
						() => (this.flipOpen = false),
						message.state.flipRemainingMs
					);
				}
				// sticky reveals (initial peek, king look) live until the game moves on
				const moved =
					prev?.phase !== message.state.phase ||
					prev?.turnState !== message.state.turnState ||
					prev?.currentPlayerId !== message.state.currentPlayerId;
				if (moved) {
					for (const key of Object.keys(this.reveals)) {
						if (this.reveals[key].sticky) delete this.reveals[key];
					}
				}
				this.launchFlights();
				break;
			}
			case 'reveal':
				for (const { ref, card } of message.cards) {
					const key = `${ref.playerId}:${ref.index}`;
					const seq = ++this.revealSeq;
					this.reveals[key] = { card, reason: message.reason, sticky: message.durationMs === 0, seq };
					if (message.durationMs > 0) {
						setTimeout(() => {
							if (this.reveals[key]?.seq === seq) delete this.reveals[key];
						}, message.durationMs);
					}
				}
				break;
			case 'moves':
				this.prepareFlights(message.moves);
				break;
			case 'error':
				this.error = message.message;
				clearTimeout(this.errorTimer);
				this.errorTimer = setTimeout(() => (this.error = null), 4000);
				break;
		}
	}
}

export const client = new GameClient();
