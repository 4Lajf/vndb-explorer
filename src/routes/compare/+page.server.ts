import type { PageServerLoad } from './$types';
import {
	compareBrands,
	discoverBrands,
	getBrandNeighbours,
	getProducerSummary
} from '#lib/server/db.ts';

export const load: PageServerLoad = ({ url }) => {
	// VNDB ids are lower-case: `?a=P24` is the same brand as `?a=p24`.
	const a = url.searchParams.get('a')?.trim().toLowerCase() || '';
	const b = url.searchParams.get('b')?.trim().toLowerCase() || '';
	const comparison = a && b ? compareBrands(a, b) : null;
	const suggestedPairs = discoverBrands({
		explicitStatus: 'unlinked',
		producerType: 'co',
		minConfidence: 0.65,
		limit: 8
	}).items;

	// Picker identities, so a half-filled or invalid pair still shows what was chosen.
	const pickedA = a ? getProducerSummary(a) : null;
	const pickedB = b ? getProducerSummary(b) : null;
	// With exactly one valid slot, offer that brand's strongest neighbours for the other.
	const single = pickedA && !pickedB ? pickedA : pickedB && !pickedA ? pickedB : null;
	const neighbours = single ? getBrandNeighbours(single.id, 10) : [];

	return {
		a,
		b,
		comparison,
		suggestedPairs,
		pickedA,
		pickedB,
		neighbours
	};
};
