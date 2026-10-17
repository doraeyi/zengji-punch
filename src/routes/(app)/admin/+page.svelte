<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import SmartphoneNfc from '@lucide/svelte/icons/smartphone-nfc';
	import Unlink from '@lucide/svelte/icons/unlink';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ban from '@lucide/svelte/icons/ban';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Check from '@lucide/svelte/icons/check';
	import Bell from '@lucide/svelte/icons/bell';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Download from '@lucide/svelte/icons/download';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Plane from '@lucide/svelte/icons/plane';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Users from '@lucide/svelte/icons/users';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PushToggle from '#lib/components/PushToggle.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { fmtDay, fmtTime, hhmm, localDay, monthDays } from '#lib/time.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Person = (typeof data.people)[number];
	let creating = $state(false);
	let editingId = $state<number | null>(null);
	const editing = $derived(data.people.find((p) => p.id === editingId) ?? null);
	let newColor = $state('');
	let editColor = $state('');
	let busy = $state(false);

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') {
				creating = false;
				editingId = null;
			}
			await update();
		};
	};

	// 固定班（週一到週日）
	const WEEK = [1, 2, 3, 4, 5, 6, 0];
	const WD = ['日', '一', '二', '三', '四', '五', '六'];
	let tpl = $state<{ on: boolean; start: string; end: string }[]>([]);

	function openEdit(p: Person) {
		editingId = p.id;
		editColor = p.color;
		tpl = Array.from({ length: 7 }, (_, w) => {
			const t = p.templates.find((x) => x.weekday === w);
			return { on: !!t, start: t ? hhmm(t.startTime) : '16:00', end: t ? hhmm(t.endTime) : '19:00' };
		});
	}

	// 通知
	let showAll = $state(false);
	const feed = $derived(showAll ? data.feed : data.feed.slice(0, 6));
	const FEED_ICON = { punch: Fingerprint, shift: CalendarDays, leave: Plane, payout: Banknote, staff: Users, remind: AlarmClock } as Record<string, typeof Bell>;
	const ago = (d: Date) => (localDay(d) === localDay() ? fmtTime(d) : `${fmtDay(localDay(d), false)} ${fmtTime(d)}`);

	// 打卡範圍
	const RADII = [50, 100, 150, 200, 300, 500];
	// 表單草稿：只用載入當下的設定當初始值
	const savedFence = untrack(() => data.fence);
	let fenceOn = $state(savedFence.enabled);
	let fenceRadius = $state(savedFence.radius);
	let fenceCoords = $state(savedFence.lat || savedFence.lng ? `${savedFence.lat.toFixed(6)}, ${savedFence.lng.toFixed(6)}` : '');
	let locating = $state(false);
	let locateMsg = $state('');

	function useHere() {
		if (!('geolocation' in navigator)) return (locateMsg = '這個瀏覽器不能定位');
		locating = true;
		locateMsg = '';
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				locating = false;
				fenceCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
				locateMsg = `已抓到目前位置（誤差約 ${Math.round(coords.accuracy)} 公尺），記得按儲存`;
			},
			(err) => {
				locating = false;
				locateMsg = err.code === err.PERMISSION_DENIED ? '沒有定位權限，請允許瀏覽器使用位置' : '抓不到位置，請到窗邊或室外再試一次';
			},
			{ enableHighAccuracy: true, timeout: 20_000 }
		);
	}

	// 匯出區間（預設本月）
	const thisMonth = localDay().slice(0, 7);
	let exportFrom = $state(`${thisMonth}-01`);
	let exportTo = $state(monthDays(thisMonth).at(-1)!);

	const lastSeen = (d: Date) => (localDay(d) === localDay() ? `今天 ${fmtTime(d)}` : fmtDay(localDay(d)));
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

