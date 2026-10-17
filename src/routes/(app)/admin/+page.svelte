<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Check from '@lucide/svelte/icons/check';
	import Bell from '@lucide/svelte/icons/bell';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Download from '@lucide/svelte/icons/download';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Plane from '@lucide/svelte/icons/plane';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Users from '@lucide/svelte/icons/users';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PushToggle from '#lib/components/PushToggle.svelte';
	import { fmtDay, fmtTime, localDay, monthDays } from '#lib/time.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			busy = false;
			await update();
		};
	};

	// 通知
	let showAll = $state(false);
	const feed = $derived(showAll ? data.feed : data.feed.slice(0, 6));
	const FEED_ICON = { punch: Fingerprint, shift: CalendarDays, leave: Plane, payout: Banknote, staff: Users, remind: AlarmClock } as Record<string, typeof Bell>;
	const ago = (d: Date) => (localDay(d) === localDay() ? fmtTime(d) : `${fmtDay(localDay(d), false)} ${fmtTime(d)}`);

	// 打卡範圍：店家位置固定，只選半徑
	const RADII = [50, 100, 150, 200, 300, 500];
	let fenceRadius = $state(untrack(() => data.fence.radius));
	const mapUrl = $derived(`https://www.google.com/maps?q=${data.fence.lat},${data.fence.lng}`);

	// 匯出區間（預設本月）
	const thisMonth = localDay().slice(0, 7);
	let exportFrom = $state(`${thisMonth}-01`);
	let exportTo = $state(monthDays(thisMonth).at(-1)!);

</script>

<svelte:head><title>管理後台｜曾記麻辣燙</title></svelte:head>

