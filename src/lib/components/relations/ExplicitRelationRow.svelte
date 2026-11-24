<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerTypeBadge from '../identity/ProducerTypeBadge.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import type { ExplicitRelationItem } from '#lib/types.ts';
	import { EXPLICIT_META } from '#lib/relations.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { compareHref, plural, vndbHref } from '#lib/util.ts';

	/**
	 * One relation stated by VNDB (ink register): solid badge, upright sentence,
	 * no meter and no evidence tags. VNDB states it; the tool does not
	 * second-guess it here.
	 */
	interface Props {
		relation: ExplicitRelationItem;
		focusId: string;
		focusName: string;
		focusOriginal?: string | null;
	}
	let { relation, focusId, focusName, focusOriginal = null }: Props = $props();
	const meta = $derived(EXPLICIT_META[relation.relation]);
	// The sentence follows the reader's name order, like the name above it.
	const sentence = $derived(
		meta.sentence(shownName(relation.name, relation.original), shownName(focusName, focusOriginal))
	);
</script>

<li class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-rule px-4 py-2 last:border-b-0">
	<RelationBadge kind={meta.kind} register="confirmed" label={meta.label} arrow={meta.arrow} title={sentence} />
	<span class="flex min-w-0 items-center gap-2">
		<ProducerShape type={relation.type} size={10} />
		<span class="min-w-0 text-sm font-medium">
			<NamePair name={relation.name} original={relation.original} lang={relation.lang} href="/producer/{relation.pid}" />
		</span>
	</span>
	<YearSpan from={relation.firstYear} to={relation.lastYear} class="text-2xs" />
	<StaffVnsButton
		count={relation.vnCount}
		label={plural(relation.vnCount, 'VN')}
		title={shownName(relation.name, relation.original)}
		subtitle="Visual novels"
		endpoint="/api/proof/producer-vns?pid={encodeURIComponent(relation.pid)}&role=all"
		moreHref="/producer/{relation.pid}#games"
		moreLabel="Open studio's games →"
		align="left"
		class="text-xs text-ink-3"
	/>
	<span class="ml-auto flex shrink-0 items-center gap-3 text-xs">
		<a class="link" href={compareHref(focusId, relation.pid)}>Compare</a>
		<a class="link inline-flex items-center gap-0.5 text-ink-3" href={vndbHref(relation.pid)} target="_blank" rel="noopener noreferrer">
			VNDB<ArrowUpRight size={10} />
		</a>
	</span>
</li>
