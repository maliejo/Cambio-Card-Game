<script lang="ts">
	import '../app.css';
	import Background from '$lib/components/Background.svelte';
	import CardDefs from '$lib/components/cards/CardDefs.svelte';

	let { children } = $props();
</script>

<CardDefs />
<Background />
{@render children()}
