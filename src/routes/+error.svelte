<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status}｜曾記麻辣燙</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
	<p class="font-serif text-[120px] leading-none font-black text-chili/15">{page.status}</p>
	<h1 class="-mt-6 font-serif text-2xl font-black">
		{page.status === 404 ? '找不到這個頁面' : page.status === 403 ? '沒有權限' : '出了點問題'}
	</h1>
	<p class="mt-2 text-muted">{page.error?.message}</p>
	<a href="/" class="btn btn-primary mt-8 px-8">回首頁</a>
</main>
