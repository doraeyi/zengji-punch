<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import SmartphoneNfc from '@lucide/svelte/icons/smartphone-nfc';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Hourglass from '@lucide/svelte/icons/hourglass';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ban from '@lucide/svelte/icons/ban';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Check from '@lucide/svelte/icons/check';
	import Bell from '@lucide/svelte/icons/bell';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { fmtDay, fmtTime, hhmm, localDay } from '#lib/time.js';
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

	const transferConfirm = (p: Person) =>
		`確定要轉移「${p.name}」的帳號到新手機？

舊手機（${p.devices[0]?.label ?? '目前綁定的手機'}）會立刻不能打卡，也不能再登入這個帳號。
請他用新手機登入同一組帳號密碼。`;

	function openEdit(p: Person) {
		editingId = p.id;
		editColor = p.color;
		tpl = Array.from({ length: 7 }, (_, w) => {
			const t = p.templates.find((x) => x.weekday === w);
			return { on: !!t, start: t ? hhmm(t.startTime) : '16:00', end: t ? hhmm(t.endTime) : '19:00' };
		});
	}

	const lastSeen = (d: Date) => (localDay(d) === localDay() ? `今天 ${fmtTime(d)}` : fmtDay(localDay(d)));
</script>

<svelte:head><title>員工｜曾記麻辣燙</title></svelte:head>

