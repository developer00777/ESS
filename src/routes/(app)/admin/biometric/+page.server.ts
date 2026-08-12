import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { attendanceImports, users } from '$lib/server/db/schema';
import { desc, eq, isNotNull } from 'drizzle-orm';

/**
 * Manual biometric report upload — Super Admin and Admin (HR).
 *
 * The device's own scheduled export already posts to
 * /api/attendance/easytime-import; this screen is for the days that never
 * arrived, when HR has the machine's report as a spreadsheet and needs it in the
 * portal. Listing past manual uploads here makes a re-upload obvious rather than
 * something to guess at.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.user?.role;
	if (role !== 'super_admin' && role !== 'admin') {
		throw redirect(303, '/dashboard');
	}

	// Manual uploads only — the device job's imports carry a token instead of an
	// uploader, and they have their own volume.
	const recentUploads = await db
		.select({
			id: attendanceImports.id,
			filename: attendanceImports.filename,
			rowCount: attendanceImports.rowCount,
			matchedCount: attendanceImports.matchedCount,
			unmatchedCount: attendanceImports.unmatchedCount,
			createdAt: attendanceImports.createdAt,
			uploadedByName: users.fullName
		})
		.from(attendanceImports)
		.leftJoin(users, eq(attendanceImports.uploadedBy, users.id))
		.where(isNotNull(attendanceImports.uploadedBy))
		.orderBy(desc(attendanceImports.createdAt))
		.limit(15);

	return { recentUploads };
};
