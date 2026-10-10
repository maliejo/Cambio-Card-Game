import type { RequestHandler } from './$types';
import { cleanCode, cleanName, renderOgImage } from '$lib/server/og';

/** The link preview image: /og.png for the site, /og.png?from=Name&code=ABCD for an invite. */
export const GET: RequestHandler = async ({ url }) => {
	const png = await renderOgImage(cleanName(url.searchParams.get('from')), cleanCode(url.searchParams.get('code')));
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
