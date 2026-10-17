<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { title: string; kicker?: string; action?: Snippet };
	let { title, kicker, action }: Props = $props();
</script>

<header class="mb-5 flex items-end justify-between gap-3 pt-2">
	<div>
		{#if kicker}<p class="text-xs font-medium tracking-[0.25em] text-chili">{kicker}</p>{/if}
		<h1 class="font-serif text-[28px] leading-tight font-black tracking-wide">{title}</h1>
	</div>
	{#if action}{@render action()}{/if}
</header>
