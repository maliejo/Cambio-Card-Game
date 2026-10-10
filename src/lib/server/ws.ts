import type { IncomingMessage } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';
import Game, { GameError, type AnalyticsData } from './game/Game';
import Player from './game/Player';
import { BotManager, PROFILES } from './bots';
import { trackEvent, type Visitor } from './analytics';
import type { BotDifficulty, ClientMessage, ServerMessage } from '$lib/shared/types';

interface Client {
	ws: WebSocket;
	player: Player;
	game: Game | null;
	visitor: Visitor;
	perfReported: boolean;
}

const GAMES = new Map<string, Game>();
const CLIENTS = new Map<string, Client>();
const bots = new BotManager((game) => broadcastState(game));
/** Practice games whose human left — deleted after a grace period unless they resume. */
const DOOMED = new Map<string, ReturnType<typeof setTimeout>>();
const PRACTICE_GRACE_MS = 60_000;
/** What kind of room a game is — tagged onto every analytics event it sends. */
const ROOM_KINDS = new WeakMap<Game, AnalyticsData>();

function trackGame(game: Game, name: string, data: AnalyticsData = {}) {
	trackEvent(name, { ...(ROOM_KINDS.get(game) ?? { mode: 'friends' }), ...data });
}

function send(ws: WebSocket, data: ServerMessage) {
	try {
		ws.send(JSON.stringify(data));
	} catch (error) {
		console.error(error);
	}
}

/** Send to a player's socket — bots and disconnected players have none. */
function sendTo(playerId: string, data: ServerMessage) {
	const client = CLIENTS.get(playerId);
	if (client?.player.connected) send(client.ws, data);
}

/** Push the current game state to every player in the game, each with their own redacted view. */
function broadcastState(game: Game) {
	const moves = game.takeMoves();
	for (const player of game.players) {
		// moves go first: the client measures the moving cards' start positions
		// in the old layout before the new state re-renders the table
		if (moves.length) sendTo(player.id, { method: 'moves', moves });
		sendTo(player.id, { method: 'state', state: game.viewFor(player) });
	}
	bots.onState(game); // every state change lets the bots (re)plan their next move
}

/**
 * A player is gone from their game: for now (the socket closed — they may resume)
 * or for good (they left for the main menu).
 */
function departGame(game: Game, player: Player, left: boolean) {
	game.handleDisconnect(player, left);
	const onlyBots = game.players.every((p) => p.isBot || !p.connected);
	if (game.players.every((p) => !p.connected) || (left && onlyBots)) {
		removeGame(game);
	} else if (onlyBots) {
		// only bots left at the table — freeze them and give the human a minute to return
		bots.pause(game);
		DOOMED.set(
			game.uid,
			setTimeout(() => {
				DOOMED.delete(game.uid);
				removeGame(game);
			}, PRACTICE_GRACE_MS)
		);
	} else {
		broadcastState(game);
	}
}

/** Back to the main menu: the connection gets a fresh identity, the old seat is abandoned. */
function leave(client: Client) {
	const { game, player } = client;
	if (!game) return;
	CLIENTS.delete(player.id);
	client.game = null;
	client.player = new Player(crypto.randomUUID());
	CLIENTS.set(client.player.id, client);
	trackGame(game, 'player_left', { phase: game.phase, round: game.roundNumber });
	departGame(game, player, true);
	send(client.ws, { method: 'connected', clientId: client.player.id });
}

/** Forget a game for good — a running round nobody finished counts as abandoned. */
function removeGame(game: Game) {
	clearTimeout(DOOMED.get(game.uid));
	DOOMED.delete(game.uid);
	bots.dispose(game);
	GAMES.delete(game.uid);
	console.log('game removed:', game.uid);
	trackGame(game, 'room_closed', game.roomAnalytics());
	// a running round everyone walked away from
	if (game.phase === 'playing' || game.phase === 'initial_peek') {
		trackGame(game, 'round_abandoned', game.roundAnalytics());
	}
}

function trackPerf(client: Client, metrics: Record<string, number>) {
	if (client.perfReported) return;
	client.perfReported = true;
	const clean: Record<string, number> = {};
	for (const [key, value] of Object.entries(metrics).slice(0, 10)) {
		if (typeof value === 'number' && Number.isFinite(value)) clean[key] = Math.round(value);
	}
	if (Object.keys(clean).length) trackEvent('web_performance', clean, client.visitor);
}

function wireReveals(game: Game) {
	game.onReveal = (toPlayerIds, cards, reason, durationMs) => {
		// deferred so reveals arrive after the state broadcast that follows the action —
		// the client resets its reveals whenever the game moves to a new phase/turn
		queueMicrotask(() => {
			for (const id of toPlayerIds) sendTo(id, { method: 'reveal', cards, reason, durationMs });
		});
	};
	// which slots were looked at is public information — everyone gets the marker
	game.onPeek = (refs, byId, durationMs) => {
		queueMicrotask(() => {
			for (const player of game.players) sendTo(player.id, { method: 'peeked', refs, byId, durationMs });
		});
	};
}

function createGame(client: Client, name: string) {
	let uid = Game.generateUID();
	while (GAMES.has(uid)) uid = Game.generateUID();
	const game = new Game(uid);
	wireReveals(game);
	game.onAnalytics = (name, data) => trackGame(game, name, data);
	game.onChange = () => broadcastState(game);
	GAMES.set(uid, game);
	console.log('new game created:', uid);
	joinGame(client, uid, name);
}

