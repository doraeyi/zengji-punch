<script lang="ts">
	import { enhance } from '$app/forms';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import { isIOS, isStandalone } from '#lib/push-client.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const punchAfter = $derived(data.then === 'punch');

	// iPhone：主畫面 App 和 Safari 分頁的登入狀態不一定共用，先加入主畫面再登入最穩
	let iosTip = $state(false);
	$effect(() => {
		iosTip = isIOS() && !isStandalone();
	});
</script>

<svelte:head><title>登入｜曾記麻辣燙</title></svelte:head>

<AuthShell title="員工登入" subtitle="登入一次，這支手機就會記住你" back="/">
	{#if iosTip}
		<div class="mb-4 flex gap-3 rounded-3xl border border-[#f0d3a4] bg-[#fdf3e3] p-4 text-sm leading-relaxed text-[#7a4a0c]">
			<SquarePlus class="mt-0.5 size-5 shrink-0" />
			<p>
				<b>iPhone 請先加入主畫面再登入：</b>點 Safari 下方的分享 →「加入主畫面」，再從主畫面的「曾記打卡」打開登入。這樣才收得到打卡通知，也不會被當成兩支手機。
			</p>
		</div>
	{/if}
	<form
		method="POST"
		class="card animate-rise space-y-4 p-5"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="then" value={data.then ?? ''} />
		<div>
			<label class="field-label" for="username">帳號</label>
			<input
				id="username"
				name="username"
				class="field"
				autocomplete="username"
				autocapitalize="none"
				value={form?.username ?? ''}
				required
			/>
		</div>
		<div>
			<label class="field-label" for="password">密碼</label>
			<input id="password" name="password" type="password" class="field" autocomplete="current-password" required />
		</div>

		{#if data.changed && !form}
			<p class="rounded-2xl bg-jade-soft px-4 py-3 text-sm font-medium text-jade">密碼已更新，請用新密碼重新登入</p>
		{/if}
		{#if form?.message}
			<p class="rounded-2xl bg-chili-soft px-4 py-3 text-sm font-medium text-chili-deep">{form.message}</p>
		{/if}

		<button class="btn btn-primary w-full py-4 text-lg" disabled={busy}>
			{#if busy}
				<LoaderCircle class="size-5 animate-spin" />
			{:else if punchAfter}
				<Fingerprint class="size-5" />
			{/if}
			{punchAfter ? '登入並打卡' : '登入'}
		</button>
	</form>

	<div class="mt-5 flex gap-3 rounded-3xl bg-paper-2 p-4 text-sm leading-relaxed text-ink-2">
		<ShieldCheck class="mt-0.5 size-5 shrink-0 text-jade" />
		<p>
			登入後這支手機會綁定你的帳號，之後在首頁按「打卡」就好，不用再登入。
			<span class="text-muted">一個帳號只能綁一支手機；換手機請找老闆解除綁定。</span>
		</p>
	</div>
</AuthShell>
