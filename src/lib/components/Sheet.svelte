<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';

	type Props = { open: boolean; title: string; children: Snippet; onclose: () => void };
	let { open, title, children, onclose }: Props = $props();
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onclose()} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
		<button class="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-label="關閉" onclick={onclose} transition:fade={{ duration: 150 }}></button>
		<div
			class="relative max-h-[88dvh] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-[30px] bg-card px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:rounded-[30px]"
			transition:fly={{ y: 400, duration: 260, opacity: 1 }}
		>
			<div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden"></div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-serif text-xl font-black">{title}</h2>
				<button class="grid size-9 place-items-center rounded-full bg-paper-2 text-ink-2" onclick={onclose} aria-label="關閉">
					<X class="size-4" />
				</button>
			</div>
			{@render children()}
		</div>
	</div>
{/if}
