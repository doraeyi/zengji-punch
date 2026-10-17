<script lang="ts">
	import { slide } from 'svelte/transition';
	import Bell from '@lucide/svelte/icons/bell';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Share from '@lucide/svelte/icons/share';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { disablePush, enablePush, pushState, testPush, type PushState } from '#lib/push-client.js';

	type Props = {
		role: 'owner' | 'staff';
		/** banner：首頁的提示條，只在還沒開啟時出現；card：完整設定卡 */
		variant?: 'banner' | 'card';
	};
	let { role, variant = 'card' }: Props = $props();

	let status = $state<PushState>('loading');
	let busy = $state(false);
	let message = $state('');
	let showSteps = $state(false);

	$effect(() => {
		pushState().then((s) => (status = s));
	});

	const what = $derived(role === 'owner' ? '員工打卡、請假、發薪都會即時通知你' : '打卡收據、班表異動、薪水發放都會通知你');

	async function run(fn: () => Promise<unknown>, ok?: string) {
		busy = true;
		message = '';
		try {
			const r = await fn();
			if (typeof r === 'string') status = r as PushState;
			if (ok) message = ok;
		} catch (err) {
			message = `沒有成功：${(err as Error).message}`;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet iosSteps()}
	<ol class="mt-2 space-y-1.5 text-sm text-ink-2" transition:slide>
		<li class="flex items-center gap-2"><span class="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">1</span>用 <b>Safari</b> 打開這個網站</li>
		<li class="flex items-center gap-2"><span class="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">2</span>點下方的分享 <Share class="size-4" /></li>
		<li class="flex items-center gap-2"><span class="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">3</span>選「加入主畫面」<SquarePlus class="size-4" /></li>
		<li class="flex items-center gap-2"><span class="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">4</span>從主畫面的「曾記打卡」打開，再按開啟通知</li>
	</ol>
{/snippet}

{#if variant === 'banner'}
	{#if status === 'off' || status === 'ios-needs-install'}
		<div class="card animate-rise px-4 py-3" transition:slide>
			<div class="flex items-center gap-3">
				<span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fdf0dc] text-[#b5650d]"><Bell class="size-5" /></span>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-bold">開啟手機通知</p>
					<p class="text-xs text-muted">{status === 'ios-needs-install' ? 'iPhone 要先「加入主畫面」才收得到' : what}</p>
				</div>
				{#if status === 'off'}
					<button class="btn btn-primary shrink-0 px-3.5 py-2 text-sm" disabled={busy} onclick={() => run(enablePush)}>
						{#if busy}<LoaderCircle class="size-4 animate-spin" />{/if}開啟
					</button>
				{:else}
					<button class="btn btn-ghost shrink-0 px-3 py-2 text-sm" onclick={() => (showSteps = !showSteps)}>怎麼做</button>
				{/if}
			</div>
			{#if showSteps}{@render iosSteps()}{/if}
			{#if message}<p class="mt-2 text-xs text-chili-deep">{message}</p>{/if}
		</div>
	{/if}
{:else}
	<section class="card p-5">
		<div class="flex items-start gap-3">
			<span class="grid size-11 shrink-0 place-items-center rounded-2xl {status === 'on' ? 'bg-jade text-white' : 'bg-paper-2 text-muted'}">
				{#if status === 'on'}<BellRing class="size-5" />{:else if status === 'denied'}<BellOff class="size-5" />{:else}<Bell class="size-5" />{/if}
			</span>
			<div class="min-w-0 flex-1">
				<p class="font-bold">這支手機的通知</p>
				<p class="text-sm {status === 'on' ? 'text-jade' : 'text-muted'}">
					{#if status === 'loading'}檢查中…
					{:else if status === 'on'}已開啟。{what}
					{:else if status === 'off'}還沒開啟。{what}
					{:else if status === 'denied'}通知被封鎖了。請到手機的「設定 → 通知」（或瀏覽器網站設定）允許「曾記打卡」後再回來。
					{:else if status === 'ios-needs-install'}iPhone 要先把網站「加入主畫面」，從主畫面打開才能收通知。
					{:else if status === 'not-configured'}伺服器還沒設定推播金鑰（見 README）。
					{:else}這個瀏覽器不支援通知，請改用 Chrome 或 Safari。{/if}
				</p>
			</div>
		</div>

		{#if status === 'ios-needs-install'}{@render iosSteps()}{/if}

		{#if status === 'off'}
			<button class="btn btn-primary mt-4 w-full" disabled={busy} onclick={() => run(enablePush)}>
				{#if busy}<LoaderCircle class="size-4 animate-spin" />{:else}<Bell class="size-4" />{/if}開啟通知
			</button>
		{:else if status === 'on'}
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button class="btn btn-ghost" disabled={busy} onclick={() => run(testPush, '已送出測試通知，幾秒內會跳出來')}>送測試通知</button>
				<button class="btn text-muted hover:bg-paper-2" disabled={busy} onclick={() => run(disablePush)}>關閉通知</button>
			</div>
		{/if}
		{#if message}<p class="mt-2 text-sm {message.startsWith('沒有') ? 'text-chili-deep' : 'text-jade'}">{message}</p>{/if}
	</section>
{/if}
