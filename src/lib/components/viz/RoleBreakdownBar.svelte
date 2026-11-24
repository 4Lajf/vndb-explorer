<script lang="ts">
	import RoleMark from '../people/RoleMark.svelte';
	import { LEGEND_ROLES, legendRole, roleMeta } from '#lib/roles.ts';

	/**
	 * Segmented bar in fixed role order, 2px surface gaps (DESIGN §6.5). The bar
	 * is purely graphical: exact counts sit beside it in ink on the surface, so no
	 * number ever depends on a role hue for its contrast. Hollow roles are drawn
	 * outlined so the neutral grey is separated by form.
	 */
	interface Props {
		/** Role → count. */
		counts: Record<string, number>;
		label?: string;
	}
	let { counts, label }: Props = $props();

	const segments = $derived.by(() => {
		const folded = new Map<string, number>();
		for (const [role, n] of Object.entries(counts)) {
			const key = legendRole(role);
			folded.set(key, (folded.get(key) ?? 0) + n);
		}
		const total = [...folded.values()].reduce((s, v) => s + v, 0);
		return LEGEND_ROLES.filter((r) => (folded.get(r) ?? 0) > 0).map((r) => {
			const n = folded.get(r) ?? 0;
			return { role: r as string, n, share: total ? n / total : 0, meta: roleMeta(r) };
		});
	});
	const summary = $derived(segments.map((s) => `${s.meta.label} ${s.n}`).join(', '));
</script>

<div class="grid gap-x-3 gap-y-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
	{#if label}<span class="truncate text-xs text-ink-2">{label}</span>{/if}
	{#if segments.length === 0}
		<span class="text-xs text-ink-3">No role credits</span>
	{:else}
		<div class="min-w-0 {label ? '' : 'sm:col-span-2'}">
			<div class="flex h-3 gap-[2px]" role="img" aria-label="{label ?? 'Roles'}: {summary}">
				{#each segments as s (s.role)}
					<div
						class="min-w-[3px] rounded-[2px]"
						style="flex: {s.share} 1 0%; {s.meta.fill === 'hollow'
							? `box-shadow: inset 0 0 0 1.5px ${s.meta.color};`
							: `background: ${s.meta.color};`}"
					></div>
				{/each}
			</div>
			<ul class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
				{#each segments as s (s.role)}
					<li class="inline-flex items-center gap-1 text-2xs" title={s.meta.label}>
						<RoleMark role={s.role} size={8} />
						<span class="font-mono text-ink-2">{s.meta.code}</span>
						<span class="tnum font-mono font-medium text-ink">{s.n}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
