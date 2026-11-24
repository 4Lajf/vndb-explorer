import type { PageServerLoad } from './$types';
import { discoverAliases, finiteNumber, parseAliasPair } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ url }) => {
	const catParam = url.searchParams.get('category') || 'all';
	const category =
		catParam === 'seiyuu' || catParam === 'staff' || catParam === 'mixed' ? catParam : 'all';
	const tierParam = url.searchParams.get('tier') || 'all';
	const tier =
		tierParam === 'high' || tierParam === 'medium' || tierParam === 'speculative'
			? tierParam
			: 'all';
	const sigParam = url.searchParams.get('signal') || 'all';
	const signal =
		sigParam === 'shared_chars' ||
		sigParam === 'shared_extlinks' ||
		sigParam === 'bio_crossref' ||
		sigParam === 'name_match'
			? sigParam
			: 'all';
	const q = url.searchParams.get('q') || '';
	const page = Math.max(1, Math.trunc(finiteNumber(url.searchParams.get('page'), 1)));
	// `?pair=s1-s2` narrows the page to one candidate pair and opens its comparison.
	const parsedPair = parseAliasPair(url.searchParams.get('pair'));
	const pair = parsedPair ? `${parsedPair[0]}-${parsedPair[1]}` : '';

	const result = discoverAliases({
		category,
		tier,
		signal,
		q,
		pair,
		page,
		limit: 30
	});

	return {
		filters: { category, tier, signal, q, pair, page },
		result
	};
};
