import type { RequestHandler } from './$types';
import { requireCap } from '$lib/server/capabilities';
import { buildCabTemplate } from '$lib/server/cab-workbooks';

export const GET: RequestHandler = async (event) => {
	requireCap(event, 'cabs.plan');
	const body = await buildCabTemplate();
	return new Response(new Uint8Array(body), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="cab-planner-template.xlsx"'
		}
	});
};
