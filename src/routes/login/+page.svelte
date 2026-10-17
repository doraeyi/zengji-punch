<script lang="ts">
	import { enhance } from '$app/forms';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import DeviceModelField from '#lib/components/DeviceModelField.svelte';
	import IosInstallTip from '#lib/components/IosInstallTip.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const punchAfter = $derived(data.then === 'punch');

</script>

<svelte:head><title>登入｜曾記麻辣燙</title></svelte:head>

<AuthShell title="員工登入" subtitle="登入一次，這支手機就會記住你" back="/">
	<IosInstallTip />
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
		<DeviceModelField />
		<input type="hidden" name="then" value={data.then ?? ''} />
		<div>
			<label class="field-label" for="username">帳號</label>
			<input
				id="username"
				name="username"
				class="field"
				autocomplete="username"
				autocapitalize="none"
				defaultValue={form?.username ?? ''}
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

	<p class="mt-4 text-center text-sm text-muted">
		還沒有帳號？<a href="/register" class="font-bold text-chili underline underline-offset-4">註冊</a>
	</p>

	<div class="mt-5 flex gap-3 rounded-3xl bg-paper-2 p-4 text-sm leading-relaxed text-ink-2">
		<ShieldCheck class="mt-0.5 size-5 shrink-0 text-jade" />
		<p>
			登入後這支手機會綁定你的帳號，之後在首頁按「打卡」就好，不用再登入。
			<span class="text-muted">一個帳號只能綁一支手機；換手機請找老闆解除綁定。</span>
		</p>
	</div>
</AuthShell>
