<script lang="ts">
	import { enhance } from '$app/forms';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Info from '@lucide/svelte/icons/info';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PushToggle from '#lib/components/PushToggle.svelte';
	import { fmtDay, localDay } from '#lib/time.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const isOwner = $derived(data.user.role === 'owner');
</script>

<svelte:head><title>我的帳號｜曾記麻辣燙</title></svelte:head>

<PageHeader kicker="ACCOUNT" title="我的帳號" />

<section class="card flex items-center gap-4 p-5">
	<div class="grid size-16 shrink-0 place-items-center rounded-full font-serif text-2xl font-black text-white" style:background={data.user.color}>
		{data.user.name.slice(0, 1)}
	</div>
	<div class="min-w-0">
		<p class="text-xl font-bold">{data.user.name}</p>
		<p class="text-sm text-muted">帳號 {data.username} · {isOwner ? '老闆' : '員工'}</p>
	</div>
</section>

<section class="card mt-3 flex items-start gap-3 p-5">
	<span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-jade-soft text-jade"><Smartphone class="size-5" /></span>
	<div class="min-w-0 flex-1">
		<p class="font-bold">已綁定這支手機</p>
		{#if data.device}
			<p class="text-sm text-muted">{data.device.label} · {fmtDay(localDay(data.device.createdAt))} 綁定</p>
		{/if}
		<p class="mt-2 text-sm text-ink-2">
			{isOwner ? '老闆帳號可以同時在多支裝置登入。' : '要換手機時，請找老闆在後台按「解除綁定」，再用新手機登入即可。'}
		</p>
	</div>
</section>

<div class="mt-3"><PushToggle role={data.user.role} /></div>

<section class="card mt-3 p-5">
	<h2 class="mb-4 flex items-center gap-2 font-bold"><KeyRound class="size-5 text-chili" /> 修改密碼</h2>
	<form method="POST" action="?/password" class="space-y-3" use:enhance>
		<input name="current" type="password" class="field" placeholder="目前的密碼" autocomplete="current-password" required />
		<input name="next" type="password" class="field" placeholder="新密碼（至少 6 個字）" autocomplete="new-password" minlength="6" required />
		<input name="confirm" type="password" class="field" placeholder="再輸入一次新密碼" autocomplete="new-password" required />
		{#if form?.message}
			<p class="rounded-2xl bg-chili-soft px-4 py-3 text-sm text-chili-deep">{form.message}</p>
		{/if}
		<p class="flex gap-2 text-xs leading-relaxed text-muted">
			<Info class="mt-0.5 size-3.5 shrink-0" /> 改密碼後，這支手機需要用新密碼重新登入綁定一次。
		</p>
		<button class="btn btn-primary w-full">更新密碼</button>
	</form>
</section>

{#if isOwner}
	<form method="POST" action="?/logout" class="mt-3" use:enhance>
		<button class="btn btn-ghost w-full"><LogOut class="size-4" /> 登出這支裝置</button>
	</form>
{/if}
