import type { Handle } from '@sveltejs/kit';
import { trackPageview } from '$lib/server/analytics';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// count real page visits (documents only — not assets or data requests)
	const accept = event.request.headers.get('accept') ?? '';
	if (event.request.method === 'GET' && accept.includes('text/html') && !event.isSubRequest) {
		let ip: string | null = null;
		try {
			ip = event.getClientAddress();
		} catch {
			// not available during prerendering
		}
		trackPageview(
			event.url.pathname + event.url.search,
			event.url.hostname,
			event.request.headers.get('referer'),
			{ userAgent: event.request.headers.get('user-agent'), ip }
		);
	}

	return response;
};
