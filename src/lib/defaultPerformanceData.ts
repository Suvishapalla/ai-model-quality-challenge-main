import { ParsedFile } from '../types';
import { parseExcelFile, detectModelAndProfile } from './parseExcel';
import { normalizeRows, guessWorkloadLabel } from './normalize';

const DEFAULT_MODEL_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const DEFAULT_PROFILE_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

export const DEFAULT_PERFORMANCE_FILE_NAMES = DEFAULT_MODEL_NAMES.flatMap((modelName) =>
	DEFAULT_PROFILE_NUMBERS.map((profileNumber) => `Model ${modelName} profile ${profileNumber}.xlsx`)
);

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
