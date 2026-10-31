<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { invalidateAll } from '$app/navigation';
	import { registerServiceWorker } from '#lib/push-client.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 推播需要 Service Worker；早點註冊，之後開啟通知比較快
	$effect(() => {
		registerServiceWorker();
	});

	// 資料自動更新：別人打卡、改班表時不用手動重新整理。
	// 回到 App、收到推播時馬上更新；開著的時候每 15 秒更新一次。
	$effect(() => {
		let last = Date.now();
		const refresh = () => {
			if (document.visibilityState !== 'visible' || Date.now() - last < 3000) return;
			last = Date.now();
			invalidateAll();
		};
		const timer = setInterval(refresh, 15_000);
		const onMessage = (e: MessageEvent) => e.data?.type === 'refresh' && refresh();
		document.addEventListener('visibilitychange', refresh);
		navigator.serviceWorker?.addEventListener('message', onMessage);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
			navigator.serviceWorker?.removeEventListener('message', onMessage);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
