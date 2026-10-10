<script lang="ts">
	import { fx } from '$lib/client/fx.svelte';
</script>

<!-- big moments get a title slammed across the table: Cambio calls, round results -->
{#if fx.banner}
	{#key fx.banner.id}
		<div class="pointer-events-none fixed inset-0 z-[60] grid place-items-center" aria-live="polite">
			<div class="banner tone-{fx.banner.tone}">
				<p class="title">{fx.banner.title}</p>
				{#if fx.banner.subtitle}<p class="subtitle">{fx.banner.subtitle}</p>{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.banner {
		width: 100%;
		padding: 1.1rem 1rem 1.25rem;
		text-align: center;
		background: var(--band);
		box-shadow:
			0 6px 0 var(--band-edge),
			0 30px 60px rgb(0 0 0 / 0.5);
		animation: slam 2.2s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	.tone-gold {
		--band: linear-gradient(90deg, transparent, var(--color-gold) 15%, var(--color-gold) 85%, transparent);
		--band-edge: rgb(185 128 15 / 0.6);
		color: #2a1700;
	}
	.tone-danger {
		--band: linear-gradient(90deg, transparent, var(--color-danger) 15%, var(--color-danger) 85%, transparent);
		--band-edge: rgb(148 41 79 / 0.6);
		color: white;
	}
	.tone-primary {
		--band: linear-gradient(90deg, transparent, var(--color-primary) 15%, var(--color-primary) 85%, transparent);
		--band-edge: rgb(63 15 163 / 0.6);
		color: white;
	}
	.title {
		font-size: clamp(2.2rem, 8vw, 4.5rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		text-shadow: 0 4px 0 rgb(0 0 0 / 0.18);
	}
	.subtitle {
		margin-top: 0.35rem;
		font-size: 0.9rem;
		font-weight: 600;
		opacity: 0.8;
	}
	@keyframes slam {
		0% {
			opacity: 0;
			scale: 1.6 0.4;
		}
		12% {
			opacity: 1;
			scale: 0.95 1.08;
		}
		20% {
			scale: 1;
		}
		82% {
			opacity: 1;
			scale: 1;
		}
		100% {
			opacity: 0;
			scale: 1 0.6;
		}
	}
</style>
