<script lang="ts">
	import { fmtClock, localDay } from '#lib/time.js';

	let now = $state(new Date());

	$effect(() => {
		const timer = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(timer);
	});

	const clock = $derived(fmtClock(now));
	const today = $derived(localDay(now));
	const [y, m, d] = $derived(today.split('-').map(Number));
	const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
	const weekday = $derived(WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]);
</script>

<div class="text-center">
	<p class="text-sm font-medium tracking-[0.2em] text-muted">{m} 月 {d} 日 · {weekday}</p>
	<p class="tabular mt-1 font-serif text-[64px] leading-none font-black tracking-tight text-ink">
		{clock.slice(0, 5)}<span class="ml-1 align-top text-2xl text-muted/70">{clock.slice(6)}</span>
	</p>
</div>
