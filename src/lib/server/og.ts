/**
 * Open Graph preview images (1200×630 PNG) for shared links — WhatsApp, iMessage
 * and friends refuse SVG previews, so the card is laid out with satori and
 * rasterized with resvg. An invite link names who is inviting and to which room.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const require = createRequire(import.meta.url);
const font = (subset: string, weight: 500 | 900) => ({
	name: 'Rubik',
	weight,
	style: 'normal' as const,
	data: readFileSync(require.resolve(`@fontsource/rubik/files/rubik-${subset}-${weight}-normal.woff`))
});
// satori picks, glyph by glyph, the first font that has it — so accented and Cyrillic names render too
const FONTS = ['latin', 'latin-ext', 'cyrillic'].flatMap((subset) => [font(subset, 500), font(subset, 900)]);

const WIDTH = 1200;
const HEIGHT = 630;

/** The fanned cards from the favicon, drawn large: a face-up heart behind the purple back. */
const CARDS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 64 64">
	<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a35ff"/><stop offset="1" stop-color="#3a0d94"/></linearGradient></defs>
	<g transform="rotate(-14 32 34)">
		<rect x="12" y="10" width="30" height="44" rx="4" fill="#fbf6ea" stroke="#d6cce6" stroke-width="0.8"/>
		<path d="M21 26c-4-3-6-5-6-8 0-2 1.5-3.5 3.3-3.5 1.3 0 2.2.8 2.7 1.9.5-1.1 1.4-1.9 2.7-1.9 1.8 0 3.3 1.5 3.3 3.5 0 3-2 5-6 8Z" fill="#d8355a"/>
	</g>
	<g transform="rotate(10 36 34)">
		<rect x="22" y="9" width="30" height="46" rx="4" fill="url(#b)" stroke="#2a0a6e" stroke-width="0.8"/>
		<rect x="25" y="12" width="24" height="40" rx="2.5" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1"/>
		<path d="M37 22.5 39.6 29.6 47.2 29.9 41.2 34.6 43.3 41.9 37 37.7 30.7 41.9 32.8 34.6 26.8 29.9 34.4 29.6Z" fill="#ffc94a"/>
	</g>
</svg>`;
const CARDS_SRC = `data:image/svg+xml;base64,${Buffer.from(CARDS_SVG).toString('base64')}`;

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra = {}): Node => ({
	type,
	props: { style, children, ...extra }
});

/** Names go onto the image as plain text: no emoji or symbols our font can't draw. */
export function cleanName(name: string | null): string | null {
	const cleaned = (name ?? '').replace(/[^\p{L}\p{N} .'_-]/gu, '').trim().slice(0, 20);
	return cleaned || null;
}

export function cleanCode(code: string | null): string | null {
	const cleaned = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
	return cleaned.length === 4 ? cleaned : null;
}

function layout(from: string | null, code: string | null): Node {
	const gold = '#ffc94a';
	const title = from
		? [h('span', { color: gold }, from), h('span', {}, 'dealt you in.')]
		: [h('span', {}, "Let's play"), h('span', { color: gold }, 'Cambio.')];
	const titleSize = from && from.length > 11 ? 76 : 96;

	return h(
		'div',
		{
			width: WIDTH,
			height: HEIGHT,
			display: 'flex',
			alignItems: 'center',
			padding: '0 80px 0 90px',
			fontFamily: 'Rubik',
			color: '#f8f5fe',
			backgroundColor: '#0c0619',
			backgroundImage:
				'radial-gradient(circle at 78% 45%, #3b1a8a 0%, #1d0e42 38%, #0c0619 75%)'
		},
		[
			h('div', { display: 'flex', flexDirection: 'column', width: 660 }, [
				h(
					'div',
					{ fontSize: 30, fontWeight: 900, letterSpacing: 8, color: '#dc7df8', marginBottom: 26 },
					'CAMBIO'
				),
				h(
					'div',
					{ display: 'flex', flexDirection: 'column', fontSize: titleSize, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2 },
					title
				),
				h(
					'div',
					{ display: 'flex', fontSize: 34, fontWeight: 500, color: 'rgba(248,245,254,0.65)', marginTop: 34 },
					code ? `Tap to join · Room ${code}` : 'With friends or against bots'
				)
			]),
			h('img', { position: 'absolute', right: 70, top: 120, width: 390, height: 390 }, undefined, { src: CARDS_SRC, width: 390, height: 390 })
		]
	);
}

const cache = new Map<string, Buffer>();
const CACHE_LIMIT = 300;

export async function renderOgImage(from: string | null, code: string | null): Promise<Buffer> {
	const key = `${from ?? ''}|${code ?? ''}`;
	const cached = cache.get(key);
	if (cached) return cached;

	let svg: string;
	try {
		svg = await satori(layout(from, code) as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: FONTS });
	} catch {
		// a name in a script our fonts don't cover — fall back to the generic card
		svg = await satori(layout(null, code) as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: FONTS });
	}
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();

	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
	cache.set(key, png);
	return png;
}
