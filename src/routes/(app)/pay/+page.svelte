<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import HandCoins from '@lucide/svelte/icons/hand-coins';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Plane from '@lucide/svelte/icons/plane';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { addDays, addMonths, fmtDay, fmtDuration, fmtMoney, fmtTime, localDay, monthDays, weekStart } from '#lib/time.js';
	import { hours } from '#lib/display.js';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** 送出表單時保留目前的篩選（月份、員工、區間） */
	const act = (name: string) => `${page.url.search ? `${page.url.search}&` : '?'}/${name}`;

	const isOwner = $derived(data.user.role === 'owner');
	const METHOD = { monthly: '月結', weekly: '週結', other: '其他' } as const;

	// 快速區間
	const ranges = $derived.by(() => {
		const t = data.today;
		const wk = weekStart(t);
		const mo = t.slice(0, 7);
		const lastMo = addMonths(mo, -1);
		return [
			{ label: '今天', from: t, to: t },
			{ label: '本週', from: wk, to: addDays(wk, 6) },
			{ label: '上週', from: addDays(wk, -7), to: addDays(wk, -1) },
			{ label: '本月', from: `${mo}-01`, to: monthDays(mo).at(-1)! },
			{ label: '上月', from: `${lastMo}-01`, to: monthDays(lastMo).at(-1)! }
		];
	});
	const href = (from: string, to: string, who = data.person?.id) => `?from=${from}&to=${to}${isOwner && who ? `&who=${who}` : ''}`;
	const sameRange = (r: { from: string; to: string }) => r.from === data.from && r.to === data.to;

	let open = $state(false);
	let busy = $state(false);
	let draft = $state({ method: 'weekly' as keyof typeof METHOD, periodStart: '', periodEnd: '', amount: '' });

	function openPayout() {
		const u = data.unpaid;
		const span = u ? (Date.parse(u.to) - Date.parse(u.from)) / 86400000 : 0;
		draft = {
			method: span > 10 ? 'monthly' : 'weekly',
			periodStart: u?.from ?? data.from,
			periodEnd: u?.to ?? data.to,
			amount: u ? String(u.amount) : ''
		};
		open = true;
	}

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') open = false;
			await update();
		};
	};
</script>

<svelte:head><title>薪資｜曾記麻辣燙</title></svelte:head>

<PageHeader kicker="PAYROLL" title={isOwner ? '薪資' : '我的薪水'} />

