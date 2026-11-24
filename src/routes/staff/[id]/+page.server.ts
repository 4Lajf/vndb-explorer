import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStaffDetail } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ params }) => {
	const data = getStaffDetail(params.id);
	if (!data) throw error(404, `Staff ${params.id} not found`);
	return data;
};
