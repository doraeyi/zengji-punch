<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { registerServiceWorker } from '#lib/push-client.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 推播需要 Service Worker；早點註冊，之後開啟通知比較快
	$effect(() => {
		registerServiceWorker();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
