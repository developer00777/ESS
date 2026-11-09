import type { RequestHandler } from './$types';
import { requireCap } from '$lib/server/capabilities';
import { planFromUpload } from '$lib/server/cab-request';
import { buildRosterWorkbook } from '$lib/server/cab-workbooks';

export const POST: RequestHandler = async (event) => {
	requireCap(event, 'cabs.plan');
	const { plan } = await planFromUpload(await event.request.formData());
	const body = await buildRosterWorkbook(plan);
	const name = `cab-roster-${plan.date ?? 'any-day'}.xlsx`;
	return new Response(new Uint8Array(body), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${name}"`,
			'Cache-Control': 'no-store'
		}
	});
};
