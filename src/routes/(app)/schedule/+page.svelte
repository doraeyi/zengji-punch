<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import X from '@lucide/svelte/icons/x';
	import Plane from '@lucide/svelte/icons/plane';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { addMonths, fmtDay, fmtDuration, fmtMoney, fmtTime, hhmm, monthDays, weekdayOf } from '#lib/time.js';
	import { hours, shortHoliday, shortName, shortTime } from '#lib/display.js';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** 送出表單時保留目前的篩選（月份、員工、區間） */
	const act = (name: string) => `${page.url.search ? `${page.url.search}&` : '?'}/${name}`;

	const isOwner = $derived(data.user.role === 'owner');
	const days = $derived(monthDays(data.month));
	/** 週日開頭，前面補空格 */
	const lead = $derived(weekdayOf(days[0]));
	/** 六日與節日的日期用紅字 */
	const isRed = (day: string) => !!data.holidays[day] || weekdayOf(day) === 0 || weekdayOf(day) === 6;
	const [y, m] = $derived(data.month.split('-').map(Number));
	const focus = $derived(data.who === 'all' ? null : data.who);
	const person = (id: number) => data.staff.find((s) => s.id === id);
	const recordOf = (id: number, day: string) => data.records[id]?.[Number(day.slice(8)) - 1];
	const shiftsOn = (day: string) => data.shifts.filter((s) => s.day === day);

	const q = (params: { month?: string; who?: number | 'all' }) =>
		`?month=${params.month ?? data.month}&who=${params.who ?? data.who}`;

	// ── 點某一天 ──
	let openDay = $state<string | null>(null);
	type Draft = { id?: number; employeeId: number; day: string; startTime: string; endTime: string; note: string; leave: boolean };
	let draft = $state<Draft | null>(null);
	let punchFix = $state<{ employeeId: number; day: string } | null>(null);
	let busy = $state(false);

	/** 當天要列出的人：有排班的 + 沒排班但有打卡的（只限看得到的紀錄） */
	const dayPeople = $derived.by(() => {
		if (!openDay) return [];
		const day = openDay;
		const ids = new Set(shiftsOn(day).map((s) => s.employeeId));
		for (const id of Object.keys(data.records).map(Number)) {
			if (recordOf(id, day)?.sessions.length) ids.add(id);
		}
		return [...ids]
			.filter((id) => !focus || id === focus)
			.map((id) => ({ p: person(id)!, shift: shiftsOn(day).find((s) => s.employeeId === id), rec: recordOf(id, day) }))
			.filter((x) => x.p);
	});

	function newShift(day: string) {
		const employeeId = focus ?? data.staff.find((s) => s.role === 'staff')?.id ?? data.staff[0]?.id ?? 0;
		const last = data.shifts.findLast((s) => s.employeeId === employeeId);
		draft = {
			employeeId,
			day,
			startTime: last ? hhmm(last.startTime) : '16:00',
			endTime: last ? hhmm(last.endTime) : '19:00',
			note: '',
			leave: false
		};
	}
	function editShift(s: (typeof data.shifts)[number]) {
		draft = { id: s.id, employeeId: s.employeeId, day: s.day, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), note: s.note ?? '', leave: s.leave };
	}

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') {
				draft = null;
				punchFix = null;
			}
			await update({ reset: false });
		};
	};

	const STATUS_TINT: Record<string, string> = {
		absent: 'bg-chili-soft',
		'missing-out': 'ring-1 ring-inset ring-chili/50',
		leave: 'bg-[#fdf3e3]'
	};
</script>

<svelte:head><title>月曆｜曾記麻辣燙</title></svelte:head>

<PageHeader kicker="CALENDAR" title="月曆班表" />

