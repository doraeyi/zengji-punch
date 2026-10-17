import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import {
	activeDeviceCount,
	bindDevice,
	clearLoginFailures,
	loginLocked,
	recordLoginFailure,
	verifyPassword
} from '#lib/server/auth.js';
import { punch } from '#lib/server/punch.js';
import { fenceApplies, getGeofence } from '#lib/server/geofence.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get('then') === 'punch' ? '/' : '/schedule');
	return { then: url.searchParams.get('then'), changed: url.searchParams.has('changed') };
};

export const actions: Actions = {
	default: async ({ request, cookies, locals, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const then = String(form.get('then') ?? '');

		if (!username || !password) {
			return fail(400, { username, message: '請輸入帳號和密碼' });
		}

		const key = `${getClientAddress()}|${username.toLowerCase()}`;
		const locked = loginLocked(key);
		if (locked) {
			return fail(429, { username, message: `嘗試太多次了，請 ${locked} 分鐘後再試` });
		}

		const [emp] = await db.select().from(employees).where(eq(employees.username, username)).limit(1);
		if (!emp || !emp.active || !(await verifyPassword(password, emp.passwordHash))) {
			recordLoginFailure(key);
			return fail(400, { username, message: '帳號或密碼不對' });
		}
		clearLoginFailures(key);

		if (locals.user && locals.user.id !== emp.id) {
			return fail(409, {
				username,
				message: `這支手機已經綁定給「${locals.user.name}」，不能再登入別人的帳號`
			});
		}

		// 一般員工只能綁一支手機；換手機要老闆先在後台解除綁定
		if (emp.role === 'staff' && (await activeDeviceCount(emp.id)) > 0) {
			return fail(409, {
				username,
				bound: true,
				message: '你的帳號已經綁定在另一支手機上。換手機請找老闆在後台「解除綁定」後再登入。'
			});
		}

		const deviceId = await bindDevice(cookies, emp.id, request.headers.get('user-agent'));

		if (then === 'punch') {
			// 有打卡範圍時，登入頁拿不到定位，回首頁讓他靠近店家再按
			if (fenceApplies(await getGeofence(), emp.role)) redirect(303, '/');
			await punch(emp, deviceId);
			redirect(303, '/?just=1');
		}
		redirect(303, emp.role === 'owner' ? '/admin' : '/schedule');
	}
};
