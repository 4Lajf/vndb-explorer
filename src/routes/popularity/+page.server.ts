import type { PageServerLoad } from './$types';
import { getPopularityRankings } from '#lib/server/db.ts';

export const load: PageServerLoad = () => {
	return {
		rankings: getPopularityRankings()
	};
};
