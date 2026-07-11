/**
 * Server-side Umami tracking (https://docs.umami.is/docs/guides/send-server-side-events).
 * Nothing is ever sent from the browser to Umami, so adblockers can't interfere:
 * pageviews are reported by the SvelteKit hook, browser performance numbers travel
 * over our own websocket and are relayed from here, game stats come straight from
 * the game engine.
 */

const UMAMI_ENDPOINT = 'https://umami.maliejo.com/api/send';
const WEBSITE_ID = '2aa645a2-f044-42f0-be35-9d4de79c5dff';

// don't pollute the stats while developing — set UMAMI_DEBUG=1 to test locally
const enabled = process.env.NODE_ENV === 'production' || process.env.UMAMI_DEBUG === '1';

export interface Visitor {
	userAgent?: string | null;
	ip?: string | null;
}

const SERVER_UA = 'Cambio-Server/1.0';

function send(payload: Record<string, unknown>, visitor?: Visitor) {
	if (!enabled) return;
	fetch(UMAMI_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			// Umami derives browser/OS/device from the User-Agent header
			'User-Agent': visitor?.userAgent || SERVER_UA
		},
		body: JSON.stringify({
			type: 'event',
			payload: {
				website: WEBSITE_ID,
				...(visitor?.ip ? { ip: visitor.ip } : {}),
				...payload
			}
		})
	})
		.then(async (response) => {
			if (!response.ok) console.error('umami:', response.status, await response.text());
		})
		.catch((error) => console.error('umami:', error?.message ?? error));
}

export function trackPageview(
	url: string,
	hostname: string,
	referrer: string | null,
	visitor: Visitor
) {
	send({ url, hostname, referrer: referrer ?? '' }, visitor);
}

export function trackEvent(
	name: string,
	data: Record<string, string | number> = {},
	visitor?: Visitor,
	url = '/'
) {
	send({ url, name, data }, visitor);
}