function joinGame(client: Client, gameId: string, name: string) {
	const game = GAMES.get(gameId.trim().toUpperCase());
	if (!game) throw new GameError('Could not find that game');
	if (client.game) throw new GameError('You are already in a game');
	if (!name.trim()) throw new GameError('Please enter a name');

	client.player.name = name.trim().slice(0, 20);
	game.addPlayer(client.player);
	client.game = game;
	console.log('player joined game:', client.player.name, game.uid);
}

/** Solo practice: a private game against three bots that starts immediately. */
function createPracticeGame(client: Client, name: string, difficulty: BotDifficulty) {
	if (!PROFILES[difficulty]) throw new GameError('Unknown difficulty');
	if (client.game) throw new GameError('You are already in a game');
	createGame(client, name);
	const game = client.game!;
	ROOM_KINDS.set(game, { mode: 'practice', difficulty });
	bots.addBots(game, difficulty, 3);
	trackEvent('practice_started', { difficulty }, client.visitor);
	game.start(client.player);
}

/**
 * Rebind a fresh connection to the disconnected player it used to be.
 * The token is the old clientId, remembered by the browser in localStorage.
 */
function resume(client: Client, token: string, takeover: boolean) {
	if (!client.game && typeof token === 'string') {
		for (const game of GAMES.values()) {
			const player = game.players.find((p) => p.id === token);
			if (!player) continue;
			const existing = CLIENTS.get(token);
			if (existing && existing !== client) {
				// the seat is still live on another socket. A reloading tab (takeover)
				// may displace it — its own close often races this new connection.
				// Any other tab may not steal a live seat.
				if (!takeover) return send(client.ws, { method: 'resumeFailed', seatTaken: true });
				CLIENTS.delete(token);
				send(existing.ws, { method: 'superseded' });
				try {
					existing.ws.close();
				} catch {
					// already gone
				}
			}
			CLIENTS.delete(client.player.id);
			CLIENTS.set(token, client);
			client.player = player;
			client.game = game;
			// the human is back — a doomed practice game is saved
			const doom = DOOMED.get(game.uid);
			if (doom) {
				clearTimeout(doom);
				DOOMED.delete(game.uid);
			}
			game.handleReconnect(player);
			send(client.ws, { method: 'connected', clientId: token });
			broadcastState(game);
			console.log('player resumed game:', player.name, game.uid);
			return;
		}
	}
	send(client.ws, { method: 'resumeFailed' });
}

function handleMessage(client: Client, message: ClientMessage) {
	const { player, game } = client;

	if (message.method === 'perf') return trackPerf(client, message.metrics ?? {});
	if (message.method === 'leave') return leave(client);
	if (message.method === 'resume')
		return resume(client, message.token, message.takeover === true);
	if (message.method === 'create' || message.method === 'join' || message.method === 'practice') {
		if (message.method === 'create') {
			createGame(client, message.name);
			trackEvent('room_created', {}, client.visitor);
		}
		else if (message.method === 'practice')
			createPracticeGame(client, message.name, message.difficulty);
		else {
			joinGame(client, message.gameId, message.name);
			trackEvent('room_joined', { players: client.game!.players.length }, client.visitor);
		}
		return broadcastState(client.game!);
	}

	if (!game) throw new GameError('You are not in a game');

	switch (message.method) {
		case 'start':
			game.start(player);
			break;
		case 'setRules':
			game.setRules(player, message.rules);
			break;
		case 'ready':
			game.setReady(player);
			break;
		case 'cambio':
			game.callCambio(player);
			break;
		case 'draw':
			game.draw(player, message.from);
			break;
		case 'replace':
			game.replace(player, message.index);
			break;
		case 'discardDrawn':
			game.discardDrawn(player);
			break;
		case 'power':
			game.usePower(player, message.targets);
			break;
		case 'skipPower':
			game.skipPower(player);
			break;
		case 'kingDecide':
			game.kingDecide(player, message.swap);
			break;
		case 'flip':
			game.flip(player, { playerId: message.playerId, index: message.index });
			break;
		case 'give':
			game.give(player, message.index);
			break;
		case 'playAgain':
			game.playAgain(player);
			break;
		default:
			throw new GameError('Unknown method');
	}
	broadcastState(game);
}

export function attachGameServer(wss: WebSocketServer) {
	wss.on('connection', (ws: WebSocket, req?: IncomingMessage) => {
		const clientId = crypto.randomUUID();
		const forwarded = req?.headers['x-forwarded-for'];
		const visitor: Visitor = {
			userAgent: req?.headers['user-agent'],
			ip:
				(Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() ||
				req?.socket.remoteAddress
		};
		const client: Client = {
			ws,
			player: new Player(clientId),
			game: null,
			visitor,
			perfReported: false
		};
		CLIENTS.set(clientId, client);
		console.log('new connection:', clientId);

		send(ws, { method: 'connected', clientId });

		ws.on('error', console.error);

		ws.on('message', (data) => {
			try {
				handleMessage(client, JSON.parse(String(data)));
			} catch (error) {
				if (error instanceof GameError) {
					send(ws, { method: 'error', message: error.message });
					if (client.game) broadcastState(client.game); // resync, client may be out of date
				} else {
					console.error(error);
					send(ws, { method: 'error', message: 'Something went wrong on the server' });
				}
			}
		});

		ws.on('close', () => {
			// a resumed connection may have taken over this identity — then this
			// close is stale and must not mark the player as disconnected
			if (CLIENTS.get(client.player.id) !== client) return;
			CLIENTS.delete(client.player.id);
			if (client.game) departGame(client.game, client.player, false);
		});
	});
}
