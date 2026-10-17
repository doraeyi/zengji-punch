// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface User {
			id: number;
			name: string;
			role: 'owner' | 'staff';
			color: string;
		}
		interface Locals {
			/** 這支裝置綁定的員工；沒綁定就是 null */
			user: User | null;
			deviceId: number | null;
			/** 這支手機原本的帳號已被老闆轉移到新手機（記住是誰，避免舊手機再登回去） */
			transferredFrom: { employeeId: number; deviceId: number } | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
