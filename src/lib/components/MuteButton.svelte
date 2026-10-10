<script lang="ts">
	import { sfx } from '$lib/client/sfx.svelte';
</script>

<button
	class="fixed right-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 grid h-8 w-8 place-items-center rounded-lg text-light/45 transition-colors hover:bg-white/5 hover:text-light"
	onclick={() => sfx.toggleMute()}
	aria-label={sfx.muted ? 'turn sound on' : 'mute sound'}
	title={sfx.muted ? 'Sound off' : 'Sound on'}
>
	<svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
		{#if sfx.muted}
			<path d="m16 9 5 6m0-6-5 6" />
		{:else}
			<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
		{/if}
	</svg>
</button>
