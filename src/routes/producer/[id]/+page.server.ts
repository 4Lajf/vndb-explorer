import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProducerDetail } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ params, url }) => {
	const includeSeiyuu = url.searchParams.get('includeSeiyuu') === '1';
	const data = getProducerDetail(params.id, includeSeiyuu);
	if (!data) throw error(404, `Producer ${params.id} not found`);
	return { ...data, includeSeiyuu };
};