<PageHeader kicker="STAFF" title="員工">
	{#snippet action()}
		<button class="btn btn-primary px-3.5 py-2 text-sm" onclick={() => { creating = true; newColor = data.palette[data.people.length % data.palette.length]; }}>
			<UserPlus class="size-4" /> 新增員工
		</button>
	{/snippet}
</PageHeader>

{#if form?.ok}
	<p class="mb-3 flex animate-rise items-center gap-2 rounded-2xl bg-jade-soft px-4 py-3 text-sm font-medium text-jade">
		<Check class="size-4 shrink-0" />{form.ok}
	</p>
{:else if form?.message}
	<p class="mb-3 animate-rise rounded-2xl bg-chili-soft px-4 py-3 text-sm font-medium text-chili-deep">{form.message}</p>
{/if}

<!-- 手機綁定總覽 -->
<h2 class="mb-2.5 flex items-center gap-2 px-1 text-sm font-bold tracking-widest text-muted"><Smartphone class="size-4" /> 手機綁定</h2>
<ul class="card divide-y divide-line/60">
	{#each data.people.filter((p) => p.active) as p (p.id)}
		<li class="flex items-center gap-3 px-4 py-3">
			<span class="size-2.5 shrink-0 rounded-full" style:background={p.color}></span>
			<div class="min-w-0 flex-1">
				<p class="font-bold">{p.name}{#if p.role === 'owner'}<span class="ml-1.5 text-xs font-medium text-chili">老闆</span>{/if}</p>
				{#if p.devices.length}
					<p class="truncate text-xs text-ink-2">
						{p.devices[0].label}{#if p.devices.length > 1}　+{p.devices.length - 1} 台{/if}
					</p>
					<p class="text-[11px] text-muted">{fmtDay(localDay(p.devices[0].createdAt), false)} 綁定 · 最後使用 {lastSeen(p.devices[0].lastSeenAt)}</p>
				{:else if p.waiting}
					<p class="flex items-center gap-1 text-xs font-medium text-[#a35a0c]"><Hourglass class="size-3" /> 等新手機登入</p>
					<p class="truncate text-[11px] text-muted">舊手機 {p.waiting.label} 已在 {lastSeen(p.waiting.at)} 停用</p>
				{:else}
					<p class="text-xs text-muted">尚未綁定手機</p>
				{/if}
			</div>
			{#if p.devices.length && p.id !== data.user.id}
				<form method="POST" action="?/transfer" use:enhance={submit} onsubmit={(e) => { if (!confirm(transferConfirm(p))) e.preventDefault(); }}>
					<input type="hidden" name="id" value={p.id} />
					<button class="btn btn-ghost shrink-0 px-3 py-2 text-sm" disabled={busy}><ArrowRightLeft class="size-4 text-chili" /> 轉移帳號</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>
<p class="mt-2 px-1 text-xs leading-relaxed text-muted">員工換手機：按「轉移帳號」→ 請他用新手機登入同一組帳號密碼。舊手機會立刻停用，也不能再登回來。</p>

<!-- 員工 -->
<h2 class="mt-6 mb-2.5 px-1 text-sm font-bold tracking-widest text-muted">員工資料</h2>

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
						{#if p.role === 'staff' && p.canSchedule}<span class="chip bg-[#fdf0dc] text-[#a35a0c]">可排班</span>{/if}
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
				<form method="POST" action="?/transfer" use:enhance={submit} onsubmit={(e) => { if (!confirm(transferConfirm(editing))) e.preventDefault(); }}>
					<input type="hidden" name="id" value={editing.id} />
					<button class="btn btn-danger w-full" disabled={busy}><ArrowRightLeft class="size-4" /> 轉移帳號（換手機）</button>
				</form>
				<p class="mt-2 text-xs leading-relaxed text-muted">轉移後舊手機立刻不能打卡、也不能再登入這個帳號；請他用新手機登入同一組帳號密碼，打卡紀錄、班表、薪資都會跟著過去。</p>
			{/if}
		</section>

		<!-- 基本資料 -->
		<form method="POST" action="?/update" class="mt-5 space-y-4" use:enhance={submit}>
			<input type="hidden" name="id" value={editing.id} />
			<div>
				<label class="field-label" for="e-name">名字</label>
				<input id="e-name" name="name" class="field" defaultValue={editing.name} required />
			</div>
			<p class="-mt-2 text-xs text-muted">登入帳號：{editing.username}</p>
			{@render wageField(editing.hourlyWage)}
			{@render colorPicker('color', editColor, (c) => (editColor = c))}
			{@render rolePicker(editing.role)}
			{#if editing.role === 'staff'}
				<label class="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3.5 has-checked:border-[#e0a54a] has-checked:bg-[#fdf3e3]">
					<span class="min-w-0">
						<span class="flex items-center gap-1.5 font-bold"><CalendarClock class="size-4 text-[#a35a0c]" /> 排班權限</span>
						<span class="block text-xs leading-relaxed text-muted">可以在月曆新增、修改、刪除班表和登記請假。看不到別人的打卡和薪水，也不能發薪、管理員工。他改的班老闆都會收到通知。</span>
					</span>
					<input type="checkbox" name="canSchedule" checked={editing.canSchedule} class="size-5 shrink-0 accent-[#c27a1a]" />
				</label>
			{/if}
			<button class="btn btn-primary w-full" disabled={busy}>儲存</button>
		</form>

		<!-- 固定班 -->
		<form method="POST" action="?/saveTemplates" class="mt-5 rounded-3xl border border-line p-4" use:enhance={submit}>
			<input type="hidden" name="id" value={editing.id} />
			<p class="flex items-center gap-2 font-bold"><CalendarClock class="size-4 text-chili" /> 固定班</p>
			<p class="mt-1 mb-3 text-xs text-muted">勾選每週固定上班的日子，儲存後會自動排進月曆（從今天起一直往後排）。某一天要調整，直接在月曆上改那天就好。</p>
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
			<input id="wage-{value ?? 'new'}" name="hourlyWage" inputmode="numeric" class="field tabular pl-8" defaultValue={value ?? ''} placeholder="例如 200；老闆不計薪可留空" />
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
				<input type="radio" name="role" value="owner" class="sr-only" checked={role === 'owner'} /> 老闆權限
			</label>
		</div>
		<p class="mt-1.5 text-xs text-muted">給「老闆權限」的人（例如老闆娘）可以排班、發薪、看所有人的打卡與薪水、管理員工。</p>
	</div>
{/snippet}
