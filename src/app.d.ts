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
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
