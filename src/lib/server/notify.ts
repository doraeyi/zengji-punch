import { db, notifications } from './db';
import { pushTo, pushToOwners, type PushPayload } from './push';

export type NotifyKind = 'punch' | 'shift' | 'leave' | 'payout' | 'staff' | 'remind';

type Options = {
	/** 推播給老闆時的標題（內文就是 text） */
	title?: string;
	/** 誰做的；老闆自己做的事不用再推給自己 */
	actorId?: number | null;
	/** 也推一則給當事員工（例如：你的班被改了、薪水發了） */
	toEmployee?: PushPayload;
	/** false = 只記到通知中心、不推播給老闆（例如只提醒員工自己的事） */
	pushOwners?: boolean;
};

/**
 * 記一則動態到後台「通知」，同時推播到老闆 / 老闆娘的手機。
 * 回傳推播送達老闆裝置的數量。失敗不會擋住主要動作。
 */
export async function notify(kind: NotifyKind, employeeId: number | null, text: string, opts: Options = {}) {
	try {
		await db.insert(notifications).values({ kind, employeeId, text: text.slice(0, 255), createdAt: new Date() });
	} catch (err) {
		console.error('[notify] save failed', err);
	}

	const tasks: Promise<number>[] = [
		opts.pushOwners === false
			? Promise.resolve(0)
			: pushToOwners({ title: opts.title ?? '曾記麻辣燙', body: text, url: '/admin', tag: `${kind}-${employeeId ?? 0}` }, opts.actorId)
	];
	if (opts.toEmployee && employeeId && employeeId !== opts.actorId) {
		tasks.push(pushTo([employeeId], opts.toEmployee));
	}
	const [toOwners] = await Promise.all(tasks.map((t) => t.catch((err) => (console.error('[notify] push failed', err), 0))));
	return toOwners;
}
