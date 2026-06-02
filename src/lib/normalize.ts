import { RawRow, NormalizedRow } from '../types';
import { computeMedian } from '../utils/format';

const canonicalMap: Record<string, string> = {
	// precise throughput mappings
	// main throughput
	'throughput (t/s)': 'Throughput',
	'throughput': 'Throughput',
	// per-box / per-hardware variants (longer names to be matched first)
	'throughput / box (t/s/hardware)': 'ThroughputPerBox',
	'throughput/box (t/s/hardware)': 'ThroughputPerBox',
	'throughput per box (t/s/hardware)': 'ThroughputPerBox',
	'throughput / box': 'ThroughputPerBox',
	'throughput/box': 'ThroughputPerBox',
	'throughput per box': 'ThroughputPerBox',

	// uncached
	'uncached throughput (t/s)': 'UncachedThroughput',
	'uncached throughput': 'UncachedThroughput',
	'uncached throughput / box (t/s/hardware)': 'UncachedThroughputPerBox',
	'uncached throughput/box (t/s/hardware)': 'UncachedThroughputPerBox',
	'uncached throughput per box (t/s/hardware)': 'UncachedThroughputPerBox',
	'uncached throughput / box': 'UncachedThroughputPerBox',
	'uncached throughput/box': 'UncachedThroughputPerBox',
	'uncached throughput per box': 'UncachedThroughputPerBox',

	// cached
	'cached throughput (t/s)': 'CachedThroughput',
	'cached throughput': 'CachedThroughput',
	'cached throughput / box (t/s/hardware)': 'CachedThroughputPerBox',
	'cached throughput/box (t/s/hardware)': 'CachedThroughputPerBox',
	'cached throughput per box (t/s/hardware)': 'CachedThroughputPerBox',
	'cached throughput / box': 'CachedThroughputPerBox',
	'cached throughput/box': 'CachedThroughputPerBox',
	'cached throughput per box': 'CachedThroughputPerBox',

	// prompt-only and gen-only
	'prompt only throughput (t/s)': 'PromptOnlyThroughput',
	'prompt-only throughput (t/s)': 'PromptOnlyThroughput',
	'prompt only throughput': 'PromptOnlyThroughput',
	'prompt-only throughput': 'PromptOnlyThroughput',
	'gen only throughput (t/s)': 'GenOnlyThroughput',
	'gen-only throughput (t/s)': 'GenOnlyThroughput',
	'gen only throughput': 'GenOnlyThroughput',
	'gen-only throughput': 'GenOnlyThroughput',

	'gen speed (t/s/user)': 'GenSpeed',
	'gen speed': 'GenSpeed',
	'input length': 'InputLength',
	'output length': 'OutputLength',
	'cache %': 'CachePct',
	'cache%': 'CachePct',
	'batch size': 'BatchSize',
	'batch_size': 'BatchSize',
	'ttft (ms)': 'TTFT',
	'ttft': 'TTFT',
	'rpm': 'RPM',

	// latency fields
	'max number of milliseconds': 'maxLatencyMs',
	'maximum number of milliseconds': 'maxLatencyMs',
	'target max number of milliseconds': 'targetMaxLatencyMs',
};

function normalizeKey(key: string): string {
	return key.trim().toLowerCase();
}

