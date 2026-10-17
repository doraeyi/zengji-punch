<script lang="ts">
	import { fade } from 'svelte/transition';
	import Check from '@lucide/svelte/icons/check';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import { fmtDay, fmtTime, localDay } from '#lib/time.js';

	type Props = {
		name: string;
		kind: 'in' | 'out';
		at: Date;
		/** 推播送到老闆幾台裝置；null = 不知道（例如從登入頁直接打卡） */
		notified: number | null;
		/** 今天已經有下班卡，這次是更新 */
		updated?: boolean;
		onclose: () => void;
	};
	let { name, kind, at, notified, updated = false, onclose }: Props = $props();

	const isIn = $derived(kind === 'in');
</script>

<div
	class="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center"
	transition:fade={{ duration: 180 }}
	role="dialog"
	aria-modal="true"
	aria-label="打卡完成"
>
	<div class="w-full max-w-sm animate-rise overflow-hidden rounded-[32px] bg-card shadow-2xl">
		<div
			class="relative px-6 pt-8 pb-7 text-center text-white"
			class:bg-chili={isIn}
			class:bg-night={!isIn}
		>
			<div
				class="pointer-events-none absolute -top-6 -right-4 font-serif text-[140px] leading-none font-black opacity-10 select-none"
			>
				{isIn ? '上' : '下'}
			</div>
			<div class="mx-auto grid size-20 animate-pop place-items-center rounded-full bg-white/15 ring-8 ring-white/10">
				<Check class="size-11" strokeWidth={3} />
			</div>
			<p class="mt-4 text-sm tracking-[0.3em] text-white/80">{name}</p>
			<h2 class="mt-1 font-serif text-3xl font-black">{isIn ? '上班打卡完成' : updated ? '已更新下班時間' : '下班打卡完成'}</h2>
			<p class="tabular mt-3 font-serif text-6xl font-black">{fmtTime(at)}</p>
			<p class="mt-1 text-white/80">{fmtDay(localDay(at))}</p>
		</div>

		<div class="space-y-4 px-6 py-5">
			{#if notified === null || notified > 0}
				<p class="flex items-center gap-2 rounded-2xl bg-jade-soft px-4 py-3 text-sm font-medium text-jade">
					<BellRing class="size-4 shrink-0" /> 打卡已記錄，已通知老闆
				</p>
			{:else}
				<p class="flex items-center gap-2 rounded-2xl bg-paper-2 px-4 py-3 text-sm text-muted">
					<BellOff class="size-4 shrink-0" /> 打卡已記錄（老闆的手機還沒開啟通知，可在後台查看）
				</p>
			{/if}
			<p class="text-center text-sm text-muted">
				{isIn ? '今天也一起加油！' : '辛苦了，回家路上小心 🙏'}
			</p>
			<button class="btn btn-primary w-full" onclick={onclose}>好</button>
		</div>
	</div>
</div>
