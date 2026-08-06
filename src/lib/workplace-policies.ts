/**
 * Company-wide workplace policies — the same for every employee, so unlike the
 * holiday calendar and leave types these are static content rather than
 * per-shift-group rows resolved from the database.
 *
 * Source: Workplace Policies circulated 06 Aug 2026, plus the SOP for Attendance,
 * Comp-Off & Attendance Deviations. The SOP's thresholds are duplicated in
 * $lib/server/comp-off.ts, which enforces them — keep the two in step.
 */
export interface WorkplacePolicy {
	id: string;
	icon: string;
	title: string;
	rules: string[];
}

export const WORKPLACE_POLICY_INTRO =
	'Discipline, professionalism, and accountability are the foundation of excellence.';

export const WORKPLACE_POLICIES: WorkplacePolicy[] = [
	{
		id: 'dress-code',
		icon: '👔',
		title: 'Dress Code Policy',
		rules: [
			'Monday to Wednesday: Formal Wear.',
			'Thursday: Semi-Formal Wear.',
			'Friday: Smart Casual Wear.',
			'Maintain a neat, clean, and professional appearance at all times.'
		]
	},
	{
		id: 'id-card',
		icon: '🪪',
		title: 'ID Card Policy',
		rules: [
			'Wearing your ID card is mandatory while on the office premises.',
			'Ensure your ID card is visible throughout working hours.'
		]
	},
	{
		id: 'attendance-punctuality',
		icon: '⏰',
		title: 'Attendance & Punctuality Policy',
		rules: [
			'Adhere to your assigned shift timings.',
			'Maintain punctual login and logout.',
			'Avoid late logins, early logouts, and unplanned absenteeism.',
			'Inform your Reporting Manager immediately in case of any delay.'
		]
	},
	{
		id: 'productivity-conduct',
		icon: '💻',
		title: 'Productivity & Workplace Conduct Policy',
		rules: [
			'Working hours are strictly meant for productive work.',
			'Personal mobile phone usage is not permitted during working hours unless it is required for official work.',
			'Avoid unnecessary social media and non-work-related screen time.',
			'Maintain a clean and organized workspace.',
			'Complete assigned tasks within the expected timelines.',
			'Maintain professionalism, accountability, and focus throughout the workday.'
		]
	},
	{
		id: 'prohance-biometric',
		icon: '📊',
		title: 'ProHance & Biometric Policy',
		rules: [
			'Maintain a minimum of 7+ productive hours in ProHance every working day.',
			'Complete 9 hours of Biometric Attendance as per company policy.',
			'Ensure your ProHance activity accurately reflects your work.'
		]
	},
	{
		id: 'leave-attendance',
		icon: '📧',
		title: 'Leave & Attendance Policy',
		rules: [
			'Obtain approval from your Reporting Manager before applying for leave.',
			'Inform your manager and team in advance.',
			'Ensure proper task handover before proceeding on leave.',
			'Send all leave and attendance-related emails to attendance@championsmail.com.',
			'In case of an emergency, notify your Reporting Manager and team immediately, followed by the attendance email.'
		]
	},
	{
		id: 'comp-off',
		icon: '🔁',
		title: 'Comp-Off Policy',
		rules: [
			'Complete 7 or more working hours on an eligible holiday or weekend to earn one Comp-Off.',
			'You must have full attendance on the eligible working day.',
			'Use your Comp-Off within 3 months from the date it is earned.',
			'Comp-Off cannot be encashed, and it lapses automatically if it is not used within the validity period.',
			'HR verifies your attendance record and confirms the 7+ hours before crediting the Comp-Off to the leave portal.',
			'Manager approval is obtained where applicable, and HR maintains a monthly Comp-Off tracker.'
		]
	},
	{
		id: 'attendance-deviation',
		icon: '🛠️',
		title: 'Attendance Deviation Policy',
		rules: [
			'An attendance deviation is when your attendance is not captured correctly — a missing biometric punch, a missing login/logout record, a mismatch between systems, or a system/technical issue.',
			'You may submit a maximum of 3 attendance deviation requests per month for missing biometric records.',
			'Any request beyond that limit requires approval from both HR and your Reporting Manager.',
			'Raise deviations from Attendance → Raise attendance deviation; each request is checked against your attendance and ProHance records before HR reviews it.'
		]
	},
	{
		id: 'attendance-correction',
		icon: '📝',
		title: 'Half-Day / Wrong Attendance Capture',
		rules: [
			'If the portal incorrectly marks you Half Day or Absent, or records incorrect working hours, raise an attendance correction request.',
			'Submit supporting evidence with your request — a login screenshot, manager confirmation, or similar.',
			'HR verifies the request and corrects your attendance upon approval.',
			'Correction requests can be raised for: login not captured, logout not captured, missing biometric punch, biometric and system login mismatch, ProHance activity mismatch, system/server issues, machine malfunction, and technical errors affecting attendance.'
		]
	},
	{
		id: 'professional-conduct',
		icon: '🤝',
		title: 'Professional Conduct Policy',
		rules: [
			'Treat everyone with respect and professionalism.',
			'Maintain professional communication with colleagues and stakeholders.',
			'Support your teammates and foster a collaborative work environment.',
			'Take ownership and accountability for your responsibilities.',
			'Follow all company policies and maintain confidentiality of company information.'
		]
	},
	{
		id: 'learning-growth',
		icon: '🌱',
		title: 'Learning & Growth Policy',
		rules: [
			'Be ambitious and committed to continuous learning.',
			'Welcome feedback and strive for continuous improvement.',
			'Take initiative and contribute beyond your assigned responsibilities.',
			'Demonstrate a positive attitude, accountability, and a growth mindset.',
			'Strive for excellence in everything you do.'
		]
	}
];
