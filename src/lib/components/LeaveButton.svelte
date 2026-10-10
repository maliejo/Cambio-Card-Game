<script lang="ts">
	import { client } from '$lib/client/game.svelte';

	let { label = 'Leave' }: { label?: string } = $props();

	// two taps instead of a dialog: the first arms the button, the second leaves
	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function click() {
		if (armed) {
			clearTimeout(timer);
			client.leave();
			return;
		}
		armed = true;
		timer = setTimeout(() => (armed = false), 3000);
	}
</script>

<button
	class="rounded-lg px-2 py-1 text-xs font-semibold transition-colors
		{armed ? 'bg-danger text-white shadow-[0_2px_0_var(--color-danger-deep)]' : 'text-light/50 hover:bg-white/5 hover:text-light'}"
	onclick={click}
>
	{armed ? 'Tap again to leave' : `← ${label}`}
</button>