<!-- 看誰 -->
<div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
	<a href={q({ who: 'all' })} class="shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium {data.who === 'all' ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2'}">
		全店班表
	</a>
	{#each isOwner ? data.staff : data.staff.filter((s) => s.id === data.user.id) as s (s.id)}
		{@const on = data.who === s.id}
		<a
			href={q({ who: s.id })}
			class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium {on ? 'border-transparent text-white' : 'border-line bg-card text-ink-2'}"
			style:background={on ? s.color : undefined}
		>
			{#if !on}<span class="size-2 rounded-full" style:background={s.color}></span>{/if}
			{s.id === data.user.id && !isOwner ? '我的打卡與薪資' : s.name}
		</a>
	{/each}
</div>

<!-- 月份 -->
<div class="card flex items-center justify-between p-2">
	<a href={q({ month: addMonths(data.month, -1) })} class="grid size-11 place-items-center rounded-2xl hover:bg-paper-2" aria-label="上個月"><ChevronLeft class="size-5" /></a>
	<p class="font-serif text-lg font-black"><span class="tabular">{y}</span> 年 <span class="tabular">{m}</span> 月</p>
	<a href={q({ month: addMonths(data.month, 1) })} class="grid size-11 place-items-center rounded-2xl hover:bg-paper-2" aria-label="下個月"><ChevronRight class="size-5" /></a>
</div>

{#if form?.message}
	<p class="mt-3 rounded-2xl bg-chili-soft px-4 py-3 text-sm text-chili-deep">{form.message}</p>
{/if}

<!-- 個人統計 -->
{#if data.summary && focus}
	{@const p = person(focus)}
	<div class="mt-3 grid grid-cols-3 gap-2">
		<div class="col-span-3 flex items-center justify-between rounded-3xl bg-[linear-gradient(135deg,#c63c25,#8f2416)] px-5 py-4 text-white shadow-[0_14px_30px_-16px_rgba(143,36,22,0.8)]">
			<div>
				<p class="text-xs tracking-widest text-white/75">{m} 月薪資（已下班的部分）</p>
				<p class="tabular font-serif text-3xl font-black">{fmtMoney(data.summary.amount)}</p>
			</div>
			<div class="text-right text-sm">
				<p class="text-white/75">時薪 <span class="tabular font-bold text-white">{p?.hourlyWage ? fmtMoney(p.hourlyWage) : '未設定'}</span></p>
				<p class="text-white/75">計薪 <span class="tabular font-bold text-white">{hours(data.summary.paidMinutes)}</span> 小時</p>
			</div>
		</div>
		<div class="card px-3 py-3 text-center">
			<p class="text-[11px] text-muted">已領</p>
			<p class="tabular font-bold text-jade">{fmtMoney(data.summary.paidAmount)}</p>
		</div>
		<div class="card px-3 py-3 text-center">
			<p class="text-[11px] text-muted">未領</p>
			<p class="tabular font-bold text-chili">{fmtMoney(data.summary.unpaidAmount)}</p>
		</div>
		<div class="card px-3 py-3 text-center">
			<p class="text-[11px] text-muted">遲到 / 缺卡</p>
			<p class="tabular font-bold">{data.summary.late} / {data.summary.issues}</p>
		</div>
	</div>
{/if}

<!-- 月曆 -->
<div class="card mt-3 overflow-hidden p-1.5">
	<div class="grid grid-cols-7 pb-1 text-center text-[11px] font-bold text-muted">
		{#each ['日', '一', '二', '三', '四', '五', '六'] as w (w)}<span class="py-1 {w === '日' || w === '六' ? 'text-chili' : ''}">{w}</span>{/each}
	</div>
	<div class="grid grid-cols-7 gap-1">
		{#each { length: lead } as _, i (i)}<span></span>{/each}
		{#each days as day (day)}
			{@const isToday = day === data.today}
			{@const list = shiftsOn(day)}
			{#if focus}
				{@const rec = recordOf(focus, day)}
				{@const shift = rec?.shift}
				{@const firstIn = rec?.sessions.find((s) => s.in)?.in}
				{@const lastOut = rec?.sessions.findLast((s) => s.out)?.out}
				<button
					class="relative flex min-h-[86px] min-w-0 flex-col items-stretch rounded-xl bg-paper/70 px-1 pt-1 pb-1.5 text-left transition active:scale-95 {STATUS_TINT[rec?.status ?? ''] ?? ''} {isToday ? 'ring-2 ring-chili' : ''}"
					onclick={() => (openDay = day)}
				>
					<span class="flex items-center justify-between">
						{@render dayNum(day, isToday)}
						{#if rec?.multiplier === 2}
							<span class="rounded bg-chili px-0.5 text-[9px] leading-[13px] font-black text-white">×2</span>
						{:else if rec?.payoutId && rec.amount}
							<CheckCheck class="size-3.5 text-jade" strokeWidth={3} />
						{/if}
					</span>
					{@render holidayName(day)}
					{#if shift?.leave}
						<span class="mt-0.5 rounded bg-[#f6dfb8] px-0.5 text-center text-[10px] font-bold text-[#8a4b08]">請假</span>
					{:else if shift}
						<span class="tabular mt-0.5 truncate text-[10px] text-muted">{shortTime(shift.startTime)}–{shortTime(shift.endTime)}</span>
					{/if}
					{#if firstIn}<span class="tabular text-[10px] leading-tight font-medium text-chili-deep">{fmtTime(firstIn.at)}</span>{/if}
					{#if lastOut}
						<span class="tabular text-[10px] leading-tight font-medium text-night">{fmtTime(lastOut.at)}</span>
					{:else if rec?.status === 'working'}
						<span class="text-[10px] leading-tight font-medium text-jade">上班中</span>
					{:else if rec?.status === 'missing-out'}
						<span class="text-[10px] leading-tight text-chili">缺卡</span>
					{:else if rec?.status === 'absent'}
						<span class="text-[10px] leading-tight text-chili">未到</span>
					{/if}
					{#if rec?.amount}
						<span class="tabular mt-auto text-[11px] font-black {rec.payoutId ? 'text-jade' : 'text-ink'}">
							${rec.amount}
						</span>
					{/if}
					{#if rec?.payoutId && rec.amount}<span class="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-jade/60"></span>{/if}
				</button>
			{:else}
				<button
					class="flex min-h-[86px] min-w-0 flex-col gap-0.5 rounded-xl bg-paper/70 px-1 pt-1 pb-1 text-left transition active:scale-95 {isToday ? 'ring-2 ring-chili' : ''}"
					onclick={() => (openDay = day)}
				>
					{@render dayNum(day, isToday)}
					{@render holidayName(day)}
					{#each list.slice(0, 4) as s (s.id)}
						{@const p = person(s.employeeId)}
						{@const done = recordOf(s.employeeId, day)?.sessions.length}
						<span
							class="truncate rounded-[5px] px-1 text-center text-[10px] leading-[16px] font-bold {s.leave ? 'text-muted line-through' : done ? 'text-white' : ''}"
							style:background={s.leave ? 'var(--color-paper-2)' : done ? p?.color : `${p?.color}1f`}
							style:color={!s.leave && !done ? p?.color : undefined}
						>
							{p ? shortName(p.name) : '?'}
						</span>
					{/each}
					{#if list.length > 4}<span class="text-[10px] text-muted">+{list.length - 4}</span>{/if}
				</button>
			{/if}
		{/each}
	</div>
</div>

<!-- 圖例 -->
<div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
	{#if focus}
		<span><span class="text-ink-2">16–19</span> 排班</span>
		<span><span class="font-medium text-chili-deep">16:02</span> 上班卡</span>
		<span><span class="font-medium text-night">19:30</span> 下班卡</span>
		<span class="flex items-center gap-1"><CheckCheck class="size-3 text-jade" /> 已領薪</span>
		<span class="flex items-center gap-1"><span class="size-2.5 rounded bg-[#f6dfb8]"></span>請假</span>
	{:else}
		{#each data.staff as s (s.id)}
			<span class="flex items-center gap-1"><span class="size-2 rounded-full" style:background={s.color}></span>{s.name}</span>
		{/each}
		<span class="flex items-center gap-1"><span class="h-2.5 w-4 rounded-sm bg-ink-2"></span>已打卡</span>
		<span class="flex items-center gap-1"><span class="h-2.5 w-4 rounded-sm bg-ink-2/15"></span>排班</span>
	{/if}
</div>

<!-- 某一天 -->
<Sheet
	open={!!openDay && !draft && !punchFix}
	title={openDay ? `${fmtDay(openDay)}${data.holidays[openDay] ? `　${data.holidays[openDay].name}` : ''}` : ''}
	onclose={() => (openDay = null)}
>
	{#if openDay}
		<ul class="space-y-2.5">
			{#each dayPeople as { p, shift, rec } (p.id)}
				<li class="rounded-3xl border border-line bg-paper/60 p-4">
					<div class="flex items-center gap-2">
						<span class="size-2.5 shrink-0 rounded-full" style:background={p.color}></span>
						<span class="font-bold">{p.name}</span>
						{#if shift?.leave}
							<span class="chip bg-[#f6dfb8] text-[#8a4b08]"><Plane class="size-3" /> 請假</span>
						{:else if shift}
							<span class="tabular text-sm text-ink-2">排班 {hhmm(shift.startTime)}–{hhmm(shift.endTime)}</span>
						{:else}
							<span class="text-sm text-muted">沒有排班</span>
						{/if}
						{#if data.canEdit && shift && (isOwner || p.role === 'staff')}
							<button class="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-card text-ink-2 hover:text-chili" aria-label="編輯 {p.name} 的班" onclick={() => editShift(shift)}>
								<PencilLine class="size-4" />
							</button>
						{/if}
					</div>
					{#if shift?.note}<p class="mt-1 text-xs text-muted">{shift.note}</p>{/if}

					{#if rec}
						{#if rec.sessions.length}
							<div class="mt-3 space-y-1.5">
								{#each rec.sessions as s, i (i)}
									<div class="flex flex-wrap items-center gap-1.5 text-sm">
										{@render stamp(s.in, 'in')}
										<ArrowRight class="size-3.5 text-muted" />
										{@render stamp(s.out, 'out')}
									</div>
								{/each}
							</div>
						{/if}
						{#if rec.extra.length}
							<p class="mt-1.5 text-xs text-muted">
								中間另外按了 {rec.extra.length} 次（{rec.extra.map((x) => fmtTime(x.at)).join('、')}），以最早、最晚為準，不影響計算
							</p>
						{/if}
						{#if rec.paidMinutes}
							<div class="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-card px-3.5 py-2.5">
								<span class="tabular min-w-0 text-sm text-ink-2">
									<span class="block">{fmtDuration(rec.paidMinutes)}{#if p.hourlyWage} × {fmtMoney(p.hourlyWage)}{/if}</span>
									{#if rec.multiplier === 2}
										<span class="mt-0.5 inline-block rounded bg-chili px-1.5 text-xs font-bold text-white">國定假日 ×2</span>
									{/if}
								</span>
								<span class="flex shrink-0 items-center gap-2">
									{#if rec.payoutId}<span class="chip whitespace-nowrap bg-jade-soft text-jade">已領</span>{:else}<span class="chip whitespace-nowrap bg-paper-2 text-muted">未領</span>{/if}
									<span class="tabular font-serif text-xl font-black">{fmtMoney(rec.amount)}</span>
								</span>
							</div>
						{:else if rec.status === 'absent'}
							<p class="mt-2 text-sm text-chili">有排班但沒有打卡</p>
						{:else if rec.status === 'working'}
							<p class="mt-2 text-sm text-jade">上班中，下班打卡後計算薪資</p>
						{/if}
						{#if rec.lateMinutes}<p class="mt-2 text-xs text-[#a35a0c]">遲到 {fmtDuration(rec.lateMinutes)}</p>{/if}
						{#if isOwner}
							<button class="mt-2 text-xs text-muted underline underline-offset-2" onclick={() => (punchFix = { employeeId: p.id, day: openDay! })}>補登打卡</button>
						{/if}
					{/if}
				</li>
			{:else}
				<li class="rounded-3xl bg-paper-2 px-4 py-8 text-center text-sm text-muted">這天沒有排班</li>
			{/each}
		</ul>
		{#if data.canEdit}
			<button class="btn btn-primary mt-4 w-full" onclick={() => newShift(openDay!)}><Plus class="size-4" /> 在這天排班</button>
		{/if}
	{/if}
</Sheet>

{#snippet dayNum(day: string, isToday: boolean)}
	<span
		class="tabular text-xs font-bold {isToday
			? 'grid size-5 place-items-center rounded-full bg-chili text-white'
			: isRed(day)
				? 'text-chili'
				: 'text-ink-2'}">{Number(day.slice(8))}</span
	>
{/snippet}

{#snippet holidayName(day: string)}
	{#if data.holidays[day]}
		<span class="truncate text-[9px] leading-tight font-bold {data.holidays[day].double ? 'text-chili' : 'text-chili/60'}">{shortHoliday(data.holidays[day].name)}</span>
	{/if}
{/snippet}

{#snippet stamp(p: { id: number; at: Date; source: string; distance: number | null } | null, kind: 'in' | 'out')}
	{#if p}
		<span class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 {kind === 'in' ? 'bg-chili-soft/80' : 'bg-night-soft'}">
			<span class="text-xs text-muted">{kind === 'in' ? '上班' : '下班'}</span>
			<span class="tabular font-bold">{fmtTime(p.at)}</span>
			{#if p.source === 'manual'}<span class="text-[10px] text-muted">補登</span>{/if}
			{#if isOwner && p.distance !== null}<span class="text-[10px] text-muted" title="打卡時離店家的距離">📍{p.distance}m</span>{/if}
			{#if isOwner}
				<form method="POST" action={act("deletePunch")} use:enhance={submit} class="contents" onsubmit={(e) => { if (!confirm(`刪除這筆 ${fmtTime(p.at)} 的打卡？`)) e.preventDefault(); }}>
					<input type="hidden" name="id" value={p.id} />
					<button class="-mr-1 grid size-5 place-items-center rounded-full text-muted hover:bg-chili hover:text-white" aria-label="刪除這筆打卡"><X class="size-3" /></button>
				</form>
			{/if}
		</span>
	{:else}
		<span class="rounded-xl border border-dashed border-chili/40 px-2.5 py-1 text-xs text-chili">未打{kind === 'in' ? '上班' : '下班'}卡</span>
	{/if}
{/snippet}

<!-- 排班 / 改班 / 請假 -->
<Sheet open={!!draft} title={draft?.id ? '修改班次' : '排班'} onclose={() => (draft = null)}>
	{#if draft}
		<form method="POST" action={act("save")} class="space-y-4" use:enhance={submit}>
			{#if draft.id}<input type="hidden" name="id" value={draft.id} />{/if}
			<div>
				<span class="field-label">員工</span>
				<div class="flex flex-wrap gap-2">
					{#each isOwner ? data.staff : data.staff.filter((x) => x.role === 'staff') as s (s.id)}
						<label
							class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium has-checked:text-white"
							style:background={draft.employeeId === s.id ? s.color : undefined}
							style:border-color={draft.employeeId === s.id ? s.color : 'var(--color-line)'}
						>
							<input type="radio" name="employeeId" value={s.id} bind:group={draft.employeeId} class="sr-only" />{s.name}
						</label>
					{/each}
				</div>
			</div>
			<div class="min-w-0">
				<label class="field-label" for="day">日期</label>
				<input id="day" name="day" type="date" class="field" bind:value={draft.day} required />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label class="field-label" for="st">上班</label>
					<input id="st" name="startTime" type="time" class="field tabular" bind:value={draft.startTime} required />
				</div>
				<div class="min-w-0">
					<label class="field-label" for="et">下班</label>
					<input id="et" name="endTime" type="time" class="field tabular" bind:value={draft.endTime} required />
				</div>
			</div>
			<label class="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3.5 has-checked:border-[#e0a54a] has-checked:bg-[#fdf3e3]">
				<span>
					<span class="flex items-center gap-1.5 font-bold"><Plane class="size-4 text-[#a35a0c]" /> 這天請假</span>
					<span class="block text-xs text-muted">請假不用打卡、不算缺勤，也不計薪</span>
				</span>
				<input type="checkbox" name="leave" bind:checked={draft.leave} class="size-5 accent-[#c27a1a]" />
			</label>
			<div>
				<label class="field-label" for="note">備註（選填）</label>
				<input id="note" name="note" class="field" placeholder={draft.leave ? '例如：家裡有事' : '例如：負責備料'} bind:value={draft.note} maxlength="100" />
			</div>
			<button class="btn btn-primary w-full" disabled={busy}>儲存</button>
		</form>
		{#if draft.id}
			<form method="POST" action={act("remove")} class="mt-2" use:enhance={submit}>
				<input type="hidden" name="id" value={draft.id} />
				<button class="btn w-full text-chili-deep hover:bg-chili-soft" disabled={busy}><Trash2 class="size-4" /> 刪除這個班</button>
			</form>
		{/if}
	{/if}
</Sheet>

<!-- 補登 -->
<Sheet open={!!punchFix} title="補登打卡" onclose={() => (punchFix = null)}>
	{#if punchFix}
		<form method="POST" action={act("addPunch")} class="space-y-4" use:enhance={submit}>
			<input type="hidden" name="employeeId" value={punchFix.employeeId} />
			<input type="hidden" name="day" value={punchFix.day} />
			<p class="rounded-2xl bg-paper-2 px-4 py-3 text-sm text-ink-2">
				幫 <b>{person(punchFix.employeeId)?.name}</b> 補登 {fmtDay(punchFix.day)} 的打卡，會標示「補登」。
			</p>
			<div class="grid grid-cols-2 gap-2">
				<label class="cursor-pointer rounded-2xl border border-line p-3 text-center font-bold has-checked:border-chili has-checked:bg-chili-soft has-checked:text-chili-deep">
					<input type="radio" name="kind" value="in" class="sr-only" checked /> 上班
				</label>
				<label class="cursor-pointer rounded-2xl border border-line p-3 text-center font-bold has-checked:border-night has-checked:bg-night-soft has-checked:text-night">
					<input type="radio" name="kind" value="out" class="sr-only" /> 下班
				</label>
			</div>
			<div class="min-w-0">
				<label class="field-label" for="fix-time">時間</label>
				<input id="fix-time" name="time" type="time" class="field tabular" required />
			</div>
			<button class="btn btn-primary w-full" disabled={busy}>補登</button>
		</form>
	{/if}
</Sheet>
