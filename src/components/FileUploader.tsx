import React from 'react';
import { parseExcelFile, detectModelAndProfile } from '../lib/parseExcel';
import { normalizeRows, guessWorkloadLabel } from '../lib/normalize';
import { ParsedFile } from '../types';

interface Props {
	onUpload: (files: ParsedFile[]) => void;
}

export const FileUploader: React.FC<Props> = ({ onUpload }) => {
	const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files || files.length === 0) return;

		const parsed: ParsedFile[] = [];
		for (let i = 0; i < files.length; i++) {
			try {
				const f = files[i];
				const { fileName, rows } = await parseExcelFile(f);
				const { model, profile } = detectModelAndProfile(fileName);
				const { rows: normRows, missingColumns } = normalizeRows(rows);
				// try to extract numeric profile index
				const profileNumberMatch = (profile || '').match(/(\d+)/);
				const profileNumber = profileNumberMatch ? Number(profileNumberMatch[1]) : undefined;
				const workloadLabel = guessWorkloadLabel(normRows) || undefined;

				// attach model/profile metadata to each normalized row for consistent CSV/JSON schema
				const enrichedRows = normRows.map((r) => ({
					...r,
					modelName: model,
					profileName: profile,
					profileNumber,
					workloadLabel,
				}));

				const uniqueId = `${fileName}::${Date.now()}::${i}`;
				parsed.push({ id: uniqueId, fileName, model, profile, profileNumber, workloadLabel, rowsRaw: rows, rows: enrichedRows, missingColumns });

				// Report partial progress so the UI (charts) can update progressively when many files are uploaded
				onUpload(parsed.slice());
				// yield to the event loop briefly to keep the UI responsive for large batches
				await new Promise((res) => setTimeout(res, 0));
			} catch (err) {
				// continue parsing other files
				console.error('Failed to parse', files[i]?.name, err);
			}
		}
		// final update (in case nothing was parsed in-loop)
		onUpload(parsed.slice());
	};

	return (
		<div style={{ padding: 8 }}>
			<label style={{ display: 'inline-block', marginBottom: 6 }}>
				Upload .xlsx perf sweep(s):
			</label>
			<input type="file" accept=".xlsx,.xls" multiple onChange={handle} />
		</div>
	);
};

export default FileUploader;
