import type { PageServerLoad } from './$types';
import { cleanCode, cleanName } from '$lib/server/og';

/** An invite link: /join/ABCD?from=Name — opens the lobby with the room code filled in. */
export const load: PageServerLoad = ({ params, url }) => ({
	code: cleanCode(params.code) ?? params.code.toUpperCase().slice(0, 4),
	from: cleanName(url.searchParams.get('from'))
});
