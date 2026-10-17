export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

export function checkUsername(username: string): string | null {
	return USERNAME_RE.test(username) ? null : '帳號請用 3–30 個英文、數字或 _ . -';
}

export function checkPassword(password: string): string | null {
	return password.length >= 6 ? null : '密碼至少 6 個字';
}

export const PALETTE = ['#c2410c', '#0f766e', '#7c3aed', '#be185d', '#1d4ed8', '#a16207', '#15803d', '#475569'];

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
