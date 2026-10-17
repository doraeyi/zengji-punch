import { redirect } from '@sveltejs/kit';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db, employees, notifications } from '#lib/server/db/index.js';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');

	// 老闆的未讀通知數（每次換頁都重新算，所以讀一下 pathname）
	let unread = 0;
	if (locals.user.role === 'owner' && url.pathname) {
		const [row] = await db
			.select({ count: sql<number>`count(*)` })
			.from(notifications)
			.innerJoin(employees, eq(employees.id, locals.user.id))
			.where(and(gt(notifications.id, employees.seenNotificationId)));
		unread = Number(row?.count ?? 0);
	}
	return { user: locals.user, unread };
};
