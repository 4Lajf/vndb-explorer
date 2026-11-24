import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { discoverBrands, finiteNumber, getCorpusStats } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ url }) => {
	// Legacy drawer links (`?open=pA-pB`) now resolve directly to the full Compare page.
	const openParam = url.searchParams.get('open')?.trim().toLowerCase();
	if (openParam && /^p\d+-p\d+$/.test(openParam)) {
		const [a, b] = openParam.split('-');
		redirect(302, `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
	}

	const inferredType = url.searchParams.get('inferredType') || 'all';
	const explicitStatusParam = url.searchParams.get('explicitStatus') || 'unlinked';
	const explicitStatus =
		explicitStatusParam === 'unlinked' ||
		explicitStatusParam === 'twohop' ||
		explicitStatusParam === 'explicit' ||
		explicitStatusParam === 'all'
			? explicitStatusParam
			: 'unlinked';
	const producerType = url.searchParams.get('producerType') || 'co';
	const lang = url.searchParams.get('lang') || 'all';
	const minConfidence = Math.min(
		1,
		Math.max(0, finiteNumber(url.searchParams.get('minConfidence'), 0.45))
	);
	const includeSeiyuu = url.searchParams.get('includeSeiyuu') === '1';
	const sortParam = url.searchParams.get('sort') || 'confidence';
	const sort =
		sortParam === 'confidence' ||
		sortParam === 'shared_core' ||
		sortParam === 'containment' ||
		sortParam === 'seiyuu'
			? sortParam
			: 'confidence';
	const q = url.searchParams.get('q') || '';
	const page = Math.max(1, Math.trunc(finiteNumber(url.searchParams.get('page'), 1)));

	const result = discoverBrands({
		inferredType,
		explicitStatus,
		producerType,
		lang,
		minConfidence,
		includeSeiyuu,
		sort,
		q,
		page,
		limit: 30
	});

	return {
		filters: {
			inferredType,
			explicitStatus,
			producerType,
			lang,
			minConfidence,
			includeSeiyuu,
			sort,
			q,
			page
		},
		result,
		/** Every pair with no VNDB relation at all: the figure Home quotes. */
		unlinkedTotal: getCorpusStats().unlinkedInferredBrandLinks
	};
};
