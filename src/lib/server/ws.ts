import type { IncomingMessage } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';
import Game, { GameError, MAX_PLAYERS } from './game/Game';
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

function send(ws: WebSocket, data: ServerMessage) {
	try {
		ws.send(JSON.stringify(data));
	} catch (error) {
		console.error(error);
	}
}

/** Push the current game state to every player in the game, each with their own redacted view. */
function broadcastState(game: Game) {
	const moves = game.takeMoves();
	for (const player of game.players) {
		const client = CLIENTS.get(player.id);
		if (!client?.player.connected) continue;
		// moves go first: the client measures the moving cards' start positions
		// in the old layout before the new state re-renders the table
		if (moves.length) send(client.ws, { method: 'moves', moves });
		send(client.ws, { method: 'state', state: game.viewFor(player) });
	}
	bots.onState(game); // every state change lets the bots (re)plan their next move
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
			for (const id of toPlayerIds) {
				const client = CLIENTS.get(id);
				if (client?.player.connected)
					send(client.ws, { method: 'reveal', cards, reason, durationMs });
			}
		});
	};
	// which slots were looked at is public information — everyone gets the marker
	game.onPeek = (refs, byId, durationMs) => {
		queueMicrotask(() => {
			for (const player of game.players) {
				const client = CLIENTS.get(player.id);
				if (client?.player.connected)
					send(client.ws, { method: 'peeked', refs, byId, durationMs });
			}
		});
	};
}

function createGame(client: Client, name: string) {
	let uid = Game.generateUID();
	while (GAMES.has(uid)) uid = Game.generateUID();
	const game = new Game(uid);
	wireReveals(game);
	game.onAnalytics = (name, data) => trackEvent(name, data);
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
	bots.addBots(game, difficulty, 3);
	game.start(client.player);
	trackEvent('practice_started', { difficulty }, client.visitor);
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
	if (message.method === 'resume')
		return resume(client, message.token, message.takeover === true);
	if (message.method === 'create' || message.method === 'join' || message.method === 'practice') {
		if (message.method === 'create') createGame(client, message.name);
		else if (message.method === 'practice')
			createPracticeGame(client, message.name, message.difficulty);
		else joinGame(client, message.gameId, message.name);
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
			const game = client.game;
			if (!game) return;
			game.handleDisconnect(client.player);
			if (game.players.every((p) => !p.connected)) {
				GAMES.delete(game.uid);
				console.log('game removed:', game.uid);
				// a running round everyone walked away from counts as abandoned
				if (game.phase === 'playing' || game.phase === 'initial_peek') {
					trackEvent('game_abandoned', game.analyticsData());
				}
			} else if (game.players.every((p) => p.isBot || !p.connected)) {
				// only bots left at the table — freeze them and give the human a minute to return
				bots.pause(game);
				DOOMED.set(
					game.uid,
					setTimeout(() => {
						DOOMED.delete(game.uid);
						bots.dispose(game);
						GAMES.delete(game.uid);
						console.log('practice game removed:', game.uid);
						if (game.phase === 'playing' || game.phase === 'initial_peek') {
							trackEvent('game_abandoned', game.analyticsData());
						}
					}, 60_000)
				);
			} else {
				broadcastState(game);
			}
		});
	});
}
