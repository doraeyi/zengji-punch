import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import { bindDevice, hashPassword } from '#lib/server/auth.js';
import { checkPassword, checkUsername, str } from '#lib/server/validate.js';

// 第一次啟用：資料庫裡還沒有任何人時，建立老闆帳號。之後這頁就會關閉。
async function hasAnyone() {
	const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(employees);
	return Number(count) > 0;
}

export const load: PageServerLoad = async () => {
	if (await hasAnyone()) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (await hasAnyone()) redirect(303, '/');
		const form = await request.formData();
		const name = str(form, 'name');
		const username = str(form, 'username');
		const password = String(form.get('password') ?? '');

		const problem =
			(!name && '請輸入名字') || checkUsername(username) || checkPassword(password);
		if (problem) return fail(400, { name, username, message: problem });

		const [row] = await db
			.insert(employees)
			.values({
				name,
				username,
				passwordHash: await hashPassword(password),
				role: 'owner',
				color: '#b8321f',
				createdAt: new Date()
			})
			.$returningId();
		await bindDevice(cookies, row.id, request.headers.get('user-agent'));
		redirect(303, '/admin');
	}
};
