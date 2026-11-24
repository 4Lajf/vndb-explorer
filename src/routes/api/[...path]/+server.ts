import type { RequestHandler } from './$types';
import { api } from '#lib/server/api.ts';

const handle: RequestHandler = ({ request }) => api.fetch(request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
