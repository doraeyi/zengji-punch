import { error } from '@sveltejs/kit';

/** 只有老闆能做的事 */
export function requireOwner(locals: App.Locals): App.User {
	if (!locals.user) error(401, '請先登入');
	if (locals.user.role !== 'owner') error(403, '只有老闆可以操作');
	return locals.user;
}

export function requireUser(locals: App.Locals): App.User {
	if (!locals.user) error(401, '請先登入');
	return locals.user;
}
