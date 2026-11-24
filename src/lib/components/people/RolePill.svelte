<script lang="ts">
	import RoleMark from './RoleMark.svelte';
	import { roleMeta } from '#lib/roles.ts';

	/**
	 * Role pill: coloured mark + mono code. Text never wears the data colour.
	 * `full` spells the role out (Scenario, Songs / vocals) where there is room
	 * and no legend nearby, as in an identity header.
	 */
	interface Props {
		role: string;
		full?: boolean;
		class?: string;
	}
	let { role, full = false, class: klass = '' }: Props = $props();
	const meta = $derived(roleMeta(role));
</script>

<span
	class="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-xs bg-surface-sunken px-1.5 text-2xs font-medium text-ink {full
		? ''
		: 'font-mono'} {klass}"
	title={full ? undefined : meta.label}
>
	<RoleMark {role} size={8} />
	{full ? meta.label : meta.code}
</span>
