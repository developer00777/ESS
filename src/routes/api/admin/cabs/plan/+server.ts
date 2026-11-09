import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCap } from '$lib/server/capabilities';
import { planFromUpload } from '$lib/server/cab-request';

export const POST: RequestHandler = async (event) => {
	requireCap(event, 'cabs.plan');
	const result = await planFromUpload(await event.request.formData());
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
