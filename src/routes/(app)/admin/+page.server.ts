import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees, notifications } from '#lib/server/db/index.js';
import { requireOwner } from '#lib/server/guard.js';
import { notify } from '#lib/server/notify.js';
import { pushConfigured } from '#lib/server/push.js';
import { getGeofence, saveGeofence } from '#lib/server/geofence.js';
import { holidayDoublePay, setHolidayDoublePay } from '#lib/server/holidays.js';
import { isValidPoint } from '#lib/geo.js';
import { str } from '#lib/server/validate.js';

// 管理分頁（老闆）：通知中心、匯出 Excel、打卡範圍、國定假日雙倍薪、推播

export const load: PageServerLoad = async ({ locals, parent }) => {
	const me = requireOwner(locals);
	// 先讓 layout 算完未讀數，再把通知標成已讀
	await parent();

	const [feed, [self], fence, doublePay] = await Promise.all([
		db
			.select({
				id: notifications.id,
				kind: notifications.kind,
				text: notifications.text,
				createdAt: notifications.createdAt,
				color: employees.color
			})
			.from(notifications)
			.leftJoin(employees, eq(notifications.employeeId, employees.id))
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(30),
		db.select({ seen: employees.seenNotificationId }).from(employees).where(eq(employees.id, me.id)),
		getGeofence(),
		holidayDoublePay()
	]);

	const seen = self?.seen ?? 0;
	const newest = Math.max(0, ...feed.map((f) => f.id));
	if (newest > seen) {
		await db.update(employees).set({ seenNotificationId: newest }).where(eq(employees.id, me.id));
	}

	return {
		feed: feed.map((f) => ({ ...f, unread: f.id > seen })),
		pushReady: pushConfigured(),
		fence,
		doublePay
	};
};

export const actions: Actions = {
	/** 打卡範圍：店家座標 + 半徑，員工要在範圍內才能打卡 */
	/** 國定假日上班雙倍薪：開 / 關 */
	setDoublePay: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const on = (await request.formData()).get('on') === 'on';
		await setHolidayDoublePay(on);
		await notify('staff', null, on ? '國定假日上班改為雙倍薪' : '國定假日上班改為一般時薪', { actorId: me.id, title: '💰 薪資規則' });
		return { scope: 'pay', ok: on ? '已開啟：國定假日上班算雙倍薪' : '已關閉：國定假日照一般時薪算' };
	},

	saveFence: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const form = await request.formData();
		const enabled = form.get('enabled') === 'on';
		// 座標可以是「用我現在的位置」帶進來的，也可以貼 Google 地圖的「25.0330, 121.5654」
		const [lat, lng] = str(form, 'coords').split(/[,，\s]+/).filter(Boolean).map(Number);
		const radius = Math.min(2000, Math.max(30, Math.round(Number(str(form, 'radius')) || 150)));
		const point = { lat, lng };
		if (enabled && !isValidPoint(point)) {
			return fail(400, { scope: 'fence', message: '店家座標不正確，請在店裡按「用我現在的位置」，或貼上 Google 地圖的座標' });
		}
		const current = await getGeofence();
		await saveGeofence({ enabled, radius, ...(isValidPoint(point) ? point : { lat: current.lat, lng: current.lng }) });
		await notify('staff', null, enabled ? `打卡範圍已開啟（店家 ${radius} 公尺內）` : '打卡範圍已關閉', { actorId: me.id, title: '📍 打卡範圍' });
		return { scope: 'fence', ok: enabled ? `已開啟：員工要在店家 ${radius} 公尺內才能打卡` : '已關閉打卡範圍，任何地方都能打卡' };
	}
};
