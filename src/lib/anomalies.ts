import { NormalizedRow, Anomaly } from '../types';

export function detectMissingColumns(missingColumns: string[]): Anomaly[] {
	if (!missingColumns || missingColumns.length === 0) return [];
	return [
		{
			type: 'missing_columns',
			message: `Missing required columns: ${missingColumns.join(', ')}`,
			severity: 'error',
		},
	];
}

export function detectDuplicateRows(rows: NormalizedRow[]): Anomaly[] {
	const seen = new Set<string>();
	const duplicates: Anomaly[] = [];
	for (const r of rows) {
		const key = [r.InputLength, r.OutputLength, r.BatchSize, r.CachePct].join('|');
		if (seen.has(key)) {
			duplicates.push({ type: 'duplicate_row', message: `Duplicate row detected for key ${key}`, severity: 'warning' });
		} else seen.add(key);
	}
	return duplicates;
}

export function detectNonNumeric(rows: NormalizedRow[]): Anomaly[] {
	const anomalies: Anomaly[] = [];
	rows.forEach((r, i) => {
		if (r.Throughput == null || isNaN(r.Throughput)) anomalies.push({ type: 'non_numeric', message: `Non-numeric or missing throughput at row ${i + 1}`, severity: 'warning' });
		if (r.TTFT == null || isNaN(r.TTFT)) anomalies.push({ type: 'non_numeric', message: `Non-numeric or missing TTFT at row ${i + 1}`, severity: 'warning' });
	});
	return anomalies;
}

export function detectThroughputDrops(rows: NormalizedRow[], threshold = 0.3): Anomaly[] {
	// threshold fractional drop between sorted batch sizes
	const anomalies: Anomaly[] = [];
	const byBatch = [...rows].sort((a, b) => a.BatchSize - b.BatchSize);
	for (let i = 1; i < byBatch.length; i++) {
		const prev = byBatch[i - 1].Throughput ?? 0;
		const cur = byBatch[i].Throughput ?? 0;
		if (prev > 0 && cur > 0) {
			const drop = (prev - cur) / prev;
			if (drop > threshold) {
				anomalies.push({ type: 'throughput_drop', message: `Throughput dropped ${(drop * 100).toFixed(0)}% between batch ${byBatch[i - 1].BatchSize} and ${byBatch[i].BatchSize}`, severity: 'warning' });
			}
		}
	}
	return anomalies;
}

export function detectTTFTSpikes(rows: NormalizedRow[], threshold = 0.5): Anomaly[] {
	const anomalies: Anomaly[] = [];
	const byBatch = [...rows].sort((a, b) => a.BatchSize - b.BatchSize);
	for (let i = 1; i < byBatch.length; i++) {
		const prev = byBatch[i - 1].TTFT ?? 0;
		const cur = byBatch[i].TTFT ?? 0;
		if (prev > 0 && cur > 0) {
			const inc = (cur - prev) / prev;
			if (inc > threshold) {
				anomalies.push({ type: 'ttft_spike', message: `TTFT increased ${(inc * 100).toFixed(0)}% between batch ${byBatch[i - 1].BatchSize} and ${byBatch[i].BatchSize}`, severity: 'warning' });
			}
		}
	}
	return anomalies;
}

export function detectAll(rows: NormalizedRow[], missingColumns: string[]) {
	const a = [] as Anomaly[];
	a.push(...detectMissingColumns(missingColumns));
	a.push(...detectDuplicateRows(rows));
	a.push(...detectNonNumeric(rows));
	a.push(...detectThroughputDrops(rows));
	a.push(...detectTTFTSpikes(rows));
	return a;
}
