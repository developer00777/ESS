/**
 * Company-wide workplace policies — the same for every employee, so unlike the
 * holiday calendar and leave types these are static content rather than
 * per-shift-group rows resolved from the database.
 *
 * Source: Workplace Policies circulated 06 Aug 2026.
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
