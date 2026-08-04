/**
 * Length of service, from the joining date to today.
 *
 * Counted in whole calendar months rather than by dividing elapsed
 * milliseconds, so month lengths and leap years can't drift the answer: someone
 * who joined on the 15th completes another month on the 15th, every time.
 */
export function tenureFrom(
	joiningDate: string | Date | null | undefined,
	now: Date = new Date()
): string | null {
	if (!joiningDate) return null;

	const start =
		joiningDate instanceof Date ? joiningDate : new Date(`${String(joiningDate).slice(0, 10)}T00:00:00`);
	if (Number.isNaN(start.getTime())) return null;

	// The HR sheet carries future joining dates for people who haven't started
	// yet — reporting "0 days" would read as a data error rather than a start
	// date that hasn't arrived.
	if (start > now) return 'Not started yet';

	let months =
		(now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
	// Not a full month until the day-of-month is reached.
	if (now.getDate() < start.getDate()) months -= 1;
	if (months < 0) months = 0;

	const years = Math.floor(months / 12);
	const remainingMonths = months % 12;

	if (years === 0 && remainingMonths === 0) {
		const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
		if (days <= 0) return 'Joined today';
		return `${days} ${days === 1 ? 'day' : 'days'}`;
	}

	const parts: string[] = [];
	if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
	if (remainingMonths > 0) parts.push(`${remainingMonths} ${remainingMonths === 1 ? 'mo' : 'mos'}`);
	return parts.join(' ');
}