{#if isOwner}
	<div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
		{#each data.staff as s (s.id)}
			{@const on = data.person?.id === s.id}
			<a
				href={href(data.from, data.to, s.id)}
				class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium {on ? 'border-transparent text-white' : 'border-line bg-card text-ink-2'}"
				style:background={on ? s.color : undefined}
			>
				{#if !on}<span class="size-2 rounded-full" style:background={s.color}></span>{/if}{s.name}
			</a>
		{/each}
	</div>
{/if}

<!-- 區間 -->
<section class="card p-3">
	<div class="grid grid-cols-5 gap-1 rounded-2xl bg-paper-2 p-1">
		{#each ranges as r (r.label)}
			<a href={href(r.from, r.to)} class="rounded-xl py-2 text-center text-sm font-bold {sameRange(r) ? 'bg-card text-ink shadow-sm' : 'text-muted'}">{r.label}</a>
		{/each}
	</div>
	<form method="GET" class="mt-2.5 flex items-center gap-2" data-sveltekit-keepfocus>
		{#if isOwner && data.person}<input type="hidden" name="who" value={data.person.id} />{/if}
		<input name="from" type="date" class="field min-w-0 flex-1 px-3 py-2.5 text-sm" value={data.from} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
		<ArrowRight class="size-4 shrink-0 text-muted" />
		<input name="to" type="date" class="field min-w-0 flex-1 px-3 py-2.5 text-sm" value={data.to} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
	</form>
</section>

<!-- 這段期間 -->
<section class="relative mt-3 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#2e3a46,#1c242c)] p-5 text-white shadow-[0_18px_40px_-18px_rgba(28,36,44,0.9)]">
	<div class="pointer-events-none absolute -right-4 -bottom-12 font-serif text-[150px] leading-none font-black opacity-[0.07] select-none">薪</div>
	<p class="text-xs tracking-[0.2em] text-white/60">
		{data.person?.name} · {fmtDay(data.from, false)}{data.from !== data.to ? ` – ${fmtDay(data.to, false)}` : ''}
	</p>
	<p class="tabular mt-2 font-serif text-4xl font-black">{fmtMoney(data.summary.amount)}</p>
	<p class="mt-1 text-sm text-white/60">
		計薪 {hours(data.summary.paidMinutes)} 小時 × 時薪 {data.person?.hourlyWage ? fmtMoney(data.person.hourlyWage) : '未設定'}
	</p>
	<div class="mt-4 grid grid-cols-2 gap-2">
		<div class="rounded-2xl bg-white/10 px-3.5 py-2.5">
			<p class="text-[11px] text-white/60">已領</p>
			<p class="tabular text-lg font-bold text-[#8fe0b8]">{fmtMoney(data.summary.paidAmount)}</p>
		</div>
		<div class="rounded-2xl bg-white/10 px-3.5 py-2.5">
			<p class="text-[11px] text-white/60">未領</p>
			<p class="tabular text-lg font-bold text-[#ffb59f]">{fmtMoney(data.summary.unpaidAmount)}</p>
		</div>
	</div>
	{#if isOwner && data.unpaid}
		<button class="btn mt-3 w-full bg-white text-ink hover:bg-paper" onclick={openPayout}>
			<HandCoins class="size-5 text-chili" /> 發放未領的 {fmtMoney(data.unpaid.amount)}
		</button>
	{/if}
</section>

{#if form?.message}
	<p class="mt-3 rounded-2xl bg-chili-soft px-4 py-3 text-sm text-chili-deep">{form.message}</p>
{/if}

<!-- 每天 -->
<h2 class="mt-6 mb-2.5 px-1 text-sm font-bold tracking-widest text-muted">每日明細</h2>
<ul class="card divide-y divide-line/70">
	{#each data.days as d (d.day)}
		{@const first = d.sessions.find((s) => s.in)?.in}
		{@const last = d.sessions.findLast((s) => s.out)?.out}
		<li class="flex items-center gap-3 px-4 py-3">
			<div class="w-14 shrink-0">
				<p class="tabular font-bold">{fmtDay(d.day, false)}</p>
				<p class="text-xs {d.holiday ? 'font-bold text-chili' : 'text-muted'}">{d.holiday ? d.holiday.name : `週${'日一二三四五六'[new Date(d.day).getUTCDay()]}`}</p>
			</div>
			<div class="min-w-0 flex-1 text-sm">
				{#if d.status === 'leave'}
					<span class="chip bg-[#f6dfb8] text-[#8a4b08]"><Plane class="size-3" /> 請假</span>
				{:else if d.status === 'absent'}
					<span class="text-chili">有排班但未打卡</span>
				{:else}
					<p class="tabular text-ink-2">
						{first ? fmtTime(first.at) : '—'} → {last ? fmtTime(last.at) : d.status === 'working' ? '上班中' : '缺卡'}
					</p>
					{#if d.paidMinutes}
						<p class="text-xs text-muted">
							{fmtDuration(d.paidMinutes)}{#if d.multiplier === 2}<span class="ml-1 rounded bg-chili-soft px-1 font-bold text-chili-deep">國定假日 ×2</span>{/if}
						</p>
					{/if}
				{/if}
			</div>
			<div class="text-right">
				<p class="tabular font-serif text-lg font-black {d.payoutId ? 'text-jade' : ''}">{d.amount ? fmtMoney(d.amount) : ''}</p>
				{#if d.amount}
					{#if d.payoutId}<span class="text-[11px] font-medium text-jade">✓ 已領</span>{:else}<span class="text-[11px] text-muted">未領</span>{/if}
				{/if}
			</div>
		</li>
	{:else}
		<li class="px-4 py-10 text-center text-sm text-muted">這段期間沒有打卡紀錄</li>
	{/each}
</ul>

<!-- 發放紀錄 -->
<h2 class="mt-6 mb-2.5 px-1 text-sm font-bold tracking-widest text-muted">領薪紀錄</h2>
<ol class="space-y-2.5">
	{#each data.history as r (r.id)}
		<li class="card overflow-hidden">
			<a href={href(r.periodStart, r.periodEnd)} class="flex items-center gap-3 p-4">
				<span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-jade-soft text-jade"><Banknote class="size-5" /></span>
				<div class="min-w-0 flex-1">
					<p class="tabular font-bold">{fmtDay(r.periodStart, false)} – {fmtDay(r.periodEnd, false)}</p>
					<p class="text-xs text-muted">{METHOD[r.method]} · {fmtDay(localDay(r.paidAt), false)} 發放</p>
				</div>
				<p class="tabular font-serif text-2xl font-black">{fmtMoney(r.amount)}</p>
			</a>
			{#if r.note || isOwner}
				<div class="flex items-center gap-2 border-t border-dashed border-line bg-paper/50 px-4 py-2 text-sm">
					<p class="min-w-0 flex-1 text-ink-2">{r.note ?? ''}</p>
					{#if isOwner}
						<form method="POST" action={act("remove")} use:enhance onsubmit={(e) => { if (!confirm('刪除這筆薪資紀錄？')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={r.id} />
							<button class="grid size-8 place-items-center rounded-full text-muted hover:bg-chili-soft hover:text-chili" aria-label="刪除"><Trash2 class="size-4" /></button>
						</form>
					{/if}
				</div>
			{/if}
		</li>
	{:else}
		<li class="card flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
			<ReceiptText class="size-10 text-line" />
			<p>還沒有領薪紀錄</p>
		</li>
	{/each}
</ol>

<Sheet {open} title="發放薪資" onclose={() => (open = false)}>
	<form method="POST" action={act("add")} class="space-y-4" use:enhance={submit}>
		<input type="hidden" name="employeeId" value={data.person?.id} />
		<p class="rounded-2xl bg-paper-2 px-4 py-3 text-sm text-ink-2">
			發給 <b>{data.person?.name}</b>。金額已依打卡自動算好，可以手動調整（例如加獎金）。發放後月曆會標示「已領」，並推播通知他。
		</p>
		<div>
			<span class="field-label">結算方式</span>
			<div class="grid grid-cols-3 gap-1 rounded-2xl bg-paper-2 p-1">
				{#each Object.entries(METHOD) as [value, label] (value)}
					<label class="cursor-pointer rounded-xl py-2.5 text-center text-sm font-bold text-muted has-checked:bg-card has-checked:text-ink has-checked:shadow-sm">
						<input type="radio" name="method" {value} bind:group={draft.method} class="sr-only" />{label}
					</label>
				{/each}
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="field-label" for="ps">期間開始</label>
				<input id="ps" name="periodStart" type="date" class="field" bind:value={draft.periodStart} required />
			</div>
			<div>
				<label class="field-label" for="pe">期間結束</label>
				<input id="pe" name="periodEnd" type="date" class="field" bind:value={draft.periodEnd} required />
			</div>
		</div>
		<div>
			<label class="field-label" for="amount">金額（新台幣）</label>
			<div class="relative">
				<span class="absolute top-1/2 left-4 -translate-y-1/2 font-serif text-xl font-black text-muted">$</span>
				<input id="amount" name="amount" inputmode="numeric" class="field tabular pl-9 font-serif text-2xl font-black" bind:value={draft.amount} required />
			</div>
		</div>
		<div>
			<label class="field-label" for="note">備註（選填）</label>
			<input id="note" name="note" class="field" placeholder="例如：含全勤獎金 1,000" maxlength="500" />
		</div>
		<button class="btn btn-primary w-full py-4" disabled={busy}>確認已發放</button>
	</form>
</Sheet>
