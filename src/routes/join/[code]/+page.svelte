<script lang="ts">
	import App from '$lib/components/app/App.svelte';
	import SeoTags from '$lib/components/app/SeoTags.svelte';

	let { data } = $props();

	const query = $derived(new URLSearchParams({ code: data.code, ...(data.from ? { from: data.from } : {}) }));
</script>

<SeoTags
	title={data.from ? `${data.from} dealt you in — Cambio` : "You're invited to Cambio"}
	description="Tap to join the table · Room {data.code}"
	image="/og.png?{query}"
/>
<App invite={{ code: data.code, from: data.from }} />