<PageHeader kicker="ADMIN" title="管理後台">
	{#snippet action()}
		<a href="/account" class="btn btn-ghost px-3 py-2 text-sm"><UserRound class="size-4" /> 我的帳號</a>
	{/snippet}
</PageHeader>

{#if form?.ok}
	<p class="mb-3 flex animate-rise items-center gap-2 rounded-2xl bg-jade-soft px-4 py-3 text-sm font-medium text-jade">
		<Check class="size-4 shrink-0" />{form.ok}
	</p>
{:else if form?.message}
	<p class="mb-3 animate-rise rounded-2xl bg-chili-soft px-4 py-3 text-sm font-medium text-chili-deep">{form.message}</p>
{/if}

<!-- 通知 -->
<section class="card overflow-hidden">
	<div class="flex items-center gap-2 px-4 pt-4 pb-2">
		<Bell class="size-4 text-chili" />
		<h2 class="font-bold">通知</h2>
		{#if data.feed.some((f) => f.unread)}<span class="chip bg-chili text-white">{data.feed.filter((f) => f.unread).length} 則新的</span>{/if}
	</div>
	<ul class="divide-y divide-line/60">
		{#each feed as f (f.id)}
			{@const Icon = FEED_ICON[f.kind] ?? Bell}
			<li class="flex items-start gap-3 px-4 py-2.5 {f.unread ? 'bg-chili-soft/40' : ''}">
				<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white" style:background={f.color ?? 'var(--color-ink-2)'}>
					<Icon class="size-3.5" />
				</span>
				<p class="min-w-0 flex-1 text-sm leading-snug">{f.text}</p>
				<span class="tabular shrink-0 text-xs text-muted">{ago(f.createdAt)}</span>
			</li>
		{:else}
			<li class="px-4 pb-5 text-sm text-muted">還沒有任何動態</li>
		{/each}
	</ul>
	{#if data.feed.length > 6}
		<button class="w-full border-t border-line/60 py-2.5 text-sm font-medium text-ink-2 hover:bg-paper-2" onclick={() => (showAll = !showAll)}>
			{showAll ? '收起' : `顯示更多（共 ${data.feed.length} 則）`}
		</button>
	{/if}
</section>

<!-- 匯出 Excel -->
<section class="card mt-3 p-4">
	<div class="flex items-center gap-3">
		<span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e3f1e7] text-[#1d6f42]"><FileSpreadsheet class="size-5" /></span>
		<div class="min-w-0 flex-1">
			<p class="font-bold">匯出 Excel</p>
			<p class="text-sm text-muted">薪資總表、每日打卡明細、發放紀錄</p>
		</div>
	</div>
	<div class="mt-3 flex items-center gap-2">
		<input type="date" class="field min-w-0 flex-1 px-3 py-2.5 text-sm" bind:value={exportFrom} aria-label="匯出開始日" />
		<span class="text-muted">–</span>
		<input type="date" class="field min-w-0 flex-1 px-3 py-2.5 text-sm" bind:value={exportTo} aria-label="匯出結束日" />
	</div>
	<a class="btn btn-ghost mt-2.5 w-full" href="/admin/export?from={exportFrom}&to={exportTo}" download data-sveltekit-reload>
		<Download class="size-4" /> 下載 Excel
	</a>
</section>

<!-- 打卡範圍（店家位置固定，只調半徑） -->
<form method="POST" action="?/saveRadius" class="card mt-3 p-4" use:enhance={submit}>
	<div class="flex items-center gap-3">
		<span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-chili text-white"><MapPin class="size-5" /></span>
		<div class="min-w-0 flex-1">
			<p class="font-bold">打卡範圍</p>
			<p class="text-sm text-muted">員工要在店家 <span class="tabular font-bold text-ink">{fenceRadius}</span> 公尺內才能打卡</p>
		</div>
	</div>
	<input type="hidden" name="radius" value={fenceRadius} />
	<div class="mt-3 grid grid-cols-6 gap-1 rounded-2xl bg-paper-2 p-1">
		{#each RADII as r (r)}
			<button type="button" class="tabular rounded-xl py-2 text-sm font-bold {fenceRadius === r ? 'bg-card text-ink shadow-sm' : 'text-muted'}" onclick={() => (fenceRadius = r)}>{r}</button>
		{/each}
	</div>
	<p class="mt-1.5 text-xs text-muted">單位：公尺。室內 GPS 常有 20–50 公尺誤差，建議 100–150。老闆 / 老闆娘不受限制。</p>
	<div class="mt-3 flex items-center gap-2">
		<a class="inline-flex min-w-0 flex-1 items-center gap-1 text-xs text-muted underline underline-offset-2" href={mapUrl} target="_blank" rel="noreferrer">
			店家位置 {data.fence.lat}, {data.fence.lng} <ExternalLink class="size-3 shrink-0" />
		</a>
		<button class="btn btn-primary shrink-0 px-4 py-2 text-sm" disabled={busy || fenceRadius === data.fence.radius}>儲存</button>
	</div>
</form>

<!-- 國定假日雙倍薪 -->
<form method="POST" action="?/setDoublePay" class="card mt-3 flex items-center gap-3 p-4" use:enhance={submit}>
	<span class="grid size-11 shrink-0 place-items-center rounded-2xl {data.doublePay ? 'bg-chili text-white' : 'bg-paper-2 text-muted'}">
		<span class="font-serif text-lg font-black">×2</span>
	</span>
	<div class="min-w-0 flex-1">
		<p class="font-bold">國定假日雙倍薪</p>
		<p class="text-xs text-muted">國慶日、春節這類國定假日上班，薪水自動 ×2。補假、小年夜不算。節日資料來自人事行政總處行事曆。</p>
	</div>
	<input type="hidden" name="on" value={data.doublePay ? '' : 'on'} />
	<button class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition {data.doublePay ? 'bg-chili' : 'bg-line'}" disabled={busy} aria-label={data.doublePay ? '關閉國定假日雙倍薪' : '開啟國定假日雙倍薪'}>
		<span class="absolute left-1 size-5 rounded-full bg-white shadow transition {data.doublePay ? 'translate-x-5' : ''}"></span>
	</button>
</form>

<!-- 推播 -->
<div class="mt-3"><PushToggle role="owner" /></div>
{#if !data.pushReady}
	<p class="mt-2 px-1 text-xs text-chili-deep">伺服器還沒設定 VAPID 推播金鑰，手機收不到通知（見 README）。</p>
{/if}

