import ExcelJS from 'exceljs';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, employees, payouts } from '#lib/server/db/index.js';
import { attendance, summarize, type DayRecord } from '#lib/server/attendance.js';
import { requireOwner } from '#lib/server/guard.js';
import { addDays, fmtTime, hhmm, isDay, localDay, monthDays, weekdayLabel } from '#lib/time.js';

const STATUS = {
	ok: '正常',
	late: '遲到',
	'missing-out': '缺卡',
	absent: '未出勤',
	leave: '請假',
	working: '上班中',
	off: '',
	upcoming: ''
} as const;
const METHOD = { monthly: '月結', weekly: '週結', other: '其他' } as const;

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8321F' } };

function styleHeader(sheet: ExcelJS.Worksheet) {
	const row = sheet.getRow(1);
	row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
	row.fill = HEADER_FILL;
	row.alignment = { vertical: 'middle', horizontal: 'center' };
	row.height = 22;
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/** 匯出 Excel：每日薪資、每月薪資、薪資總表、每日明細、發放紀錄 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requireOwner(locals);
	const month = localDay().slice(0, 7);
	let from = url.searchParams.get('from');
	let to = url.searchParams.get('to');
	if (!isDay(from) || !isDay(to) || from > to) {
		from = `${month}-01`;
		to = monthDays(month).at(-1)!;
	}
	if (addDays(from, 370) < to) to = addDays(from, 370);

	const people = await db
		.select({ id: employees.id, name: employees.name, role: employees.role, wage: employees.hourlyWage })
		.from(employees)
		.where(eq(employees.active, true))
		.orderBy(asc(employees.id));

	const book = new ExcelJS.Workbook();
	book.creator = '曾記麻辣燙 打卡系統';
	book.created = new Date();

	// 每日薪資：一天一列，每個人一組「時數、薪資」，最後是當天合計
	const daily = book.addWorksheet('每日薪資');
	// 每月薪資：一個月一列，每個人的當月薪資，最後是當月合計
	const monthly = book.addWorksheet('每月薪資');

	const summary = book.addWorksheet('薪資總表');
	summary.columns = [
		{ header: '員工', key: 'name', width: 12 },
		{ header: '身分', key: 'role', width: 8 },
		{ header: '時薪', key: 'wage', width: 9, style: { numFmt: '"$"#,##0' } },
		{ header: '出勤天數', key: 'days', width: 10 },
		{ header: '計薪時數', key: 'hours', width: 10, style: { numFmt: '0.0' } },
		{ header: '應領', key: 'amount', width: 12, style: { numFmt: '"$"#,##0' } },
		{ header: '已領', key: 'paid', width: 12, style: { numFmt: '"$"#,##0' } },
		{ header: '未領', key: 'unpaid', width: 12, style: { numFmt: '"$"#,##0' } },
		{ header: '遲到', key: 'late', width: 8 },
		{ header: '缺卡/未到', key: 'issues', width: 10 },
		{ header: '請假', key: 'leave', width: 8 }
	];

	const detail = book.addWorksheet('每日明細');
	detail.columns = [
		{ header: '日期', key: 'day', width: 12 },
		{ header: '星期', key: 'wd', width: 6 },
		{ header: '員工', key: 'name', width: 12 },
		{ header: '排班', key: 'shift', width: 13 },
		{ header: '上班卡', key: 'in', width: 9 },
		{ header: '下班卡', key: 'out', width: 9 },
		{ header: '計薪時數', key: 'hours', width: 10, style: { numFmt: '0.00' } },
		{ header: '時薪', key: 'wage', width: 9, style: { numFmt: '"$"#,##0' } },
		{ header: '金額', key: 'amount', width: 10, style: { numFmt: '"$"#,##0' } },
		{ header: '節日', key: 'holiday', width: 12 },
		{ header: '倍率', key: 'multiplier', width: 6 },
		{ header: '狀態', key: 'status', width: 9 },
		{ header: '遲到(分)', key: 'late', width: 9 },
		{ header: '已領', key: 'paid', width: 7 }
	];

	const detailRows: Record<string, unknown>[] = [];
	const records = await Promise.all(people.map((p) => attendance(p.id, from, to)));
	for (const [i, p] of people.entries()) {
		const days = records[i];
		const s = summarize(days);
		summary.addRow({
			name: p.name,
			role: p.role === 'owner' ? '老闆' : '員工',
			wage: p.wage,
			days: s.workDays,
			hours: Math.round((s.paidMinutes / 60) * 10) / 10,
			amount: s.amount,
			paid: s.paidAmount,
			unpaid: s.unpaidAmount,
			late: s.late,
			issues: s.issues,
			leave: s.leave
		});
		for (const d of days) {
			if (!d.shift && !d.sessions.length) continue;
			const first = d.sessions.find((x) => x.in)?.in;
			const last = d.sessions.findLast((x) => x.out)?.out;
			detailRows.push({
				day: d.day,
				wd: weekdayLabel(d.day),
				name: p.name,
				shift: d.shift ? (d.shift.leave ? '請假' : `${hhmm(d.shift.startTime)}-${hhmm(d.shift.endTime)}`) : '',
				in: first ? fmtTime(first.at) : '',
				out: last ? fmtTime(last.at) : '',
				hours: d.paidMinutes ? Math.round((d.paidMinutes / 60) * 100) / 100 : null,
				wage: p.wage,
				amount: d.amount || null,
				holiday: d.holiday?.name ?? '',
				multiplier: d.multiplier === 2 ? '×2' : '',
				status: STATUS[d.status],
				late: d.lateMinutes || null,
				paid: d.amount ? (d.payoutId ? '✓' : '') : ''
			});
		}
	}

	const total = summary.addRow({
		name: '合計',
		amount: { formula: `SUM(F2:F${summary.rowCount})` },
		paid: { formula: `SUM(G2:G${summary.rowCount})` },
		unpaid: { formula: `SUM(H2:H${summary.rowCount})` }
	});
	total.font = { bold: true };

	// 明細依日期排序比較好對帳
	detailRows.sort((a, b) => String(a.day).localeCompare(String(b.day)));
	detail.addRows(detailRows);

	const payoutSheet = book.addWorksheet('發放紀錄');
	payoutSheet.columns = [
		{ header: '員工', key: 'name', width: 12 },
		{ header: '期間開始', key: 'start', width: 12 },
		{ header: '期間結束', key: 'end', width: 12 },
		{ header: '結算方式', key: 'method', width: 10 },
		{ header: '金額', key: 'amount', width: 12, style: { numFmt: '"$"#,##0' } },
		{ header: '發放日', key: 'paidAt', width: 12 },
		{ header: '備註', key: 'note', width: 30 }
	];
	const payoutRows = await db
		.select({
			name: employees.name,
			periodStart: payouts.periodStart,
			periodEnd: payouts.periodEnd,
			method: payouts.method,
			amount: payouts.amount,
			paidAt: payouts.paidAt,
			note: payouts.note
		})
		.from(payouts)
		.innerJoin(employees, eq(payouts.employeeId, employees.id))
		.where(and(lte(payouts.periodStart, to), gte(payouts.periodEnd, from)))
		.orderBy(asc(payouts.periodStart));
	for (const r of payoutRows) {
		payoutSheet.addRow({
			name: r.name,
			start: r.periodStart,
			end: r.periodEnd,
			method: METHOD[r.method],
			amount: r.amount,
			paidAt: localDay(r.paidAt),
			note: r.note ?? ''
		});
	}

	// 每日、每月薪資表只列有領薪的人（不計薪的老闆不佔欄位）
	const paidIdx = people.flatMap((p, i) => (p.wage || records[i].some((d) => d.amount) ? [i] : []));
	fillDaily(daily, paidIdx.map((i) => people[i]), paidIdx.map((i) => records[i]));
	fillMonthly(monthly, paidIdx.map((i) => people[i]), paidIdx.map((i) => records[i]));

	for (const sheet of [daily, monthly, summary, detail, payoutSheet]) styleHeader(sheet);

	const buffer = await book.xlsx.writeBuffer();
	const filename = `曾記麻辣燙_出勤薪資_${from}_${to}.xlsx`;
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
		}
	});
};

type Person = { id: number; name: string };
const MONEY = '"$"#,##0';
const HOURS = '0.0';

/** 第 n 欄（1 開始）的欄名：1 → A、27 → AA */
function col(n: number): string {
	let name = '';
	for (; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	return name;
}

function addTotalRow(sheet: ExcelJS.Worksheet, label: string, firstCol: number, lastCol: number) {
	const last = sheet.rowCount;
	const row = sheet.addRow([label]);
	for (let c = firstCol; c <= lastCol; c++) {
		row.getCell(c).value = { formula: `SUM(${col(c)}2:${col(c)}${last})` };
	}
	row.font = { bold: true };
	row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBEFE3' } };
}

function fillDaily(sheet: ExcelJS.Worksheet, people: Person[], records: DayRecord[][]) {
	sheet.columns = [
		{ header: '日期', width: 12 },
		{ header: '星期', width: 6 },
		...people.flatMap((p) => [
			{ header: `${p.name} 時數`, width: 11, style: { numFmt: HOURS } },
			{ header: `${p.name} 薪資`, width: 11, style: { numFmt: MONEY } }
		]),
		{ header: '當日合計', width: 12, style: { numFmt: MONEY } }
	];
	const days = records[0]?.map((d) => d.day) ?? [];
	for (const [di, day] of days.entries()) {
		const cells = records.map((r) => r[di]);
		if (!cells.some((d) => d.paidMinutes || d.amount)) continue; // 沒人上班的日子不列
		const row: (string | number | null)[] = [day, weekdayLabel(day)];
		for (const d of cells) row.push(d.paidMinutes ? d.paidMinutes / 60 : null, d.amount || null);
		row.push(cells.reduce((sum, d) => sum + d.amount, 0));
		sheet.addRow(row);
	}
	addTotalRow(sheet, '合計', 3, 3 + people.length * 2);
}

function fillMonthly(sheet: ExcelJS.Worksheet, people: Person[], records: DayRecord[][]) {
	sheet.columns = [
		{ header: '月份', width: 10 },
		...people.flatMap((p) => [
			{ header: `${p.name} 時數`, width: 11, style: { numFmt: HOURS } },
			{ header: `${p.name} 薪資`, width: 11, style: { numFmt: MONEY } }
		]),
		{ header: '當月合計', width: 12, style: { numFmt: MONEY } }
	];
	const months = [...new Set((records[0] ?? []).map((d) => d.day.slice(0, 7)))];
	for (const month of months) {
		const row: (string | number)[] = [month];
		let total = 0;
		for (const r of records) {
			const inMonth = r.filter((d) => d.day.startsWith(month));
			const amount = inMonth.reduce((sum, d) => sum + d.amount, 0);
			row.push(inMonth.reduce((sum, d) => sum + d.paidMinutes, 0) / 60, amount);
			total += amount;
		}
		row.push(total);
		sheet.addRow(row);
	}
	addTotalRow(sheet, '合計', 2, 2 + people.length * 2);
}
