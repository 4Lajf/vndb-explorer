import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
	compareBrands,
	discoverAliases,
	discoverBrands,
	finiteNumber,
	getAliasPairProof,
	getBrandNeighbours,
	getBrandPairProof,
	getCollabVnsProof,
	getCorpusStats,
	getHomeHighlights,
	getLandscapeGraph,
	getPopularityRankings,
	getProducerDetail,
	getProducerSummary,
	getProducerVnsProof,
	getStaffBrandsProof,
	getStaffDetail,
	getStaffVnsProof,
	getVnDetail,
	searchAll
} from './db.ts';

export const api = new Hono().basePath('/api');

// Every response from this router is JSON, errors included: a client that
// parses the body must never be handed Hono's plain-text 404 or 500.
api.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

api.onError((err, c) => {
	if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
	console.error(`[api] ${c.req.method} ${c.req.path}`, err);
	return c.json({ error: 'Internal server error' }, 500);
});

api.get('/health', (c) => {
	try {
		const stats = getCorpusStats();
		return c.json({ ok: true, dumpDate: stats.dumpTimestamp });
	} catch (err) {
		console.error('[api] /health database check failed', err);
		return c.json({ ok: false, error: 'Database unavailable' }, 503);
	}
});

api.get('/stats', (c) => c.json(getCorpusStats()));

api.get('/home', (c) => c.json(getHomeHighlights()));

api.get('/popularity', (c) => c.json(getPopularityRankings()));

api.get('/search', (c) => {
	const q = c.req.query('q') || '';
	const kindParam = c.req.query('kind') || 'all';
	const kind =
		kindParam === 'producer' || kindParam === 'staff' || kindParam === 'vn' ? kindParam : 'all';
	const limit = finiteNumber(c.req.query('limit'), 20);
	return c.json({ query: q, results: searchAll(q, kind, limit) });
});

api.get('/producers/:id', (c) => {
	const id = c.req.param('id');
	const includeSeiyuu = c.req.query('includeSeiyuu') === '1' || c.req.query('includeSeiyuu') === 'true';
	const data = getProducerDetail(id, includeSeiyuu);
	if (!data) return c.json({ error: 'Producer not found' }, 404);
	return c.json(data);
});

api.get('/producers/:id/neighbours', (c) => {
	const id = c.req.param('id');
	if (!getProducerSummary(id)) return c.json({ error: 'Producer not found' }, 404);
	const limit = finiteNumber(c.req.query('limit'), 8);
	return c.json({ id, items: getBrandNeighbours(id, limit) });
});

api.get('/staff/:id', (c) => {
	const id = c.req.param('id');
	const data = getStaffDetail(id);
	if (!data) return c.json({ error: 'Staff not found' }, 404);
	return c.json(data);
});

api.get('/compare', (c) => {
	const a = c.req.query('a') || '';
	const b = c.req.query('b') || '';
	if (!a || !b) return c.json({ error: 'Provide both ?a=p... and ?b=p...' }, 400);
	const data = compareBrands(a, b);
	if (!data) return c.json({ error: 'One or both producers not found' }, 404);
	return c.json(data);
});

api.get('/discover/brands', (c) => {
	const explicitStatus = c.req.query('explicitStatus');
	const sort = c.req.query('sort');
	const data = discoverBrands({
		inferredType: c.req.query('inferredType') || 'all',
		explicitStatus:
			explicitStatus === 'unlinked' ||
			explicitStatus === 'twohop' ||
			explicitStatus === 'explicit' ||
			explicitStatus === 'all'
				? explicitStatus
				: 'unlinked',
		producerType: c.req.query('producerType') || 'co',
		lang: c.req.query('lang') || 'all',
		minConfidence: finiteNumber(c.req.query('minConfidence'), 0),
		includeSeiyuu: c.req.query('includeSeiyuu') === '1' || c.req.query('includeSeiyuu') === 'true',
		sort:
			sort === 'confidence' ||
			sort === 'shared_core' ||
			sort === 'containment' ||
			sort === 'seiyuu'
				? sort
				: 'confidence',
		q: c.req.query('q') || '',
		page: finiteNumber(c.req.query('page'), 1),
		limit: finiteNumber(c.req.query('limit'), 30)
	});
	return c.json(data);
});

