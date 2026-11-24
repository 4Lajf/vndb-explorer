import type { LayoutServerLoad } from './$types';
import { finiteNumber, getCorpusStats, getDumpYear, getLandscapeGraph } from '#lib/server/db.ts';
import { dumpDate } from '#lib/util.ts';

export const load: LayoutServerLoad = ({ url }) => {
	const { dumpTimestamp } = getCorpusStats();
	const onAtlas = url.pathname === '/';
	const producerType: 'co' | 'all' =
		onAtlas && url.searchParams.get('producerType') === 'all' ? 'all' : 'co';
	const lang = onAtlas ? url.searchParams.get('lang') || 'all' : 'all';
	const minConfidence = onAtlas
		? Math.min(1, Math.max(0.45, finiteNumber(url.searchParams.get('minConfidence'), 0.55)))
		: 0.55;

	const graph = getLandscapeGraph({
		producerType,
		lang,
		minConfidence,
		includeExplicit: true,
		includeInferred: true
	});

	return {
		dumpTimestamp,
		dumpDate: dumpDate(dumpTimestamp),
		dumpYear: getDumpYear(),
		atlas: {
			graph,
			filters: { producerType, lang, minConfidence }
		}
	};
};
