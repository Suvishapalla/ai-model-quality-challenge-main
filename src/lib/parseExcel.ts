import * as XLSX from 'xlsx';
import { RawRow } from '../types';

// Parse an uploaded File (.xlsx) in-browser and return the raw rows from the
// sheet named 'Summary' (if present) or the first sheet.
export async function parseExcelFile(file: File): Promise<{ fileName: string; sheetName: string; rows: RawRow[] }> {
	const arrayBuffer = await file.arrayBuffer();
	const workbook = XLSX.read(arrayBuffer, { type: 'array' });

	let sheetName = 'Summary';
	if (!workbook.SheetNames.includes('Summary')) {
		sheetName = workbook.SheetNames[0];
	}

	const worksheet = workbook.Sheets[sheetName];

	// Read sheet as rows-of-arrays to detect which row contains the real headers.
	const dataRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

	// Candidate keywords to search for in header row (normalized)
	const headerKeywords = [
		'input',
		'output',
		'cache',
		'batch',
		'throughput',
		'throughput / box',
		'per box',
		'uncached',
		'cached',
		'ttft',
		'gen',
		'rpm',
		'max number',
		'milliseconds',
	];

	const normalizeCell = (c: any) => (c == null ? '' : String(c).trim().toLowerCase());

	// scan first N rows for the row with the most keyword matches
	const scanRows = Math.min(20, dataRows.length);
	let bestRowIdx = 0;
	let bestScore = 0;
	for (let i = 0; i < scanRows; i++) {
		const row = dataRows[i] || [];
		let score = 0;
		for (const cell of row) {
			const s = normalizeCell(cell);
			for (const kw of headerKeywords) if (s.includes(kw)) { score++; break; }
		}
		if (score > bestScore) {
			bestScore = score;
			bestRowIdx = i;
		}
	}

	// If bestScore is zero, fall back to first non-empty row
	if (bestScore === 0) {
		for (let i = 0; i < scanRows; i++) {
			const row = dataRows[i] || [];
			if (row.some((c) => normalizeCell(c) !== '')) { bestRowIdx = i; break; }
		}
	}

	// Build header labels from chosen header row (use string values or fallback names)
	const headerRow = dataRows[bestRowIdx] || [];
	const headers = headerRow.map((h: any, idx: number) => {
		if (h == null || String(h).trim() === '') return `col_${idx}`;
		return String(h).trim();
	});

	// Use sheet_to_json with explicit headers and range starting AFTER the header row
	// When passing an explicit `header` array, `range` should start at the first data row (header row + 1)
	const range = bestRowIdx + 1;
	// include blank rows so we don't inadvertently drop rows in sheets with intermittent empty lines
	const rows: RawRow[] = XLSX.utils.sheet_to_json(worksheet, { header: headers, range, defval: null, blankrows: true });

	return { fileName: file.name, sheetName, rows };
}

// Utility to try to extract model and profile from filename patterns.
export function detectModelAndProfile(fileName: string): { model: string; profile: string } {
	// Examples: "Model_A_profile_1.xlsx", "Model A profile 1.xlsx", "Model L profile 7.xlsx", "ModelB_profile_2.xlsx"
	const base = fileName.replace(/\.xlsx?$/i, '');

	// Try common patterns
	const rx1 = /Model[_ ]?([A-Za-z0-9-]+)[_ ]*profile[_ ]*(\d+)/i;
	const rx2 = /([A-Za-z0-9]+)[_ ]*profile[_ ]*(\d+)/i;
	const rx3 = /Model[_ ]?([A-Za-z0-9-]+)/i;

	let model = 'Unknown';
	let profile = 'profile_unknown';

	let m = base.match(rx1);
	if (m) {
		model = `Model ${m[1]}`;
		profile = `profile_${m[2]}`;
		return { model, profile };
	}

	m = base.match(rx2);
	if (m) {
		model = m[1].startsWith('Model') ? m[1] : `Model ${m[1]}`;
		profile = `profile_${m[2]}`;
		return { model, profile };
	}

	m = base.match(rx3);
	if (m) {
		model = `Model ${m[1]}`;
		return { model, profile };
	}

	// fallback: try to parse words like "Model A profile 1"
	const rxWords = /Model\s+([A-Za-z0-9-]+).*profile\s*(\d+)/i;
	m = base.match(rxWords);
	if (m) {
		model = `Model ${m[1]}`;
		profile = `profile_${m[2]}`;
	}

	return { model, profile };
}
