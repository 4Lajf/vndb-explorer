import type { PageServerLoad } from './$types';
import { getHomeHighlights } from '#lib/server/db.ts';

export const load: PageServerLoad = () => {
	return getHomeHighlights();
};
