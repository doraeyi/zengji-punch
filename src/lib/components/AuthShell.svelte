<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	type Props = { title: string; subtitle?: string; back?: string; children: Snippet };
	let { title, subtitle, back, children }: Props = $props();
</script>

<div class="relative min-h-dvh overflow-clip">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(120%_80%_at_50%_0%,#f9d9c8_0%,rgba(251,246,238,0)_70%)]"
	></div>
	<main
		class="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]"
	>
		{#if back}
			<a href={back} class="-ml-2 inline-flex w-fit items-center gap-1 rounded-xl px-2 py-2 text-sm text-ink-2 hover:bg-paper-2">
				<ArrowLeft class="size-4" /> 返回
			</a>
		{/if}
		<div class="mt-8 mb-8 animate-rise text-center">
			<div class="seal mx-auto size-16 text-3xl">曾</div>
			<h1 class="mt-5 font-serif text-3xl font-black tracking-wider">{title}</h1>
			{#if subtitle}<p class="mt-2 text-sm text-muted">{subtitle}</p>{/if}
		</div>
		{@render children()}
	</main>
</div>
