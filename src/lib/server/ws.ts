import type { WebSocket, WebSocketServer } from 'ws';
import Game, { GameError, MAX_PLAYERS } from './game/Game';
import Player from './game/Player';
import type { ClientMessage, ServerMessage } from '$lib/shared/types';

interface Client {
	ws: WebSocket;
	player: Player;
	game: Game | null;
}

const GAMES = new Map<string, Game>();
const CLIENTS = new Map<string, Client>();

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
		send(client.ws, { method: 'state', state: game.viewFor(player) });
		if (moves.length) send(client.ws, { method: 'moves', moves });
	}
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
}

function createGame(client: Client, name: string) {
	let uid = Game.generateUID();
	while (GAMES.has(uid)) uid = Game.generateUID();
	const game = new Game(uid);
	wireReveals(game);
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

function handleMessage(client: Client, message: ClientMessage) {
	const { player, game } = client;

	if (message.method === 'create' || message.method === 'join') {
		if (message.method === 'create') createGame(client, message.name);
		else joinGame(client, message.gameId, message.name);
		return broadcastState(client.game!);
	}

	if (!game) throw new GameError('You are not in a game');

	switch (message.method) {
		case 'start':
			game.start(player);
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
	wss.on('connection', (ws: WebSocket) => {
		const clientId = crypto.randomUUID();
		const client: Client = { ws, player: new Player(clientId), game: null };
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
			CLIENTS.delete(clientId);
			const game = client.game;
			if (!game) return;
			game.handleDisconnect(client.player);
			if (game.players.every((p) => !p.connected)) {
				GAMES.delete(game.uid);
				console.log('game removed:', game.uid);
			} else {
				broadcastState(game);
			}
		});
	});
}
