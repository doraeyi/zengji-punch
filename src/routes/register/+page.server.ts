import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import { bindDevice, hashPassword } from '#lib/server/auth.js';
import { notify } from '#lib/server/notify.js';
import { PALETTE, checkPassword, checkUsername, str } from '#lib/server/validate.js';

// 註冊：店裡還沒有老闆時，可以勾「我是老闆」；有老闆之後，新註冊的人一律是員工。
// 老闆娘等其他管理者，請先註冊成員工，再由老闆在後台給老闆權限。

async function counts() {
	const [row] = await db
		.select({
			total: sql<number>`count(*)`,
			owners: sql<number>`sum(case when ${employees.role} = 'owner' and ${employees.active} then 1 else 0 end)`
		})
		.from(employees);
	return { total: Number(row?.total ?? 0), owners: Number(row?.owners ?? 0) };
}

export const load: PageServerLoad = async ({ locals }) => {
	// 這支手機已經綁定帳號就不用註冊
	if (locals.user) redirect(303, '/');
	const { total, owners } = await counts();
	return { ownerExists: owners > 0, firstUser: total === 0 };
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		if (locals.user) redirect(303, '/');
		const form = await request.formData();
		const name = str(form, 'name');
		const username = str(form, 'username');
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const wantsOwner = form.get('owner') === 'on';
		const keep = { name, username, wantsOwner };

		const problem =
			(!name && '請輸入名字') ||
			checkUsername(username) ||
			checkPassword(password) ||
			(password !== confirm ? '兩次輸入的密碼不一樣' : null);
		if (problem) return fail(400, { ...keep, message: problem });

		const [taken] = await db.select({ id: employees.id }).from(employees).where(eq(employees.username, username));
		if (taken) return fail(400, { ...keep, message: '這個帳號已經有人用了，換一個試試' });

		// 伺服器端再確認一次：已經有老闆就不能自己勾成老闆
		const { total, owners } = await counts();
		const role = wantsOwner && owners === 0 ? 'owner' : 'staff';

		const [row] = await db
			.insert(employees)
			.values({
				name,
				username,
				passwordHash: await hashPassword(password),
				role,
				color: role === 'owner' ? '#b8321f' : PALETTE[(total + 1) % PALETTE.length],
				createdAt: new Date()
			})
			.$returningId();
		await bindDevice(cookies, row.id, request.headers.get('user-agent'), String(form.get('model') ?? ''));

		if (role === 'staff') {
			await notify('staff', row.id, `新員工 ${name} 註冊了，記得到「管理」設定時薪`, { title: '👋 新員工加入' });
		}
		redirect(303, role === 'owner' ? '/admin' : '/');
	}
};
