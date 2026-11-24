import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getVnDetail } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ params }) => {
	const data = getVnDetail(params.id);
	if (!data) throw error(404, `Visual novel ${params.id} not found`);
	return data;
};