function toNumber(v: any): number | null {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string') {
		const s = v.replace(/,/g, '').replace(/%/g, '').trim();
		if (s === '') return null;
		const n = Number(s);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

export function normalizeRows(rows: RawRow[]): { rows: NormalizedRow[]; missingColumns: string[] } {
	if (!rows || rows.length === 0) return { rows: [], missingColumns: [] };

	const headerKeys = Object.keys(rows[0]);
	const mapped: Record<string, string> = {};

	// build list of canonical keys sorted by length descending so that longer/specific
	// keys (e.g. 'uncached throughput (t/s)') match before shorter ones ('throughput')
	// Prepare canonical pairs with normalized keys for robust matching and priority
	const canonicalPairs = Object.keys(canonicalMap)
	 	.map((can) => ({ key: normalizeKey(can), name: canonicalMap[can] }))
	 	.sort((a, b) => b.key.length - a.key.length);

	for (const k of headerKeys) {
	 	const nk = normalizeKey(k);
	 	for (const can of canonicalPairs) {
	 		// exact match first
	 		if (nk === can.key) {
	 			if (!(can.name in mapped)) mapped[can.name] = k;
	 			break;
	 		}
	 		// then substring match
	 		if (nk.includes(can.key)) {
	 			if (!(can.name in mapped)) mapped[can.name] = k;
	 			break;
	 		}
	 	}
	}

	const required = ['InputLength', 'OutputLength', 'CachePct', 'BatchSize', 'Throughput', 'TTFT'];
	const missingColumns = required.filter((r) => !(r in mapped));

	// Filter out rows that don't contain any metric data (empty rows from spreadsheets)
	const rawRows = rows;
	const isValidRawRow = (r: RawRow) => {
		// consider a row valid if it has any numeric metric or batchsize
		const keysToCheck = [
			'Throughput',
			'UncachedThroughput',
			'CachedThroughput',
			'ThroughputPerBox',
			'UncachedThroughputPerBox',
			'CachedThroughputPerBox',
			'PromptOnlyThroughput',
			'GenOnlyThroughput',
			'TTFT',
			'GenSpeed',
			'RPM',
			'BatchSize',
		];
		for (const k of keysToCheck) {
			const v = r[mapped[k]] ?? r[k] ?? null;
			if (v != null) {
				if (typeof v === 'number') return true;
				if (typeof v === 'string' && v.trim() !== '') return true;
			}
		}
		return false;
	};

	const filteredRawRows = rawRows.filter(isValidRawRow);

	const out: NormalizedRow[] = [];
	// forward-fill state for shared profile metadata
	let lastInputLength: number | null = null;
	let lastOutputLength: number | null = null;
	let lastCachePct: number | null = null;

	for (const r of filteredRawRows) {
		const nr: any = {};
		// helper to read by canonical name
		const read = (canonical: string) => {
			const origKey = mapped[canonical];
			return origKey ? r[origKey] : null;
		};

		const rawIn = toNumber(read('InputLength'));
		if (rawIn == null) {
			nr.InputLength = lastInputLength ?? 0;
		} else {
			nr.InputLength = rawIn;
			lastInputLength = rawIn;
		}

		const rawOut = toNumber(read('OutputLength'));
		if (rawOut == null) {
			nr.OutputLength = lastOutputLength ?? 0;
		} else {
			nr.OutputLength = rawOut;
			lastOutputLength = rawOut;
		}

		const cp = read('CachePct');
		const rawCp = cp == null ? null : toNumber(cp);
		if (rawCp == null) {
			nr.CachePct = lastCachePct;
		} else {
			nr.CachePct = rawCp;
			lastCachePct = rawCp;
		}

		nr.BatchSize = toNumber(read('BatchSize')) ?? 0;
		nr.Throughput = toNumber(read('Throughput'));
		nr.UncachedThroughput = toNumber(read('UncachedThroughput')) ?? null;
		nr.CachedThroughput = toNumber(read('CachedThroughput')) ?? null;
		nr.PromptOnlyThroughput = toNumber(read('PromptOnlyThroughput')) ?? null;
		nr.GenOnlyThroughput = toNumber(read('GenOnlyThroughput')) ?? null;
		// per-box throughput variants
		nr.ThroughputPerBox = toNumber(read('ThroughputPerBox')) ?? null;
		nr.UncachedThroughputPerBox = toNumber(read('UncachedThroughputPerBox')) ?? null;
		nr.CachedThroughputPerBox = toNumber(read('CachedThroughputPerBox')) ?? null;
		// latency fields
		nr.maxLatencyMs = toNumber(read('maxLatencyMs')) ?? null;
		nr.targetMaxLatencyMs = toNumber(read('targetMaxLatencyMs')) ?? null;
		nr.TTFT = toNumber(read('TTFT'));
		nr.GenSpeed = toNumber(read('GenSpeed')) ?? null;
		nr.RPM = toNumber(read('RPM')) ?? null;
		out.push(nr as NormalizedRow);
	}

	// compute profile-level aggregates for diagnostics/stability/saturation
	const agg = aggregateModel(out);

	// decide per-profile diagnostics
	const profileRowCount = out.length;
	let profileStability: number | null = null;
	let profileSaturation = false;
	let profileConfidence = 0.4; // default low

	if (profileRowCount <= 1) {
		profileStability = null;
		profileSaturation = false;
		profileConfidence = 0.4; // low confidence when scaling cannot be evaluated
	} else {
		profileStability = agg.stabilityScore ?? null;
		profileSaturation = !!agg.saturationFlag;
		// confidence: combine scalingEfficiency and stability if available
		const se = agg.scalingEfficiency ?? 0;
		const ss = agg.stabilityScore ?? 0;
		profileConfidence = Math.max(0, Math.min(1, 0.3 + 0.5 * se + 0.2 * ss));
	}

	// riskLevel heuristic
	let risk: 'low' | 'medium' | 'high' = 'low';
	if (missingColumns.length > 0 || out.every((r) => r.Throughput == null)) {
		risk = 'high';
	} else if (profileConfidence < 0.5 || profileSaturation) {
		risk = 'medium';
	}

	// attach derived booleans and diagnostics to each normalized row
	for (const nr of out) {
		nr.isLongContext = (nr.InputLength ?? 0) >= 8000;
		nr.isGenerationHeavy = (nr.OutputLength ?? 0) >= 1000;
		nr.isPromptHeavy = (nr.InputLength ?? 0) >= 8000 && (nr.OutputLength ?? 0) < 1000;
		nr.isCacheHeavy = (nr.CachePct ?? 0) >= 0.7;
		nr.isLatencySensitive = (nr.OutputLength ?? 0) <= 500;
		nr.stabilityScore = profileStability;
		nr.saturationDetected = profileSaturation;
		nr.confidenceScore = profileConfidence;
		nr.riskLevel = risk;
	}

	// compute workload label from first normalized row using the specified rules
	const wl = guessWorkloadLabel(out) || 'General Workload';
	for (const nr of out) nr.workloadLabel = wl;

	return { rows: out, missingColumns };
}

export function aggregateModel(rows: NormalizedRow[]) {
	// return simple aggregates used for scoring and charts
	const throughputVals = rows.map((r) => r.Throughput).filter((v) => v != null) as number[];
	const rpmVals = rows.map((r) => r.RPM).filter((v) => v != null) as number[];
	const genVals = rows.map((r) => r.GenSpeed).filter((v) => v != null) as number[];
	const ttftVals = rows.map((r) => r.TTFT).filter((v) => v != null) as number[];

	const maxThroughput = throughputVals.length ? Math.max(...throughputVals) : null;
	const avgRPM = rpmVals.length ? rpmVals.reduce((a, b) => a + b, 0) / rpmVals.length : null;
	const avgGen = genVals.length ? genVals.reduce((a, b) => a + b, 0) / genVals.length : null;
	const medianTTFT = ttftVals.length ? computeMedian(ttftVals) : null;

	// find row that produced max throughput (if any)
	let maxThroughputRow: NormalizedRow | null = null;
	if (maxThroughput != null) {
		for (const r of rows) {
			if (r.Throughput === maxThroughput) {
				maxThroughputRow = r;
				break;
			}
		}
	}

	// basic stability metrics
	const throughputMean = throughputVals.length ? throughputVals.reduce((a, b) => a + b, 0) / throughputVals.length : null;
	const throughputVariance = throughputVals.length
		? throughputVals.reduce((a, b) => a + Math.pow(b - (throughputMean as number), 2), 0) / throughputVals.length
		: null;

	// derived metrics
	let scalingEfficiency: number | null = null;
	let stabilityScore: number | null = null;
	let saturationFlag: boolean | null = null;

	if (throughputMean != null && throughputVariance != null) {
		const stddev = Math.sqrt(throughputVariance);
		stabilityScore = Math.max(0, 1 - stddev / (throughputMean || 1));
	}

	// scaling efficiency: compare actual throughput against ideal linear scaling from smallest batch
	try {
		const rowsWithBatch = rows.filter((r) => (r.BatchSize ?? 0) > 0 && r.Throughput != null);
		if (rowsWithBatch.length >= 2) {
			const sortedByBatch = rowsWithBatch.slice().sort((a, b) => (a.BatchSize ?? 0) - (b.BatchSize ?? 0));
			const base = sortedByBatch[0];
			const baseBatch = base.BatchSize || 1;
			const baseThroughput = base.Throughput || 0;
			if (baseThroughput > 0) {
				const ratios: number[] = [];
				for (const r of sortedByBatch) {
					const b = r.BatchSize || 1;
					const expected = baseThroughput * (b / baseBatch);
					if (expected > 0) ratios.push((r.Throughput as number) / expected);
				}
				if (ratios.length) {
					const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
					scalingEfficiency = Math.min(1, Math.max(0, meanRatio));
				}
			}
		}
	} catch (e) {
		// swallow any unexpected errors here and leave derived metrics null
	}

	// saturation detection: check top two batch sizes for plateauing
	{
		const rowsWithThroughput = rows.filter((r) => r.Throughput != null && (r.BatchSize ?? 0) > 0);
		if (rowsWithThroughput.length >= 2) {
			const sortedDesc = rowsWithThroughput.slice().sort((a, b) => (b.BatchSize ?? 0) - (a.BatchSize ?? 0));
			const top = sortedDesc[0];
			let prev = null as NormalizedRow | null;
			for (let i = 1; i < sortedDesc.length; i++) {
				if (sortedDesc[i].Throughput != null) {
					prev = sortedDesc[i];
					break;
				}
			}
			if (top && prev && prev.Throughput && top.Throughput) {
				const delta = (top.Throughput - prev.Throughput) / Math.max(1, prev.Throughput);
				saturationFlag = delta < 0.05; // less than 5% improvement indicates saturation
			}
		}
	}

	return {
		maxThroughput,
		maxThroughputRow,
		avgRPM,
		avgGen,
		medianTTFT,
		throughputMean,
		throughputVariance,
		scalingEfficiency,
		stabilityScore,
		saturationFlag,
	};
}

// Guess a friendly workload label from the first normalized row (heuristic)
export function guessWorkloadLabel(rows: NormalizedRow[]): string | undefined {
	if (!rows || rows.length === 0) return undefined;
	const r = rows[0];
	const inLen = r.InputLength ?? 0;
	const outLen = r.OutputLength ?? 0;
	const cache = r.CachePct ?? 0;

	// thresholds per specification
	if ((cache ?? 0) >= 0.8 && outLen <= 500) return 'Interactive Chat';
	if (inLen >= 50000) return 'Extreme Long Context Retrieval';
	if (inLen >= 8000 && outLen >= 3000) return 'Long Document Summarization';
	if (inLen >= 8000 && outLen < 3000) return 'Long Context QA';
	if (inLen >= 2000 && inLen <= 6000 && outLen <= 1000) return 'Assistant / RAG';
	if (outLen >= 1000) return 'Long Generation';

	return 'General Workload';
}
