<!--
	Shared SVG definitions for every card on the page: suit shapes, the crown and
	star ornaments and the card back's pattern. Rendered once at the app root so
	hundreds of cards don't each carry (and duplicate the ids of) their own copy.
	Kept out of view with a zero size rather than display:none — browsers drop
	gradients and patterns that live inside a display:none subtree.
-->
<svg width="0" height="0" class="absolute" aria-hidden="true">
	<defs>
		<symbol id="suit-H" viewBox="0 0 100 100">
			<path
				d="M50 90C22 68 4 52 4 32 4 16 16 6 29 6c10 0 17 6 21 15 4-9 11-15 21-15 13 0 25 10 25 26 0 20-18 36-46 58Z"
			/>
		</symbol>
		<symbol id="suit-D" viewBox="0 0 100 100">
			<path d="M50 3Q63 30 88 50 63 70 50 97 37 70 12 50 37 30 50 3Z" />
		</symbol>
		<symbol id="suit-S" viewBox="0 0 100 100">
			<path
				d="M50 4C38 24 6 38 6 60c0 14 11 22 23 22 8 0 14-3 18-9-1 10-6 18-14 23h34c-8-5-13-13-14-23 4 6 10 9 18 9 12 0 23-8 23-22C94 38 62 24 50 4Z"
			/>
		</symbol>
		<symbol id="suit-C" viewBox="0 0 100 100">
			<circle cx="50" cy="28" r="20" />
			<circle cx="27" cy="58" r="20" />
			<circle cx="73" cy="58" r="20" />
			<circle cx="50" cy="52" r="13" />
			<path d="M46 56c0 22-4 32-13 40h34c-9-8-13-18-13-40Z" />
		</symbol>
		<symbol id="ornament-star" viewBox="0 0 100 100">
			<path
				d="M50 4 61.8 35.8 95.7 37.2 69 58.2 78.2 90.8 50 72 21.8 90.8 31 58.2 4.3 37.2 38.2 35.8Z"
			/>
		</symbol>
		<symbol id="ornament-crown" viewBox="0 0 100 100">
			<path d="M10 82 16 30l20 24 14-36 14 36 20-24 6 52Z" />
			<circle cx="16" cy="26" r="6" />
			<circle cx="50" cy="14" r="7" />
			<circle cx="84" cy="26" r="6" />
		</symbol>

		<linearGradient id="card-back-fill" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#7a35ff" />
			<stop offset="0.55" stop-color="#5a17d6" />
			<stop offset="1" stop-color="#3a0d94" />
		</linearGradient>
		<linearGradient id="joker-fill" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#7a35ff" />
			<stop offset="1" stop-color="#dc7df8" />
		</linearGradient>
		<!-- a small diamond lattice, like the back of a classic deck -->
		<pattern id="card-back-lattice" width="12" height="12" patternUnits="userSpaceOnUse">
			<path d="M6 0 12 6 6 12 0 6Z" fill="none" stroke="rgb(255 255 255 / 0.16)" stroke-width="1.2" />
			<circle cx="6" cy="6" r="1.2" fill="rgb(255 255 255 / 0.22)" />
		</pattern>
	</defs>
</svg>
