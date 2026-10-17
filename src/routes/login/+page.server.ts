import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import {
	activeDeviceCount,
	lastRevokedDevice,
	deviceLabel,
	bindDevice,
	clearLoginFailures,
	loginLocked,
	recordLoginFailure,
	verifyPassword
} from '#lib/server/auth.js';
import { punch } from '#lib/server/punch.js';
import { notify } from '#lib/server/notify.js';
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

		const bound = await activeDeviceCount(emp.id);

		// 老闆按了「轉移帳號」之後，「這次」被轉走的舊手機不能再登回這個帳號，要用新手機登入
		const lastRevoked = bound === 0 ? await lastRevokedDevice(emp.id) : null;
		const waitingTransfer = lastRevoked?.reason === 'transfer';
		if (
			waitingTransfer &&
			locals.transferredFrom?.employeeId === emp.id &&
			locals.transferredFrom.deviceId === lastRevoked!.id
		) {
			return fail(409, {
				username,
				message: '你的帳號已經轉移出去了，這支舊手機不能再登入。請用新手機登入同一組帳號密碼。'
			});
		}

		// 一般員工只能綁一支手機；換手機要老闆先在後台按「轉移帳號」
		if (emp.role === 'staff' && bound > 0) {
			return fail(409, {
				username,
				bound: true,
				message: '你的帳號已經綁定在另一支手機上。換手機請找老闆在後台按「轉移帳號」後，再用新手機登入。'
			});
		}

		const transferring = emp.role === 'staff' && waitingTransfer;
		const model = String(form.get('model') ?? '');
		const deviceId = await bindDevice(cookies, emp.id, request.headers.get('user-agent'), model);
		if (transferring) {
			const label = deviceLabel(request.headers.get('user-agent'), model);
			await notify('staff', emp.id, `${emp.name} 已在新手機（${label}）登入，帳號轉移完成`, { title: '📱 換手機完成' });
		}

		if (then === 'punch') {
			// 有打卡範圍時，登入頁拿不到定位，回首頁讓他靠近店家再按
			if (fenceApplies(await getGeofence(), emp.role)) redirect(303, '/');
			await punch(emp, deviceId);
			redirect(303, '/?just=1');
		}
		redirect(303, emp.role === 'owner' ? '/admin' : '/schedule');
	}
};
