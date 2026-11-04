<script lang="ts">
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import { fmtDay, fmtTime } from '#lib/time.js';

	type Props = { url: string; next: { day: string; start: Date } | null };
	let { url, next }: Props = $props();

	const OFFSETS = [5, 10, 15, 30, 45, 60, 90, 120];
	const KEY = 'zj-alarm-before';
	const LABEL = '曾記上班';

	let before = $state(30);
	try {
		const saved = Number(localStorage.getItem(KEY));
		if (OFFSETS.includes(saved)) before = saved;
	} catch {}
	$effect(() => {
		try {
			localStorage.setItem(KEY, String(before));
		} catch {}
	});

	const fullUrl = $derived(`${url}&before=${before}`);
	const ring = $derived(next ? new Date(next.start.getTime() - before * 60000) : null);
	const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
	// Android：用系統的「設定鬧鐘」直接打開時鐘 App 並填好時間
	const androidIntent = $derived(
		ring
			? `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${Number(fmtTime(ring).slice(0, 2))};i.android.intent.extra.alarm.MINUTES=${Number(fmtTime(ring).slice(3))};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(LABEL)};end`
			: null
	);

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(fullUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			prompt('複製這個網址', fullUrl);
		}
	}
</script>

<section class="card p-5">
	<h2 class="flex items-center gap-2 font-bold"><AlarmClock class="size-5 text-chili" /> 上班鬧鐘</h2>
	<p class="mt-1 text-sm text-ink-2">讓手機每天自動把同一個鬧鐘，改成下一班上班前的時間；沒班的日子會自動關掉。</p>

	<label class="field-label mt-4 block" for="alarm-before">提前多久響</label>
	<select id="alarm-before" class="field" bind:value={before}>
		{#each OFFSETS as m (m)}
			<option value={m}>{m >= 60 ? `${m / 60} 小時` : `${m} 分鐘`}前</option>
		{/each}
	</select>

	<p class="mt-3 rounded-2xl bg-paper-2 px-4 py-3 text-sm">
		{#if next && ring}
			下一班 <b>{fmtDay(next.day)} {fmtTime(next.start)}</b> → 鬧鐘 <b class="tabular text-chili-deep">{fmtTime(ring)}</b> 響
		{:else}
			接下來一天半內沒有班，鬧鐘會關掉
		{/if}
	</p>

	<div class="mt-3 flex gap-2">
		<input class="field tabular min-w-0 flex-1 text-xs" readonly value={fullUrl} aria-label="我的鬧鐘網址" />
		<button class="btn btn-ghost shrink-0" onclick={copy}>
			{#if copied}<Check class="size-4" /> 已複製{:else}<Copy class="size-4" /> 複製{/if}
		</button>
	</div>
	<p class="mt-1.5 text-xs text-muted">這是你專屬的網址，不要傳給別人。改了「提前多久」要重新複製一次。</p>

	{#if isAndroid && androidIntent}
		<a class="btn btn-primary mt-3 w-full" href={androidIntent}><AlarmClock class="size-4" /> 把 {fmtTime(ring!)} 加進鬧鐘</a>
	{/if}

	<details class="mt-4 rounded-2xl border border-line px-4 py-3 text-sm" open={!isAndroid}>
		<summary class="cursor-pointer font-bold">iPhone 設定方式（只要設一次）</summary>
		<ol class="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed text-ink-2">
			<li>打開「捷徑」App → 下方「自動化」→ 右上角「＋」→「特定時間」。</li>
			<li>時間選晚上（例如 <b>21:00</b>），重複選「每天」，再選「立即執行」。</li>
			<li>
				加入動作「<b>取得 URL 的內容</b>」，網址貼上面複製的網址。
			</li>
			<li>加入「<b>尋找鬧鐘</b>」，條件設「標籤」是「<b>{LABEL}</b>」，再加「<b>刪除鬧鐘</b>」（把舊的刪掉）。</li>
			<li>加入「<b>如果</b>」：「URL 的內容」<b>不是</b>「off」時 →「<b>製作鬧鐘</b>」，時間選「URL 的內容」，標籤填「{LABEL}」。</li>
			<li>
				iOS 18 以上：到「設定 → App → 捷徑 → 進階」打開「<b>允許刪除而不詢問</b>」，自動刪除舊鬧鐘時才不會跳出確認。
			</li>
		</ol>
		<p class="mt-2 text-xs text-muted">每台 iPhone 的按鈕名稱可能略有不同；設好後可以在捷徑裡按一次「執行」試試看，時鐘 App 會出現「{LABEL}」鬧鐘。</p>
	</details>

	<details class="mt-2 rounded-2xl border border-line px-4 py-3 text-sm" open={isAndroid}>
		<summary class="cursor-pointer font-bold">Android 設定方式</summary>
		<p class="mt-2 leading-relaxed text-ink-2">
			最簡單：每天下班後打開這頁，按上面的「加進鬧鐘」，時鐘 App 會帶好時間，按儲存就好。
		</p>
		<p class="mt-2 leading-relaxed text-ink-2">
			想全自動：安裝 <b>MacroDroid</b>，觸發條件選「每天 21:00」，動作用「HTTP 請求」讀上面的網址，拿到的時間不是 off 就「設定鬧鐘」。
		</p>
	</details>
</section>
