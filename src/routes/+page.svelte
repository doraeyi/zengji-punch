<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import LogIn from '@lucide/svelte/icons/log-in';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import MapPinOff from '@lucide/svelte/icons/map-pin-off';
	import Lock from '@lucide/svelte/icons/lock';
	import LiveClock from '#lib/components/LiveClock.svelte';
	import PunchDone from '#lib/components/PunchDone.svelte';
	import PushToggle from '#lib/components/PushToggle.svelte';
	import { fmtTime, hhmm } from '#lib/time.js';
	import { distanceMeters, fmtDistance, insideFence } from '#lib/geo.js';
	import sign from '#lib/assets/sign.png';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let busy = $state(false);
	let done = $state<{ kind: 'in' | 'out'; at: Date; notified: number | null; updated?: boolean } | null>(null);
	let error = $state('');

	// 從登入頁「登入並打卡」回來時，直接顯示剛剛那筆
	$effect(() => {
		const s = data.status;
		const latest = s?.last ?? s?.first;
		if (page.url.searchParams.get('just') === '1' && latest && Date.now() - latest.getTime() < 120_000) {
			done = { kind: s?.last ? 'out' : 'in', at: latest, notified: null };
			goto('/', { replace: true, reset: false });
		}
	});

	// ── 打卡範圍：員工要在店家附近，按鈕才會解鎖 ──
	type Geo =
		| { state: 'off' | 'locating' | 'denied' | 'error' }
		| { state: 'fix'; lat: number; lng: number; accuracy: number; distance: number; inside: boolean };
	let geo = $state<Geo>({ state: 'off' });

	$effect(() => {
		const fence = data.fence;
		if (!fence) {
			geo = { state: 'off' };
			return;
		}
		if (!('geolocation' in navigator)) {
			geo = { state: 'error' };
			return;
		}
		geo = { state: 'locating' };
		const id = navigator.geolocation.watchPosition(
			({ coords }) => {
				const distance = distanceMeters({ lat: coords.latitude, lng: coords.longitude }, fence);
				geo = {
					state: 'fix',
					lat: coords.latitude,
					lng: coords.longitude,
					accuracy: coords.accuracy,
					distance,
					inside: insideFence(distance, coords.accuracy, fence.radius)
				};
			},
			(err) => (geo = { state: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' }),
			{ enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
		);
		return () => navigator.geolocation.clearWatch(id);
	});

	/** 沒開打卡範圍就一律可以按；有開就要定位到、而且在範圍內 */
	const locked = $derived(!!data.fence && !(geo.state === 'fix' && geo.inside));

	const next = $derived(data.status?.next ?? 'in');
	const punchLabel = $derived(data.user ? (next === 'in' ? '上班打卡' : '下班打卡') : '打卡');
</script>

<svelte:head><title>曾記麻辣燙｜員工打卡</title></svelte:head>

<div class="relative min-h-dvh overflow-clip">
	<!-- 背景：招牌放大模糊，往下淡入宣紙色 -->
	<div class="pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden" aria-hidden="true">
		<img src={sign} alt="" class="h-full w-full scale-125 object-cover opacity-60 blur-2xl saturate-150" />
		<div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(251,246,238,0.15)_0%,rgba(251,246,238,0.55)_45%,#fbf6ee_92%)]"></div>
	</div>

	<main
		class="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]"
	>
		<header>
			<img
				src={sign}
				alt="曾記麻辣燙 Tsang kee Hot & Spicy"
				class="aspect-[261/65] w-full rounded-2xl object-cover shadow-[0_14px_30px_-14px_rgba(120,50,10,0.65)] ring-1 ring-black/5"
			/>
			<div class="mt-3 flex items-center justify-between px-1">
				<p class="text-xs font-medium tracking-[0.35em] text-ink-2">員工打卡系統</p>
				{#if data.user}
					<span class="chip border border-line bg-card/90 text-ink-2 backdrop-blur">
						<span class="size-2 rounded-full" style:background={data.user.color}></span>
						{data.user.name}
					</span>
				{/if}
			</div>
		</header>

		<section class="flex flex-1 animate-rise flex-col justify-center py-10">
			<LiveClock />

			<div class="mt-5 flex justify-center">
				{#if !data.user}
					<p class="chip bg-paper-2 text-muted">
						<Smartphone class="size-3.5" /> 這支手機還沒綁定，第一次請先登入
					</p>
				{:else}
					<div class="flex flex-wrap justify-center gap-2">
						<p class="chip bg-card text-ink-2 ring-1 ring-line">
							<CalendarDays class="size-3.5 text-chili" />
							{#if data.status?.todayShift?.leave}
								今天請假
							{:else if data.status?.todayShift}
								今天 {hhmm(data.status.todayShift.startTime)} – {hhmm(data.status.todayShift.endTime)}
							{:else}
								今天沒有排班
							{/if}
						</p>
						{#if data.status?.first}
							<p class="chip bg-card text-ink-2 ring-1 ring-line">
								上班 {fmtTime(data.status.first)}{#if data.status.last}　下班 {fmtTime(data.status.last)}{/if}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</section>

		<section class="space-y-3">
			{#if data.user}<PushToggle role={data.user.role} variant="banner" />{/if}
			{#if error}
				<p class="animate-rise rounded-2xl bg-chili-soft px-4 py-3 text-center text-sm font-medium text-chili-deep">
					{error}
				</p>
			{/if}

			<!-- 打卡 -->
			{#if data.user}
				<form
					method="POST"
					action="?/punch"
					use:enhance={() => {
						busy = true;
						error = '';
						return async ({ result, update }) => {
							busy = false;
							if (result.type === 'success' && result.data?.punched) {
								const p = result.data.punched as { kind: 'in' | 'out'; at: Date; notified: number; updated: boolean };
								done = p;
							} else if (result.type === 'failure') {
								error = (result.data?.message as string) ?? '打卡失敗，請再試一次';
							}
							await update({ reset: false });
						};
					}}
				>
					{#if geo.state === 'fix'}
						<input type="hidden" name="lat" value={geo.lat} />
						<input type="hidden" name="lng" value={geo.lng} />
						<input type="hidden" name="accuracy" value={Math.round(geo.accuracy)} />
					{/if}
					{@render punchButton(true)}
				</form>
				{#if data.fence}{@render geoStatus(data.fence.radius)}{/if}
			{:else}
				<a href="/login?then=punch" class="block">{@render punchButton(false)}</a>
			{/if}

			<!-- 登入 / 我的頁面 -->
			<a
				href={data.user ? '/schedule' : '/login'}
				class="card group flex items-center gap-4 px-5 py-5 transition active:scale-[0.99]"
			>
				<span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-paper-2 text-chili">
					{#if data.user}<CalendarDays class="size-7" />{:else}<LogIn class="size-7" />{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-xl font-bold">{data.user ? '我的頁面' : '登入'}</span>
					<span class="block text-sm text-muted">
						{data.user ? '月曆班表 · 打卡紀錄 · 薪水' : '綁定這支手機，之後免登入直接打卡'}
					</span>
				</span>
				<ChevronRight class="size-5 text-muted transition group-hover:translate-x-0.5" />
			</a>

			{#if !data.user}
				<p class="pt-1 text-center text-sm text-muted">
					新來的？<a href="/register" class="font-bold text-chili underline underline-offset-4">註冊帳號</a>
				</p>
			{/if}
			<p class="pt-2 text-center text-xs text-muted/80">換手機或忘記密碼，請找老闆協助</p>
		</section>
	</main>
</div>

{#snippet punchButton(asSubmit: boolean)}
	{@const isOut = data.user && next === 'out'}
	{@const isLocked = asSubmit && locked}
	{@const content = {
		cls: `relative flex w-full items-center gap-5 overflow-hidden rounded-[30px] px-6 py-7 text-left text-white transition ${
			isLocked
				? 'cursor-not-allowed bg-[linear-gradient(135deg,#b9b0a6,#9a9087)] shadow-none'
				: isOut
					? 'active:scale-[0.98] bg-[linear-gradient(135deg,#3b4a59,#232d37)] shadow-[0_18px_40px_-16px_rgba(35,45,55,0.8)]'
					: 'active:scale-[0.98] bg-[linear-gradient(135deg,#d2462c,#9c2717)] shadow-[0_18px_40px_-14px_rgba(143,36,22,0.7)]'
		}`
	}}
	{#if asSubmit}
		<button type="submit" class={content.cls} disabled={busy || locked} aria-disabled={locked}>
			{@render punchInner(isOut ?? false)}
		</button>
	{:else}
		<span class={content.cls}>{@render punchInner(false)}</span>
	{/if}
{/snippet}

{#snippet punchInner(isOut: boolean)}
	<span
		class="pointer-events-none absolute -right-6 -bottom-10 font-serif text-[150px] leading-none font-black opacity-10 select-none"
		aria-hidden="true">{isOut ? '下' : '上'}</span
	>
	<span class="grid size-[72px] shrink-0 place-items-center rounded-full bg-white/15 ring-[6px] ring-white/10">
		{#if busy || (data.user && locked && geo.state === 'locating')}
			<LoaderCircle class="size-9 animate-spin" />
		{:else if data.user && locked}
			<Lock class="size-9" strokeWidth={1.75} />
		{:else}
			<Fingerprint class="size-10" strokeWidth={1.75} />
		{/if}
	</span>
	<span class="relative">
		<span class="block font-serif text-[32px] leading-tight font-black tracking-wider">{punchLabel}</span>
		<span class="mt-0.5 block text-sm text-white/75">
			{#if !data.user}
				登入綁定後就能一鍵打卡
			{:else if busy}
				打卡中…
			{:else if locked}
				{geo.state === 'locating' ? '正在確認你的位置…' : `靠近店家 ${data.fence?.radius} 公尺內才能打卡`}
			{:else if isOut && data.status?.outAfter}
				{fmtTime(data.status.outAfter)} 後可以打下班卡
			{:else if isOut && data.status?.last}
				再按一次會更新下班時間
			{:else}
				按一下完成，並通知老闆
			{/if}
		</span>
	</span>
{/snippet}

{#snippet geoStatus(radius: number)}
	<div class="flex items-center justify-center gap-1.5 text-xs">
		{#if geo.state === 'locating'}
			<MapPin class="size-3.5 animate-pulse text-muted" /><span class="text-muted">定位中…</span>
		{:else if geo.state === 'fix' && geo.inside}
			<MapPin class="size-3.5 text-jade" /><span class="font-medium text-jade">在店家範圍內（{fmtDistance(geo.distance)}）</span>
		{:else if geo.state === 'fix'}
			<MapPin class="size-3.5 text-chili" />
			<span class="text-chili-deep">離店家 {fmtDistance(geo.distance)}，要在 {radius} 公尺內才能打卡</span>
		{:else if geo.state === 'denied'}
			<MapPinOff class="size-3.5 text-chili" />
			<span class="text-chili-deep">沒有定位權限：請到手機「設定 → 隱私 → 定位服務」允許瀏覽器（或曾記打卡）使用位置，再重新整理</span>
		{:else}
			<MapPinOff class="size-3.5 text-chili" /><span class="text-chili-deep">抓不到位置，請打開手機定位（GPS）後重新整理</span>
		{/if}
	</div>
{/snippet}

{#if done && data.user}
	<PunchDone name={data.user.name} kind={done.kind} at={done.at} notified={done.notified} updated={done.updated} onclose={() => (done = null)} />
{/if}
