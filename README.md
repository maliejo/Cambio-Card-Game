# Cambio Card Game

Multiplayer Cambio in the browser — SvelteKit frontend and WebSocket game server in a single project.

## Development

```sh
pnpm install
pnpm dev
```

One process serves both the app and the game server: a Vite plugin ([vite.config.ts](vite.config.ts)) attaches the `ws` WebSocket server to the dev server under `/ws`. Open two browser tabs to play against yourself.

> Note: editing anything under `src/lib/server/` restarts the dev server and wipes running games (the game state lives in memory).

## Production

```sh
pnpm build
pnpm start   # serves the built app + game server on PORT (default 3000)
```

## How it works

- `src/lib/server/game/` — the game engine (`Game`, `Player`, `Deck`, `Card`). Server-authoritative: clients only send intents; all rules are validated here.
- `src/lib/server/ws.ts` — WebSocket transport: rooms, message routing, per-player redacted state broadcasts (you never receive another player's card faces — or your own, memory is the game).
- `src/lib/shared/types.ts` — the protocol (client/server messages, view types) shared by both sides.
- `src/lib/client/game.svelte.ts` — Svelte 5 runes store holding the socket and the latest server state.
- `src/lib/components/` — lobby, table, seats, hands. Cards are rendered from the [svg-cards](https://www.npmjs.com/package/svg-cards) deck via `<use href>`. Card movements are animated by `FlyingCards.svelte` from server-emitted move events.

## Rules

Lowest points win. A=1, number cards face value, J=11, Q=12, black K=13, **red K=-1**, Joker=0.

Each player starts with 4 cards and briefly memorizes their bottom two. On your turn draw from deck or discard, then swap the card into your hand or discard it. Discarding a card drawn from the deck triggers its power:

| Card | Power |
| --- | --- |
| 7, 8 | Peek at one of your own cards |
| 9, 10 | Peek at someone else's card |
| J, Q | Blindly swap any two cards |
| K | Look at two cards, then decide whether to swap them |

At any time, tap any card you believe matches the discard top to flip it — correct on your own card removes it, correct on someone else's removes it and you give them a card of yours, wrong costs you a penalty card. When you think you're lowest, call **Cambio** before drawing: everyone else gets one last turn, your cards become untouchable, and ties go against you.
