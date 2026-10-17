<script lang="ts">
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import { isIOS, isStandalone } from '#lib/push-client.js';

	let { action = '登入' }: { action?: string } = $props();

	// iPhone：主畫面 App 和 Safari 分頁的登入狀態不一定共用，先加入主畫面再綁定最穩
	let show = $state(false);
	$effect(() => {
		show = isIOS() && !isStandalone();
	});
</script>

{#if show}
	<div class="mb-4 flex gap-3 rounded-3xl border border-[#f0d3a4] bg-[#fdf3e3] p-4 text-sm leading-relaxed text-[#7a4a0c]">
		<SquarePlus class="mt-0.5 size-5 shrink-0" />
		<p>
			<b>iPhone 請先加入主畫面再{action}：</b>點 Safari 下方的分享 →「加入主畫面」，再從主畫面的「曾記打卡」打開。這樣才收得到打卡通知，也不會被當成兩支手機。
		</p>
	</div>
{/if}
