<!--
	The room the table stands in: a deep purple void with slowly drifting light,
	a faint grain so the gradients never band, and a vignette pulling the eye inward.
-->
<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
	<div class="base"></div>
	<div class="swirl"></div>
	<div class="swirl swirl-2"></div>
	<div class="grain"></div>
	<div class="vignette"></div>
</div>

<style>
	div > div {
		position: absolute;
		inset: 0;
	}
	.base {
		background: radial-gradient(ellipse 80% 70% at 50% 45%, #2a1560 0%, #170c35 50%, var(--color-ink) 100%);
	}
	.swirl {
		inset: -40%;
		background: conic-gradient(
			from 0deg at 50% 50%,
			rgb(103 31 243 / 0.32),
			rgb(220 125 248 / 0.16),
			rgb(222 96 142 / 0.14),
			rgb(103 31 243 / 0.06),
			rgb(103 31 243 / 0.32)
		);
		filter: blur(80px);
		mix-blend-mode: screen;
		opacity: 0.7;
		animation: spin 90s linear infinite;
	}
	.swirl-2 {
		inset: -20% -60% -60% -20%;
		opacity: 0.4;
		animation-duration: 140s;
		animation-direction: reverse;
	}
	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	.grain {
		opacity: 0.07;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}
	.vignette {
		background: radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%);
	}
</style>
