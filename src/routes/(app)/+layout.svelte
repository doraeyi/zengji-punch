<script lang="ts">
	import { page } from '$app/state';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Settings from '@lucide/svelte/icons/settings';
	import UserRound from '@lucide/svelte/icons/user-round';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const tabs = $derived([
		{ href: '/', label: '打卡', icon: Fingerprint },
		{ href: '/schedule', label: '月曆', icon: CalendarDays },
		{ href: '/pay', label: '薪資', icon: Wallet },
		data.user.role === 'owner'
			? { href: '/admin', label: '管理', icon: Settings }
			: { href: '/account', label: '我的', icon: UserRound }
	]);

	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="mx-auto min-h-dvh max-w-md px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-32">
	{@render children()}
</div>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
	aria-label="主選單"
>
	<ul class="mx-auto grid max-w-md grid-cols-4">
		{#each tabs as tab (tab.href)}
			{@const on = active(tab.href)}
			<li>
				<a
					href={tab.href}
					class="flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium transition {on
						? 'text-chili'
						: 'text-muted hover:text-ink-2'}"
					aria-current={on ? 'page' : undefined}
				>
					<span class="relative grid h-8 w-12 place-items-center rounded-full transition {on ? 'bg-chili-soft' : ''}">
						<tab.icon class="size-5" strokeWidth={on ? 2.4 : 2} />
						{#if tab.href === '/admin' && data.unread && !on}
							<span class="tabular absolute -top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-chili px-1 text-[10px] font-bold text-white ring-2 ring-card">
								{data.unread > 99 ? '99+' : data.unread}
							</span>
						{/if}
					</span>
					{tab.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
