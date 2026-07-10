import type {
	CardData,
	CardMove,
	CardRef,
	ClientMessage,
	GameView,
	ServerMessage
} from '$lib/shared/types';
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
	showHints = $state(true);

	private socket: WebSocket | null = null;
	private errorTimer: ReturnType<typeof setTimeout> | undefined;
	private revealSeq = 0;
	private flightSeq = 0;

	connect() {
		if (this.socket) return;
		this.showHints = localStorage.getItem('cambio.hints') !== '0';
		const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
		this.socket = new WebSocket(`${protocol}://${location.host}/ws`);
		this.socket.onmessage = (event) => this.handle(JSON.parse(event.data));
		this.socket.onclose = () => {
			this.connected = false;
			this.socket = null;
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

	private startFlights(moves: CardMove[]) {
		for (const move of moves) {
			const from = cardLocations.get(endpointKey(move.from))?.getBoundingClientRect();
			const to = cardLocations.get(endpointKey(move.to))?.getBoundingClientRect();
			if (!from || !to) continue;
			this.flights.push({ id: ++this.flightSeq, card: move.card, from, to });
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
			case 'connected':
				this.clientId = message.clientId;
				this.connected = true;
				break;
			case 'state': {
				const prev = this.view;
				this.view = message.state;
				this.picks = [];
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
				this.startFlights(message.moves);
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
