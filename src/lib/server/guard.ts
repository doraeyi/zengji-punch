import { error } from '@sveltejs/kit';

/** 只有老闆能做的事 */
export function requireOwner(locals: App.Locals): App.User {
	if (!locals.user) error(401, '請先登入');
	if (locals.user.role !== 'owner') error(403, '只有老闆可以操作');
	return locals.user;
}

/** 可以排班的人：老闆，或被老闆開了排班權限的員工 */
export function canSchedule(user: App.User | null): boolean {
	return !!user && (user.role === 'owner' || user.canSchedule);
}

export function requireScheduler(locals: App.Locals): App.User {
	if (!locals.user) error(401, '請先登入');
	if (!canSchedule(locals.user)) error(403, '你沒有排班權限，請找老闆開通');
	return locals.user;
}

export function requireUser(locals: App.Locals): App.User {
	if (!locals.user) error(401, '請先登入');
	return locals.user;
}