api.get('/discover/aliases', (c) => {
	const category = c.req.query('category');
	const tier = c.req.query('tier');
	const signal = c.req.query('signal');
	const data = discoverAliases({
		category:
			category === 'seiyuu' || category === 'staff' || category === 'mixed' ? category : 'all',
		tier: tier === 'high' || tier === 'medium' || tier === 'speculative' ? tier : 'all',
		signal:
			signal === 'shared_chars' ||
			signal === 'shared_extlinks' ||
			signal === 'bio_crossref' ||
			signal === 'name_match'
				? signal
				: 'all',
		q: c.req.query('q') || '',
		pair: c.req.query('pair') || '',
		page: finiteNumber(c.req.query('page'), 1),
		limit: finiteNumber(c.req.query('limit'), 30)
	});
	return c.json(data);
});

api.get('/vns/:id', (c) => {
	const id = c.req.param('id');
	const data = getVnDetail(id);
	if (!data) return c.json({ error: 'VN not found' }, 404);
	return c.json(data);
});

api.get('/proof/brand-pair', (c) => {
	const a = c.req.query('a') || '';
	const b = c.req.query('b') || '';
	const type = c.req.query('type') || '';
	if (!a || !b || !type) return c.json({ error: 'Provide ?a=p...&b=p...&type=...' }, 400);
	const data = getBrandPairProof(a, b, type);
	if (!data) return c.json({ error: 'Proof type not found' }, 404);
	return c.json(data);
});

api.get('/proof/alias-pair', (c) => {
	const a = c.req.query('a') || '';
	const b = c.req.query('b') || '';
	const type = c.req.query('type') || '';
	if (!a || !b || !type) return c.json({ error: 'Provide ?a=s...&b=s...&type=...' }, 400);
	const data = getAliasPairProof(a, b, type);
	if (!data) return c.json({ error: 'Proof type not found' }, 404);
	return c.json(data);
});

api.get('/proof/staff-brands', (c) => {
	const sid = c.req.query('sid') || '';
	if (!sid) return c.json({ error: 'Provide ?sid=s...' }, 400);
	return c.json(getStaffBrandsProof(sid));
});

api.get('/proof/staff-vns', (c) => {
	const sid = c.req.query('sid') || '';
	const pid = c.req.query('pid') || null;
	const rawMode = c.req.query('mode') || 'all';
	const mode = rawMode === 'dev' || rawMode === 'seiyuu' ? rawMode : 'all';
	if (!sid) return c.json({ error: 'Provide ?sid=s...' }, 400);
	const data = getStaffVnsProof(sid, pid, mode);
	if (!data) return c.json({ error: 'Staff not found' }, 404);
	return c.json(data);
});

api.get('/proof/collab-vns', (c) => {
	const a = c.req.query('a') || '';
	const b = c.req.query('b') || '';
	const kind = c.req.query('kind') === 'seiyuu' ? 'seiyuu' : 'staff';
	if (!a || !b) return c.json({ error: 'Provide ?a=s...&b=s...' }, 400);
	return c.json(getCollabVnsProof(a, b, kind));
});

api.get('/proof/producer-vns', (c) => {
	const pid = c.req.query('pid') || '';
	const role = c.req.query('role') === 'all' ? 'all' : 'dev';
	if (!pid) return c.json({ error: 'Provide ?pid=p...' }, 400);
	const data = getProducerVnsProof(pid, role);
	if (!data) return c.json({ error: 'Producer not found' }, 404);
	return c.json(data);
});

api.get('/landscape', (c) => {
	const producerType = c.req.query('producerType') === 'all' ? 'all' : 'co';
	const lang = c.req.query('lang') || 'all';
	const minConfidence = finiteNumber(c.req.query('minConfidence'), 0.55);
	const includeExplicit = c.req.query('explicit') !== '0';
	const includeInferred = c.req.query('inferred') !== '0';
	return c.json(
		getLandscapeGraph({
			producerType,
			lang,
			minConfidence,
			includeExplicit,
			includeInferred
		})
	);
});
