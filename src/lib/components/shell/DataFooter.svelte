<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';

	/**
	 * Always states the dump date and that inferences are not VNDB data (DESIGN
	 * §7.1), with the two register badges exactly as the pages draw them, and
	 * links to the full Key reference page.
	 */
	interface Props {
		dumpDate: string;
	}
	let { dumpDate }: Props = $props();
</script>

<footer class="mt-14 border-t border-rule">
	<div
		class="mx-auto flex max-w-page flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-xs text-ink-3 md:px-6 lg:px-8"
	>
		<p>
			Data: <a
				class="link inline-flex items-center gap-0.5 text-ink-2"
				href="https://vndb.org/d14"
				target="_blank"
				rel="noopener noreferrer">VNDB database dump<ArrowUpRight size={10} /></a
			>
			of <span class="tnum font-mono text-ink-2">{dumpDate}</span> · ODbL / DbCL
		</p>
		<p class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="inline-flex items-center gap-1.5">
				<EpistemicBadge register="confirmed" />
				<span>Solid: stated in VNDB</span>
			</span>
			<span class="inline-flex items-center gap-1.5">
				<EpistemicBadge register="inferred" />
				<span class="italic">Dashed: inferred by this tool, not VNDB data</span>
			</span>
		</p>
		<a
			href="/key"
			class="link no-print ml-auto text-ink-2"
			title="Help, symbols & glossary"
		>
			Help
		</a>
	</div>
</footer>
