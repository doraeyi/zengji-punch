import tailwindcss from '@tailwindcss/vite';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 在 Vercel 上建置時（Vercel 會自動帶 VERCEL=1）用 Vercel adapter；
// 自己的主機（node build）就用 adapter-node。
// 資料庫在台灣，函式放香港（hkg1）離得最近，查詢才不會慢。
const adapter = process.env.VERCEL ? adapterVercel({ regions: ['hkg1'] }) : adapterNode();

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter
		})
	]
});
