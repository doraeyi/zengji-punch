import ExcelJS from 'exceljs';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, employees, payouts } from '#lib/server/db/index.js';
import { attendance, summarize } from '#lib/server/attendance.js';
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

/** 匯出 Excel：薪資總表、每日明細、發放紀錄三個工作表 */
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
	for (const p of people) {
		const days = await attendance(p.id, from, to);
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

	for (const sheet of [summary, detail, payoutSheet]) styleHeader(sheet);

	const buffer = await book.xlsx.writeBuffer();
	const filename = `曾記麻辣燙_出勤薪資_${from}_${to}.xlsx`;
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
		}
	});
};
