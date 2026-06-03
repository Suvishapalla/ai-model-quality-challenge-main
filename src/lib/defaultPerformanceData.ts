import { ParsedFile } from '../types';
import { parseExcelFile, detectModelAndProfile } from './parseExcel';
import { normalizeRows, guessWorkloadLabel } from './normalize';

export const DEFAULT_PERFORMANCE_FILE_NAMES = [
	'Model A profile 1.xlsx',
	'Model B profile 1.xlsx',
	'Model C profile 1.xlsx',
	'Model D profile 1.xlsx',
	'Model E profile 1.xlsx',
	'Model F profile 1.xlsx',
	'Model G profile 1.xlsx',
	'Model H profile 1.xlsx',
	'Model I profile 1.xlsx',
	'Model J profile 1.xlsx',
	'Model K profile 1.xlsx',
];

function defaultFileUrl(fileName: string) {
	return `/default-perf-data/${encodeURIComponent(fileName)}`;
}

async function loadDefaultFile(fileName: string): Promise<ParsedFile> {
	const response = await fetch(defaultFileUrl(fileName));
	if (!response.ok) {
		throw new Error(`Failed to load ${fileName}: ${response.status} ${response.statusText}`);
	}

	const blob = await response.blob();
	const file = new File([blob], fileName, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	const { rows } = await parseExcelFile(file);
	const { model, profile } = detectModelAndProfile(fileName);
	const { rows: normRows, missingColumns } = normalizeRows(rows);
	const profileNumberMatch = (profile || '').match(/(\d+)/);
	const profileNumber = profileNumberMatch ? Number(profileNumberMatch[1]) : undefined;
	const workloadLabel = guessWorkloadLabel(normRows) || undefined;
	const enrichedRows = normRows.map((row) => ({
		...row,
		modelName: model,
		profileName: profile,
		profileNumber,
		workloadLabel,
	}));

	return {
		id: `default::${fileName}`,
		fileName,
		model,
		profile,
		profileNumber,
		workloadLabel,
		rowsRaw: rows,
		rows: enrichedRows,
		missingColumns,
	};
}

export async function loadDefaultPerformanceFiles(): Promise<ParsedFile[]> {
	return Promise.all(DEFAULT_PERFORMANCE_FILE_NAMES.map(loadDefaultFile));
}
