import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, devices, employees } from '#lib/server/db/index.js';
import { clearDeviceCookie, hashPassword, revokeDevice, revokeDevices, verifyPassword } from '#lib/server/auth.js';
import { requireUser } from '#lib/server/guard.js';
import { checkPassword } from '#lib/server/validate.js';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const [emp] = await db.select({ username: employees.username }).from(employees).where(eq(employees.id, me.id));
	const [device] = locals.deviceId
		? await db.select({ label: devices.label, createdAt: devices.createdAt }).from(devices).where(eq(devices.id, locals.deviceId))
		: [];
	return { username: emp?.username ?? '', device: device ?? null };
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

	/** 只有老闆可以自己登出；員工換手機要找老闆 */
	logout: async ({ locals, cookies }) => {
		const me = requireUser(locals);
		if (me.role !== 'owner') return fail(403, { message: '員工帳號不能自行登出，換手機請找老闆' });
		if (locals.deviceId) await revokeDevice(locals.deviceId, 'logout');
		clearDeviceCookie(cookies);
		redirect(303, '/');
	}
};
