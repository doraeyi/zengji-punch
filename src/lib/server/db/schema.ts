import {
	mysqlTable,
	int,
	varchar,
	datetime,
	date,
	time,
	mysqlEnum,
	boolean,
	text,
	index,
	uniqueIndex,
	json
} from 'drizzle-orm/mysql-core';

// 所有 datetime 欄位都由程式寫入 UTC 時間（連線時已設定 time_zone = +00:00）。

/** 員工（含老闆）。role = owner 才能編班表、記薪資、管理裝置。 */
export const employees = mysqlTable(
	'employees',
	{
		id: int('id').autoincrement().primaryKey(),
		name: varchar('name', { length: 50 }).notNull(),
		username: varchar('username', { length: 50 }).notNull(),
		passwordHash: varchar('password_hash', { length: 255 }).notNull(),
		role: mysqlEnum('role', ['owner', 'staff']).notNull().default('staff'),
		/** 班表上的代表色，方便一眼看出是誰的班 */
		color: varchar('color', { length: 16 }).notNull().default('#c2410c'),
		active: boolean('active').notNull().default(true),
		/** 排班權限：員工也能在月曆新增、修改、刪除班表（看不到別人的打卡與薪水） */
		canSchedule: boolean('can_schedule').notNull().default(false),
		/** 時薪（元）。老闆 / 老闆娘可設 0 表示不計薪 */
		hourlyWage: int('hourly_wage').notNull().default(0),
		/** 老闆看過的最後一則通知 id，用來算未讀數 */
		seenNotificationId: int('seen_notification_id').notNull().default(0),
		createdAt: datetime('created_at').notNull()
	},
	(t) => [uniqueIndex('employees_username_uq').on(t.username)]
);

/**
 * 綁定的裝置。cookie 裡放隨機 token，資料庫只存它的 SHA-256。
 * 一般員工同時只能有一台有效裝置（revokedAt 為 null）。
 */
export const devices = mysqlTable(
	'devices',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		tokenHash: varchar('token_hash', { length: 64 }).notNull(),
		label: varchar('label', { length: 120 }).notNull().default(''),
		createdAt: datetime('created_at').notNull(),
		lastSeenAt: datetime('last_seen_at').notNull(),
		revokedAt: datetime('revoked_at'),
		revokeReason: varchar('revoke_reason', { length: 40 })
	},
	(t) => [
		uniqueIndex('devices_token_uq').on(t.tokenHash),
		index('devices_employee_idx').on(t.employeeId)
	]
);

/**
 * 打卡紀錄。每天的計算方式：當天最早一筆 = 上班卡、最晚一筆 = 下班卡，
 * 中間多按的不影響。kind 只是記錄當下按的是第幾下（第一下 in、之後 out）。
 */
export const punches = mysqlTable(
	'punches',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		kind: mysqlEnum('kind', ['in', 'out']).notNull(),
		at: datetime('at').notNull(),
		deviceId: int('device_id'),
		/** app = 員工自己打的；manual = 老闆補登 */
		source: varchar('source', { length: 20 }).notNull().default('app'),
		/** 打卡當下離店家幾公尺（有開打卡範圍才會記） */
		distance: int('distance')
	},
	(t) => [index('punches_employee_at_idx').on(t.employeeId, t.at)]
);

/** 班表，日期與時間都是店家當地時間。 */
export const shifts = mysqlTable(
	'shifts',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		day: date('day', { mode: 'string' }).notNull(),
		startTime: time('start_time').notNull(),
		endTime: time('end_time').notNull(),
		note: varchar('note', { length: 100 }),
		/** 請假：班還在，但不用打卡、不算缺勤、不計薪 */
		leave: boolean('leave').notNull().default(false)
	},
	(t) => [index('shifts_day_idx').on(t.day)]
);

/** 固定班：每位員工每週固定哪幾天上班，月曆可一鍵依此產生班表 */
export const shiftTemplates = mysqlTable(
	'shift_templates',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		/** 0 = 週日 … 6 = 週六 */
		weekday: int('weekday').notNull(),
		startTime: time('start_time').notNull(),
		endTime: time('end_time').notNull()
	},
	(t) => [uniqueIndex('shift_templates_emp_day_uq').on(t.employeeId, t.weekday)]
);

/** 手機推播（Web Push）訂閱：一個人可以有好幾台裝置 */
export const pushSubscriptions = mysqlTable(
	'push_subscriptions',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		/** 是哪一支綁定的手機訂閱的；手機被解除綁定時一起刪掉 */
		deviceId: int('device_id'),
		endpoint: varchar('endpoint', { length: 500 }).notNull(),
		p256dh: varchar('p256dh', { length: 200 }).notNull(),
		auth: varchar('auth', { length: 100 }).notNull(),
		label: varchar('label', { length: 120 }).notNull().default(''),
		createdAt: datetime('created_at').notNull()
	},
	(t) => [uniqueIndex('push_endpoint_uq').on(t.endpoint), index('push_employee_idx').on(t.employeeId)]
);

/** 店家層級的設定（key / value），例如打卡範圍 */
export const settings = mysqlTable('settings', {
	key: varchar('key', { length: 50 }).primaryKey(),
	value: json('value').notNull()
});

/** 已經送過的自動提醒（忘記上班卡、半夜還沒下班卡），同一天同一種只送一次 */
export const reminders = mysqlTable(
	'reminders',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		day: date('day', { mode: 'string' }).notNull(),
		kind: varchar('kind', { length: 20 }).notNull(),
		sentAt: datetime('sent_at').notNull()
	},
	(t) => [uniqueIndex('reminders_uq').on(t.employeeId, t.day, t.kind)]
);

/** 給老闆 / 老闆娘看的動態通知（打卡、排班異動、請假、發薪） */
export const notifications = mysqlTable(
	'notifications',
	{
		id: int('id').autoincrement().primaryKey(),
		kind: varchar('kind', { length: 20 }).notNull(),
		employeeId: int('employee_id'),
		text: varchar('text', { length: 255 }).notNull(),
		createdAt: datetime('created_at').notNull()
	},
	(t) => [index('notifications_created_idx').on(t.createdAt)]
);

/** 薪資發放紀錄，老闆付完錢後記一筆。金額單位為新台幣元。 */
export const payouts = mysqlTable(
	'payouts',
	{
		id: int('id').autoincrement().primaryKey(),
		employeeId: int('employee_id')
			.notNull()
			.references(() => employees.id),
		periodStart: date('period_start', { mode: 'string' }).notNull(),
		periodEnd: date('period_end', { mode: 'string' }).notNull(),
		amount: int('amount').notNull(),
		method: mysqlEnum('method', ['monthly', 'weekly', 'other']).notNull(),
		note: text('note'),
		paidAt: datetime('paid_at').notNull(),
		createdBy: int('created_by').notNull()
	},
	(t) => [index('payouts_employee_idx').on(t.employeeId)]
);

export type Employee = typeof employees.$inferSelect;
export type Role = Employee['role'];
export type PayMethod = (typeof payouts.$inferSelect)['method'];
