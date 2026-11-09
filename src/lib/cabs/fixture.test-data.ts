import { DEFAULT_SETTINGS, type Cab, type PlannerSettings, type Rider } from './types';

export const OFFICE = { lat: 17.4474, lng: 78.3762 };

export const SETTINGS: PlannerSettings = { ...DEFAULT_SETTINGS, office: OFFICE };

let row = 1;
export function rider(name: string, team: string, dropTime: string, lat: number, lng: number): Rider {
	row++;
	return {
		id: `r${row}`,
		empCode: `E${row}`,
		name,
		team,
		dropTime,
		pin: { lat, lng },
		pinIssue: null,
		notes: '',
		sourceRow: row,
		oneOff: null
	};
}

export function cab(label: string, seats: number, guard: boolean): Cab {
	return { id: label.toLowerCase().replace(/\s+/g, '-'), label, seats, driver: `${label} driver`, guard, sourceRow: 0 };
}

export const BRIEF_RIDERS: Rider[] = [
	rider('Asha', 'Sales', '16:00', 17.4933, 78.3915),
	rider('Bhavna', 'Sales', '16:00', 17.4948, 78.3996),
	rider('Chitra', 'Sales', '16:00', 17.4401, 78.3489),
	rider('Divya', 'Data', '21:00', 17.4239, 78.4108),
	rider('Esha', 'Data', '21:00', 17.4271, 78.4152),
	rider('Farah', 'Support', '23:00', 17.4590, 78.3680),
	rider('Gita', 'Ops', '00:00', 17.4965, 78.3550),
	rider('Hema', 'Ops', '00:00', 17.4980, 78.3602),
	rider('Indu', 'Support', '00:00', 17.4851, 78.4124),
	rider('Jaya', 'Content', '00:00', 17.4870, 78.4180),
	rider('Kavya', 'Content', '00:00', 17.4162, 78.3446),
	rider('Lata', 'Data', '00:00', 17.4122, 78.3400),
	rider('Meera', 'US Desk', '03:30', 17.4700, 78.3560),
	rider('Nisha', 'US Desk', '03:30', 17.4725, 78.3601),
	rider('Uma', 'US Desk', '04:00', 17.4760, 78.3630)
];

export const BRIEF_CABS: Cab[] = [
	cab('Cab 1', 4, true),
	cab('Cab 2', 4, true),
	cab('Cab 3', 4, true),
	cab('Cab 4', 4, false),
	cab('Cab 5', 6, true),
	cab('Cab 6', 4, false)
];
