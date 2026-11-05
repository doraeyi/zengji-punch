import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, devices, employees } from '#lib/server/db/index.js';
import { clearDeviceCookie, hashPassword, revokeDevice, revokeDevices, verifyPassword } from '#lib/server/auth.js';
import { requireUser } from '#lib/server/guard.js';
import { checkPassword } from '#lib/server/validate.js';
import { ALARM_OFFSETS, alarmToken, nextAlarm, remindPrefsOf, setRemindPrefs } from '#lib/server/alarm.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const [emp] = await db.select({ username: employees.username }).from(employees).where(eq(employees.id, me.id));
	const [device] = locals.deviceId
		? await db.select({ label: devices.label, createdAt: devices.createdAt }).from(devices).where(eq(devices.id, locals.deviceId))
		: [];
	const token = alarmToken(me.id);
	return {
		username: emp?.username ?? '',
		device: device ?? null,
		// 上班提醒：提前幾分鐘、要不要推播；鬧鐘網址與下一班的上班時間
		remind: (await remindPrefsOf([me.id])).get(me.id)!,
		alarm: token ? { url: `${url.origin}/api/alarm?u=${me.id}&k=${token}`, next: await nextAlarm(me.id, 0) } : null
	};
};

export const actions: Actions = {
	/** 改密碼後，所有已綁定的裝置（包含這支）都要用新密碼重新登入綁定 */
	password: async ({ request, locals, cookies }) => {
		const me = requireUser(locals);
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const [emp] = await db.select().from(employees).where(eq(employees.id, me.id));
		if (!emp || !(await verifyPassword(current, emp.passwordHash))) return fail(400, { message: '目前的密碼不對' });
		const problem = checkPassword(next) ?? (next !== confirm ? '兩次輸入的新密碼不一樣' : null);
		if (problem) return fail(400, { message: problem });

		await db.update(employees).set({ passwordHash: await hashPassword(next) }).where(eq(employees.id, me.id));
		await revokeDevices(me.id, 'password');
		clearDeviceCookie(cookies);
		redirect(303, '/login?changed=1');
	},

	/** 上班提醒：提前幾分鐘、要不要推播 */
	remind: async ({ request, locals }) => {
		const me = requireUser(locals);
		const form = await request.formData();
		const before = Number(form.get('before'));
		if (!ALARM_OFFSETS.includes(before)) return fail(400, { remindMessage: '提前分鐘數不正確' });
		await setRemindPrefs(me.id, { before, push: form.get('push') === 'on' });
		return { remindSaved: true };
	},

	/** 只有老闆可以自己登出；員工換手機要找老闆 */
	logout: async ({ locals, cookies }) => {
		const me = requireUser(locals);
		if (me.role !== 'owner') return fail(403, { message: '員工帳號不能自行登出，換手機請找老闆' });
		if (locals.deviceId) await revokeDevice(locals.deviceId, 'logout');
		clearDeviceCookie(cookies);
		redirect(303, '/');
	}
};
