<script lang="ts">
	// 送出登入 / 註冊表單時順便帶上手機型號，讓老闆在後台認得出是哪支手機。
	// 只有 Android 的 Chrome / Samsung 瀏覽器會給（例如 Pixel 8）；iPhone 不提供型號。
	let model = $state('');

	$effect(() => {
		const uaData = (navigator as { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ model?: string }> } })
			.userAgentData;
		uaData
			?.getHighEntropyValues(['model'])
			.then((v) => (model = v.model ?? ''))
			.catch(() => {});
	});
</script>

<input type="hidden" name="model" value={model} />
