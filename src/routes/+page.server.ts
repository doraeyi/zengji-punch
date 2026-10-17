import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import { dayPunches, firstLast, punch, shiftOn } from '#lib/server/punch.js';
import { fenceApplies, getGeofence } from '#lib/server/geofence.js';
import { localDay, shiftWindow } from '#lib/time.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(employees);
		if (Number(count) === 0) redirect(303, '/register');
		return { user: null, status: null };
	}

	const day = localDay();
	const [list, todayShift, fence] = await Promise.all([dayPunches(user.id, day), shiftOn(user.id, day), getGeofence()]);
	const { first, last } = firstLast(list);
	// 今天還沒打過 → 上班卡；打過之後每按一次都是（更新）下班卡
	const next: 'in' | 'out' = list.length ? 'out' : 'in';

	// 員工上班中、班表還沒到下班時間 → 告訴他幾點後才能打下班卡
	let outAfter: Date | null = null;
	if (next === 'out' && user.role === 'staff' && todayShift && !todayShift.leave) {
		const { end } = shiftWindow(day, todayShift.startTime, todayShift.endTime);
		if (end > new Date()) outAfter = end;
	}

	return {
		user,
		status: { next, first, last, todayShift, outAfter },
		// 只把需要的座標給這位員工的手機，用來在畫面上算距離、鎖按鈕
		fence: fenceApplies(fence, user.role) ? { lat: fence.lat, lng: fence.lng, radius: fence.radius } : null
	};
};

export const actions: Actions = {
	punch: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { needLogin: true, message: '這支手機還沒綁定，請先登入' });
		const form = await request.formData();
		const num = (k: string) => (form.get(k) === null || form.get(k) === '' ? undefined : Number(form.get(k)));
		const result = await punch(locals.user, locals.deviceId, { lat: num('lat'), lng: num('lng'), accuracy: num('accuracy') });
		if (!result.ok) return fail(409, { message: result.message });
		return { punched: { kind: result.kind, at: result.at, notified: result.notified, updated: result.updated } };
	}
};
