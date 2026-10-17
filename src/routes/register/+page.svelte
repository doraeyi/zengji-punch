<script lang="ts">
	import { enhance } from '$app/forms';
	import Crown from '@lucide/svelte/icons/crown';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import IosInstallTip from '#lib/components/IosInstallTip.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	// 表單欄位用自己的狀態，切換「我是老闆」時才不會把已經打的字洗掉；
	// 送出失敗時，伺服器回傳的值會帶回來
	let isOwner = $state(false);
	let name = $state('');
	let username = $state('');
	$effect(() => {
		if (!form) return;
		name = form.name ?? name;
		username = form.username ?? username;
		isOwner = form.wantsOwner ?? isOwner;
	});
</script>

<svelte:head><title>註冊｜曾記麻辣燙</title></svelte:head>

<AuthShell
	title={data.firstUser ? '歡迎使用' : '註冊帳號'}
	subtitle={data.ownerExists ? '建立你的員工帳號，這支手機之後就能直接打卡' : '先建立帳號；老闆請勾選下面的「我是老闆」'}
	back={data.firstUser ? undefined : '/'}
>
	<IosInstallTip action="註冊" />

	<form
		method="POST"
		class="card animate-rise space-y-4 p-5"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<div>
			<label class="field-label" for="name">你的名字</label>
			<input id="name" name="name" class="field" placeholder="例如：周冠穎" bind:value={name} required />
		</div>
		<div>
			<label class="field-label" for="username">登入帳號</label>
			<input
				id="username"
				name="username"
				class="field"
				autocapitalize="none"
				autocomplete="username"
				placeholder="英文或數字，例如 guanying"
				bind:value={username}
				required
			/>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="field-label" for="password">密碼</label>
				<input id="password" name="password" type="password" class="field" autocomplete="new-password" minlength="6" placeholder="至少 6 字" required />
			</div>
			<div>
				<label class="field-label" for="confirm">再輸入一次</label>
				<input id="confirm" name="confirm" type="password" class="field" autocomplete="new-password" required />
			</div>
		</div>

		{#if !data.ownerExists}
			<label
				class="flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3.5 transition {isOwner
					? 'border-chili bg-chili-soft/60'
					: 'border-line bg-paper/60'}"
			>
				<span class="grid size-10 shrink-0 place-items-center rounded-xl {isOwner ? 'bg-chili text-white' : 'bg-paper-2 text-muted'}">
					<Crown class="size-5" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block font-bold">我是老闆</span>
					<span class="block text-xs text-muted">可以排班、發薪水、管理員工。店裡只要第一位老闆勾這個。</span>
				</span>
				<input type="checkbox" name="owner" bind:checked={isOwner} class="size-5 shrink-0 accent-[#b8321f]" />
			</label>
		{/if}

		{#if form?.message}
			<p class="rounded-2xl bg-chili-soft px-4 py-3 text-sm font-medium text-chili-deep">{form.message}</p>
		{/if}

		<button class="btn btn-primary w-full py-4 text-lg" disabled={busy}>
			{#if busy}<LoaderCircle class="size-5 animate-spin" />{/if}
			{isOwner && !data.ownerExists ? '建立老闆帳號' : '註冊並綁定這支手機'}
		</button>
	</form>

	{#if !data.firstUser}
		<p class="mt-4 text-center text-sm text-muted">
			已經有帳號了？<a href="/login" class="font-bold text-chili underline underline-offset-4">登入</a>
		</p>
	{/if}

	<div class="mt-5 flex gap-3 rounded-3xl bg-paper-2 p-4 text-sm leading-relaxed text-ink-2">
		<ShieldCheck class="mt-0.5 size-5 shrink-0 text-jade" />
		<p>
			註冊後這支手機會直接綁定你的帳號。
			{#if data.ownerExists}
				<span class="text-muted">老闆娘或其他管理者：先註冊成員工，再請老闆在「管理」幫你開老闆權限。</span>
			{:else}
				<span class="text-muted">老闆建好帳號後，其他人註冊就只會是員工；老闆娘可以之後由老闆在後台給權限。</span>
			{/if}
		</p>
	</div>
</AuthShell>
