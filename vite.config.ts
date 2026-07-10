import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type ViteDevServer, type PreviewServer } from 'vite';
import { WebSocketServer } from 'ws';
import { attachGameServer } from './src/lib/server/ws';

// Runs the Cambio game server on the same HTTP server as the SvelteKit app.
// Upgrade requests to /ws are ours; everything else (e.g. Vite HMR) is left alone.
function gameServer(server: ViteDevServer | PreviewServer) {
	if (!server.httpServer) return;
	const wss = new WebSocketServer({ noServer: true });
	attachGameServer(wss);
	server.httpServer.on('upgrade', (req, socket, head) => {
		if (req.url?.split('?')[0] !== '/ws') return;
		wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
	});
}

export default defineConfig({
	server: {
		watch: { ignored: ['**/.claude/**'] }
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			name: 'cambio-game-server',
			configureServer: gameServer,
			configurePreviewServer: gameServer
		}
	]
});
