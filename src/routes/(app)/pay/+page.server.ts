import { fail } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees, payouts } from '#lib/server/db/index.js';
import { attendance, summarize } from '#lib/server/attendance.js';
import { requireOwner } from '#lib/server/guard.js';
import { notify } from '#lib/server/notify.js';
import { str } from '#lib/server/validate.js';
import { addDays, fmtDay, fmtMoney, isDay, localDay, weekStart } from '#lib/time.js';

const MAX_DAYS = 93;
const METHOD_LABEL = { monthly: '月結', weekly: '週結', other: '其他' } as const;

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const isOwner = me.role === 'owner';

	const staff = isOwner
		? await db
				.select({ id: employees.id, name: employees.name, color: employees.color, role: employees.role, hourlyWage: employees.hourlyWage })
				.from(employees)
				.where(eq(employees.active, true))
				.orderBy(asc(employees.id))
		: [];

	// 員工只能看自己的薪水
	const requested = Number(url.searchParams.get('who'));
	const who = isOwner
		? (staff.find((s) => s.id === requested) ?? staff.find((s) => s.role === 'staff') ?? staff[0])?.id ?? me.id
		: me.id;

	// 區間：預設本週
	const today = localDay();
	let from = url.searchParams.get('from');
	let to = url.searchParams.get('to');
	if (!isDay(from) || !isDay(to) || from > to) {
		from = weekStart(today);
		to = addDays(from, 6);
	}
	if (addDays(from, MAX_DAYS) < to) to = addDays(from, MAX_DAYS);

	const [[person], days, history] = await Promise.all([
		db.select({ id: employees.id, name: employees.name, color: employees.color, hourlyWage: employees.hourlyWage }).from(employees).where(eq(employees.id, who)),
		attendance(who, from, to),
		db
			.select({
				id: payouts.id,
				periodStart: payouts.periodStart,
				periodEnd: payouts.periodEnd,
				amount: payouts.amount,
				method: payouts.method,
				note: payouts.note,
				paidAt: payouts.paidAt
			})
			.from(payouts)
			.where(eq(payouts.employeeId, who))
			.orderBy(desc(payouts.periodEnd), desc(payouts.id))
	]);

	const unpaid = days.filter((d) => d.amount > 0 && !d.payoutId);
	return {
		staff,
		person,
		from,
		to,
		today,
		days: days.filter((d) => d.sessions.length || d.status === 'leave' || d.status === 'absent').reverse(),
		summary: summarize(days),
		unpaid: unpaid.length ? { from: unpaid[0].day, to: unpaid.at(-1)!.day, amount: unpaid.reduce((s, d) => s + d.amount, 0) } : null,
		history
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const owner = requireOwner(locals);
		const form = await request.formData();
		const employeeId = Number(form.get('employeeId'));
		const method = str(form, 'method');
		const periodStart = str(form, 'periodStart');
		const periodEnd = str(form, 'periodEnd');
		const amount = Math.round(Number(str(form, 'amount').replace(/[,\s$]/g, '')));
		const note = str(form, 'note').slice(0, 500) || null;

		if (!employeeId) return fail(400, { message: '請選擇員工' });
		if (method !== 'monthly' && method !== 'weekly' && method !== 'other') return fail(400, { message: '請選擇結算方式' });
		if (!isDay(periodStart) || !isDay(periodEnd) || periodStart > periodEnd) return fail(400, { message: '期間不正確' });
		if (!Number.isFinite(amount) || amount <= 0) return fail(400, { message: '請輸入金額' });

		const [emp] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId));
		await db.insert(payouts).values({ employeeId, method, periodStart, periodEnd, amount, note, paidAt: new Date(), createdBy: owner.id });

		const text = `${emp?.name} ${fmtDay(periodStart, false)}–${fmtDay(periodEnd, false)} 薪資 ${fmtMoney(amount)}（${METHOD_LABEL[method]}）已發放`;
		await notify('payout', employeeId, text, {
			title: '💰 薪資已發放',
			actorId: owner.id,
			toEmployee: {
				title: '💰 薪水發囉！',
				body: `${fmtDay(periodStart, false)}–${fmtDay(periodEnd, false)} 共 ${fmtMoney(amount)}${note ? `（${note}）` : ''}`,
				url: `/pay?from=${periodStart}&to=${periodEnd}`,
				tag: `payout-${periodStart}`
			}
		});
		return { added: true };
	},

	remove: async ({ request, locals }) => {
		requireOwner(locals);
		const id = Number((await request.formData()).get('id'));
		if (id) await db.delete(payouts).where(eq(payouts.id, id));
		return { removed: true };
	}
};
