<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import { prefs, type ThemeChoice } from '#lib/stores/prefs.svelte.ts';

	/** Dark (the default) / Light / System. Stored in localStorage. */
	const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
		{ value: 'dark', label: 'Dark theme', icon: Moon },
		{ value: 'light', label: 'Light theme', icon: Sun },
		{ value: 'system', label: 'Follow system theme', icon: Monitor }
	];
</script>

<!-- A group of toggle buttons, each its own tab stop. Not a radiogroup: that
     role promises one tab stop and arrow-key movement. -->
<div
	role="group"
	aria-label="Theme"
	class="inline-flex shrink-0 gap-0.5 rounded-sm border border-rule bg-surface-sunken p-0.5"
>
	{#each OPTIONS as opt (opt.value)}
		{@const selected = prefs.theme === opt.value}
		<button
			type="button"
			aria-pressed={selected}
			aria-label={opt.label}
			title={opt.label}
			class="inline-flex size-8 items-center justify-center rounded-xs transition-colors duration-[120ms] md:size-7 {selected
				? 'bg-selected text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]'
				: 'text-ink-3 hover:text-ink'}"
			onclick={() => prefs.setTheme(opt.value)}
		>
			<opt.icon size={14} />
		</button>
	{/each}
</div>
