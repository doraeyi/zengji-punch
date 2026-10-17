import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// 舊網址：第一次設定已經併進註冊頁
export const load: PageServerLoad = () => redirect(308, '/register');
