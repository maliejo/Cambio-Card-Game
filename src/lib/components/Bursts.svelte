<script lang="ts">
	import { fx } from '$lib/client/fx.svelte';

	const COLORS = ['var(--color-gold)', 'var(--color-secondary)', 'white', 'var(--color-danger)'];
	const SPARKS = 14;
</script>

<!-- sparks flying off a spot: correct flips, a won round -->
{#each fx.bursts as burst (burst.id)}
	<div class="pointer-events-none fixed z-[55]" style:left="{burst.x}px" style:top="{burst.y}px" aria-hidden="true">
		{#each { length: SPARKS }, i}
			{@const angle = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4}
			{@const distance = 40 + Math.random() * 50}
			<span
				class="spark"
				style:--dx="{Math.cos(angle) * distance}px"
				style:--dy="{Math.sin(angle) * distance}px"
				style:background={COLORS[i % COLORS.length]}
			></span>
		{/each}
	</div>
{/each}

<style>
	.spark {
		position: absolute;
		width: 7px;
		height: 7px;
		margin: -3.5px;
		border-radius: 2px;
		animation: fly 800ms cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
	}
	@keyframes fly {
		0% {
			translate: 0 0;
			scale: 1.3;
			rotate: 0deg;
			opacity: 1;
		}
		100% {
			translate: var(--dx) calc(var(--dy) + 24px);
			scale: 0.2;
			rotate: 200deg;
			opacity: 0;
		}
	}
</style>