<!-- 打卡範圍 -->
<form method="POST" action="?/saveFence" class="card mt-3 p-4" use:enhance={submit}>
	<div class="flex items-center gap-3">
		<span class="grid size-11 shrink-0 place-items-center rounded-2xl {fenceOn ? 'bg-chili text-white' : 'bg-paper-2 text-muted'}"><MapPin class="size-5" /></span>
		<div class="min-w-0 flex-1">
			<p class="font-bold">打卡範圍</p>
			<p class="text-sm text-muted">{fenceOn ? `員工要在店家 ${fenceRadius} 公尺內才能打卡` : '關閉中：任何地方都能打卡'}</p>
		</div>
		<label class="relative inline-flex shrink-0 cursor-pointer items-center">
			<input type="checkbox" name="enabled" bind:checked={fenceOn} class="peer sr-only" />
			<span class="h-7 w-12 rounded-full bg-line transition peer-checked:bg-chili"></span>
			<span class="absolute left-1 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5"></span>
			<span class="sr-only">開啟打卡範圍</span>
		</label>
	</div>

	{#if fenceOn}
		<div class="mt-4 space-y-3">
			<div>
				<span class="field-label">店家位置</span>
				<button type="button" class="btn btn-ghost w-full" disabled={locating} onclick={useHere}>
					{#if locating}<LoaderCircle class="size-4 animate-spin" />{:else}<LocateFixed class="size-4 text-chili" />{/if}
					在店裡按這裡：用我現在的位置
				</button>
				{#if locateMsg}<p class="mt-1.5 text-xs text-ink-2">{locateMsg}</p>{/if}
				<input name="coords" class="field tabular mt-2 text-sm" placeholder="或貼上 Google 地圖座標，例如 25.033964, 121.564468" bind:value={fenceCoords} />
				{#if fenceCoords}
					<a class="mt-1.5 inline-flex items-center gap-1 text-xs text-muted underline underline-offset-2" href="https://www.google.com/maps?q={encodeURIComponent(fenceCoords)}" target="_blank" rel="noreferrer">
						在 Google 地圖確認位置 <ExternalLink class="size-3" />
					</a>
				{/if}
			</div>
			<div>
				<span class="field-label">範圍半徑</span>
				<input type="hidden" name="radius" value={fenceRadius} />
				<div class="grid grid-cols-6 gap-1 rounded-2xl bg-paper-2 p-1">
					{#each RADII as r (r)}
						<button type="button" class="tabular rounded-xl py-2 text-sm font-bold {fenceRadius === r ? 'bg-card text-ink shadow-sm' : 'text-muted'}" onclick={() => (fenceRadius = r)}>{r}</button>
					{/each}
				</div>
				<p class="mt-1.5 text-xs text-muted">單位：公尺。室內 GPS 常有 20–50 公尺誤差，建議 100–150。</p>
			</div>
		</div>
	{:else}
		<input type="hidden" name="coords" value={fenceCoords} />
		<input type="hidden" name="radius" value={fenceRadius} />
	{/if}
	<button class="btn btn-primary mt-4 w-full" disabled={busy}>儲存打卡範圍</button>
	<p class="mt-2 text-xs text-muted">只限制員工；老闆 / 老闆娘在哪裡都能打卡。補登打卡不受影響。</p>
</form>

<!-- 推播 -->
<div class="mt-3"><PushToggle role="owner" /></div>
{#if !data.pushReady}
	<p class="mt-2 px-1 text-xs text-chili-deep">伺服器還沒設定 VAPID 推播金鑰，手機收不到通知（見 README）。</p>
{/if}

<!-- 員工 -->
<div class="mt-6 mb-2.5 flex items-center justify-between px-1">
	<h2 class="text-sm font-bold tracking-widest text-muted">員工與裝置</h2>
	<button class="btn btn-primary px-3.5 py-2 text-sm" onclick={() => { creating = true; newColor = data.palette[data.people.length % data.palette.length]; }}>
		<UserPlus class="size-4" /> 新增員工
	</button>
</div>

<ul class="space-y-2.5">
	{#each data.people as p (p.id)}
		<li>
			<button class="card flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.99] {p.active ? '' : 'opacity-55'}" onclick={() => openEdit(p)}>
				<span class="grid size-12 shrink-0 place-items-center rounded-full font-serif text-xl font-black text-white" style:background={p.color}>
					{p.name.slice(0, 1)}
				</span>
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-2">
						<span class="truncate text-lg font-bold">{p.name}</span>
						{#if p.role === 'owner'}<span class="chip bg-chili-soft text-chili-deep">老闆</span>{/if}
						{#if !p.active}<span class="chip bg-paper-2 text-muted">已停用</span>{/if}
						{#if p.hourlyWage}<span class="tabular ml-auto text-sm text-muted">時薪 ${p.hourlyWage}</span>{/if}
					</span>
					{#if p.devices.length}
						<span class="flex items-center gap-1 truncate text-sm text-ink-2">
							<SmartphoneNfc class="size-3.5 shrink-0 text-jade" />
							{p.devices[0].label}{#if p.devices.length > 1}<span class="text-muted">　+{p.devices.length - 1}</span>{/if}
						</span>
					{:else}
						<span class="flex items-center gap-1 text-sm text-[#a35a0c]"><Smartphone class="size-3.5" /> 尚未綁定手機</span>
					{/if}
					<span class="flex items-center gap-1 text-xs {p.pushDevices ? 'text-jade' : 'text-muted'}">
						<Bell class="size-3" />{p.pushDevices ? `已開通知（${p.pushDevices} 台）` : '未開通知'}
					</span>
				</span>
				<ChevronRight class="size-5 shrink-0 text-muted" />
			</button>
		</li>
	{/each}
</ul>

<!-- 新增員工 -->
<Sheet open={creating} title="新增員工" onclose={() => (creating = false)}>
	<form method="POST" action="?/create" class="space-y-4" use:enhance={submit}>
		<div>
			<label class="field-label" for="c-name">名字</label>
			<input id="c-name" name="name" class="field" placeholder="例如：小美" required />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="field-label" for="c-user">登入帳號</label>
				<input id="c-user" name="username" class="field" autocapitalize="none" placeholder="mei" required />
			</div>
			<div>
				<label class="field-label" for="c-pass">初始密碼</label>
				<input id="c-pass" name="password" class="field" placeholder="至少 6 字" minlength="6" required />
			</div>
		</div>
		{@render wageField(null)}
		{@render colorPicker('color', newColor, (c) => (newColor = c))}
		{@render rolePicker('staff')}
		<button class="btn btn-primary w-full" disabled={busy}>新增</button>
	</form>
</Sheet>

<!-- 管理單一員工 -->
<Sheet open={!!editing} title={editing?.name ?? ''} onclose={() => (editingId = null)}>
	{#if editing}
		<!-- 裝置綁定 -->
		<section class="rounded-3xl bg-paper-2 p-4">
			<p class="mb-2 flex items-center gap-2 font-bold"><Smartphone class="size-4 text-chili" /> 綁定的裝置</p>
			{#each editing.devices as d (d.id)}
				<div class="mb-2 rounded-2xl bg-card px-3.5 py-2.5 text-sm">
					<p class="font-medium">{d.label}</p>
					<p class="text-xs text-muted">{fmtDay(localDay(d.createdAt))} 綁定 · 最後使用 {lastSeen(d.lastSeenAt)}</p>
				</div>
			{:else}
				<p class="mb-2 text-sm text-muted">目前沒有綁定，他下次登入時就會綁定那支手機。</p>
			{/each}
			{#if editing.devices.length}
				<form method="POST" action="?/unbind" use:enhance={submit} onsubmit={(e) => { if (!confirm(`解除 ${editing.name} 的手機綁定？舊手機將無法再打卡。`)) e.preventDefault(); }}>
					<input type="hidden" name="id" value={editing.id} />
					<button class="btn btn-danger w-full" disabled={busy}><Unlink class="size-4" /> 解除綁定（換手機）</button>
				</form>
				<p class="mt-2 text-xs leading-relaxed text-muted">解除後，請他用新手機打開網站並登入，就會自動綁定新手機。</p>
			{/if}
		</section>

		<!-- 基本資料 -->
		<form method="POST" action="?/update" class="mt-5 space-y-4" use:enhance={submit}>
			<input type="hidden" name="id" value={editing.id} />
			<div>
				<label class="field-label" for="e-name">名字</label>
				<input id="e-name" name="name" class="field" value={editing.name} required />
			</div>
			<p class="-mt-2 text-xs text-muted">登入帳號：{editing.username}</p>
			{@render wageField(editing.hourlyWage)}
			{@render colorPicker('color', editColor, (c) => (editColor = c))}
			{@render rolePicker(editing.role)}
			<button class="btn btn-primary w-full" disabled={busy}>儲存</button>
		</form>

		<!-- 固定班 -->
		<form method="POST" action="?/saveTemplates" class="mt-5 rounded-3xl border border-line p-4" use:enhance={submit}>
			<input type="hidden" name="id" value={editing.id} />
			<p class="flex items-center gap-2 font-bold"><CalendarClock class="size-4 text-chili" /> 固定班</p>
			<p class="mt-1 mb-3 text-xs text-muted">勾選每週固定上班的日子。設定後到「月曆」按「套用固定班」，就會自動排好整個月。</p>
			<ul class="space-y-1.5">
				{#each WEEK as w (w)}
					<li class="flex items-center gap-2 rounded-2xl px-2 py-1.5 {tpl[w]?.on ? 'bg-chili-soft/50' : 'bg-paper/70'}">
						<label class="flex w-14 shrink-0 cursor-pointer items-center gap-2 font-bold">
							<input type="checkbox" name="on_{w}" bind:checked={tpl[w].on} class="size-4 accent-[#b8321f]" />週{WD[w]}
						</label>
						{#if tpl[w].on}
							<input type="time" name="start_{w}" bind:value={tpl[w].start} class="field time-compact tabular min-w-0 flex-1 px-1 py-1.5 text-sm" aria-label="週{WD[w]}上班" />
							<span class="text-muted">–</span>
							<input type="time" name="end_{w}" bind:value={tpl[w].end} class="field time-compact tabular min-w-0 flex-1 px-1 py-1.5 text-sm" aria-label="週{WD[w]}下班" />
						{:else}
							<span class="text-sm text-muted">休</span>
						{/if}
					</li>
				{/each}
			</ul>
			<button class="btn btn-ghost mt-3 w-full" disabled={busy}>儲存固定班</button>
		</form>

		<!-- 重設密碼 -->
		<form method="POST" action="?/resetPassword" class="mt-5 rounded-3xl border border-line p-4" use:enhance={submit}>
			<input type="hidden" name="id" value={editing.id} />
			<p class="mb-3 flex items-center gap-2 font-bold"><KeyRound class="size-4 text-chili" /> 重設密碼</p>
			<div class="flex gap-2">
				<input name="password" class="field min-w-0 flex-1" placeholder="新密碼" minlength="6" required />
				<button class="btn btn-ghost shrink-0" disabled={busy}>重設</button>
			</div>
			<p class="mt-2 text-xs text-muted">忘記密碼時用。重設後舊手機綁定也會解除。</p>
		</form>

		{#if editing.id !== data.user.id}
			<form method="POST" action="?/toggleActive" class="mt-3" use:enhance={submit}>
				<input type="hidden" name="id" value={editing.id} />
				{#if editing.active}
					<button class="btn w-full text-chili-deep hover:bg-chili-soft" disabled={busy}><Ban class="size-4" /> 停用這位員工（離職）</button>
				{:else}
					<button class="btn w-full text-jade hover:bg-jade-soft" disabled={busy}><RotateCcw class="size-4" /> 恢復這位員工</button>
				{/if}
			</form>
		{/if}
	{/if}
</Sheet>

{#snippet colorPicker(name: string, value: string, set: (c: string) => void)}
	<div>
		<span class="field-label">代表色</span>
		<input type="hidden" {name} {value} />
		<div class="flex flex-wrap gap-2.5">
			{#each data.palette as c (c)}
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition {value === c ? 'ring-2' : ''}"
					style:background={c}
					style:--tw-ring-color={c}
					aria-label="選擇顏色 {c}"
					aria-pressed={value === c}
					onclick={() => set(c)}
				>
					{#if value === c}<Check class="size-4 text-white" strokeWidth={3} />{/if}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet wageField(value: number | null)}
	<div>
		<label class="field-label" for="wage-{value ?? 'new'}">時薪（元）</label>
		<div class="relative">
			<span class="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">$</span>
			<input id="wage-{value ?? 'new'}" name="hourlyWage" inputmode="numeric" class="field tabular pl-8" value={value ?? ''} placeholder="例如 200；老闆不計薪可留空" />
		</div>
	</div>
{/snippet}

{#snippet rolePicker(role: string)}
	<div>
		<span class="field-label">身分</span>
		<div class="grid grid-cols-2 gap-1 rounded-2xl bg-paper-2 p-1">
			<label class="cursor-pointer rounded-xl py-2.5 text-center text-sm font-bold text-muted has-checked:bg-card has-checked:text-ink has-checked:shadow-sm">
				<input type="radio" name="role" value="staff" class="sr-only" checked={role === 'staff'} /> 員工
			</label>
			<label class="cursor-pointer rounded-xl py-2.5 text-center text-sm font-bold text-muted has-checked:bg-card has-checked:text-ink has-checked:shadow-sm">
				<input type="radio" name="role" value="owner" class="sr-only" checked={role === 'owner'} /> 老闆 / 管理者
			</label>
		</div>
		<p class="mt-1.5 text-xs text-muted">老闆可以編班表、記薪資、管理員工裝置。</p>
	</div>
{/snippet}
