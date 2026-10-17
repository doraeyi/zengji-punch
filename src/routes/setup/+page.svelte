<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>開始使用｜曾記麻辣燙</title></svelte:head>

<AuthShell title="歡迎使用" subtitle="先建立老闆（管理者）帳號，之後就能新增員工">
	<form method="POST" class="card animate-rise space-y-4 p-5" use:enhance>
		<div>
			<label class="field-label" for="name">你的名字</label>
			<input id="name" name="name" class="field" placeholder="例如：曾老闆" value={form?.name ?? ''} required />
		</div>
		<div>
			<label class="field-label" for="username">登入帳號</label>
			<input
				id="username"
				name="username"
				class="field"
				autocapitalize="none"
				autocomplete="username"
				placeholder="英文或數字，例如 boss"
				value={form?.username ?? ''}
				required
			/>
		</div>
		<div>
			<label class="field-label" for="password">密碼</label>
			<input id="password" name="password" type="password" class="field" autocomplete="new-password" minlength="6" required />
		</div>
		{#if form?.message}
			<p class="rounded-2xl bg-chili-soft px-4 py-3 text-sm font-medium text-chili-deep">{form.message}</p>
		{/if}
		<button class="btn btn-primary w-full py-4 text-lg">建立並登入</button>
	</form>
</AuthShell>
