import { ParsedFile, ScoreResult } from '../types';
import { aggregateModel } from './normalize';
import baselines from './baselines.json';

export type ScoringMode = 'absolute' | 'relative';
interface ScoreOptions {
	mode?: ScoringMode;
	// when true, allow falling back to the global set of uploaded files
	// for comparison when a profile has only a single file. Default: false.
	allowGlobalFallback?: boolean;
}

function clamp01(v: number) {
	return Math.max(0, Math.min(1, v));
}

// Score a single parsed file in the context of all uploaded models. Returns 0-100 and reasons.
export function scoreModel(target: ParsedFile, all: ParsedFile[], options: ScoreOptions = {}): ScoreResult {
	const mode: ScoringMode = options.mode || 'absolute';
	// Group comparisons by profile: only compare files that share the same profile as the target
	const group = all.filter((p) => (p.profile ?? '').toString() === (target.profile ?? '').toString());
	const groupAgg = group.map((p) => ({ file: p, agg: aggregateModel(p.rows) }));
	// also prepare a global reference (all uploaded files) as a fallback when requested
	const globalAgg = all.map((p) => ({ file: p, agg: aggregateModel(p.rows) }));
	const targetAgg = aggregateModel(target.rows);

	// Determine best values depending on mode
	let bestThroughput: number;
	let bestRPM: number;
	let bestGen: number;
	let bestTTFT: number;
	// choose reference set: prefer profile-group comparisons. If the profile
	// only contains the single target file, we normally mark the score as
	// indeterminate (insufficient samples). If the caller explicitly allows
	// a global fallback (options.allowGlobalFallback), use the global set.
	const allowGlobal = !!options.allowGlobalFallback;
	const useGlobalFallback = allowGlobal && groupAgg.length <= 1;
	const refAggs = useGlobalFallback ? globalAgg : groupAgg;

	// If there is only one sample in the profile and the caller did not allow
	// a global fallback, return an indeterminate ScoreResult so the UI can
	// surface "Insufficient samples" instead of a misleading 100% score.
	if (groupAgg.length <= 1 && !useGlobalFallback) {
		const message = 'Insufficient samples in this profile to compute a reliable relative score. Upload another file with the same profile or choose to compare against all uploaded files.';
		return {
			score: 0,
			status: 'NO-GO',
			reasons: [message],
			metrics: {
				throughput: targetAgg.maxThroughput ?? undefined,
				rpm: targetAgg.avgRPM ?? undefined,
				genSpeed: targetAgg.avgGen ?? undefined,
				ttft: targetAgg.medianTTFT ?? undefined,
			},
			contributions: {},
			contributionsToScore: {},
			plainExplanation: message,
			indeterminate: true,
			usedGlobalFallback: false,
		} as ScoreResult;
	}

	if (mode === 'absolute') {
		// Use baselines only when they are sensible (finite and positive). If a baseline
		// value is missing, zero, or invalid, fall back to the computed best value
		// from the chosen reference set. This prevents a stale/incorrect baseline
		// from making many files look like they meet-or-exceed the "best" value.
		const hasBaselineThroughput = Number.isFinite(baselines.bestThroughput) && baselines.bestThroughput > 0;
		const hasBaselineRPM = Number.isFinite(baselines.bestRPM) && baselines.bestRPM > 0;
		const hasBaselineGen = Number.isFinite(baselines.bestGen) && baselines.bestGen > 0;
		const hasBaselineTTFT = Number.isFinite(baselines.bestTTFT) && baselines.bestTTFT > 0; // TTFT baseline must be >0 to be meaningful

		bestThroughput = hasBaselineThroughput ? baselines.bestThroughput : Math.max(...refAggs.map((a) => a.agg.maxThroughput ?? 0));
		bestRPM = hasBaselineRPM ? baselines.bestRPM : Math.max(...refAggs.map((a) => a.agg.avgRPM ?? 0));
		bestGen = hasBaselineGen ? baselines.bestGen : Math.max(...refAggs.map((a) => a.agg.avgGen ?? 0));
		bestTTFT = hasBaselineTTFT ? baselines.bestTTFT : Math.min(...refAggs.map((a) => (a.agg.medianTTFT == null ? Infinity : a.agg.medianTTFT)));
	} else {
		bestThroughput = Math.max(...refAggs.map((a) => a.agg.maxThroughput ?? 0));
		bestRPM = Math.max(...refAggs.map((a) => a.agg.avgRPM ?? 0));
		bestGen = Math.max(...refAggs.map((a) => a.agg.avgGen ?? 0));
		bestTTFT = Math.min(...refAggs.map((a) => (a.agg.medianTTFT == null ? Infinity : a.agg.medianTTFT)));
	}

	// identify which uploaded file corresponds to the best throughput (if any)
	// use the same `bestThroughput` value that was used for normalization so the
	// reported "top model" matches the denominator shown to users. match within a small epsilon
	const EPS = 1e-6;
	// Find all entries that match the best throughput within EPS (floating tolerant)
	const candidates = refAggs.filter((a) => Math.abs((a.agg.maxThroughput ?? 0) - bestThroughput) <= EPS);
	let topEntry = null as { file: ParsedFile; agg: any } | null;
	if (candidates.length === 1) {
		topEntry = candidates[0];
	} else if (candidates.length > 1) {
		// deterministic tie-break: pick the candidate with the lexicographically smallest fileName
		candidates.sort((x, y) => {
			const a = (x.file.fileName || '').toString();
			const b = (y.file.fileName || '').toString();
			return a.localeCompare(b);
		});
		topEntry = candidates[0];
	} else {
		// fallback: pick the entry with the numerically largest throughput; break ties by filename
		topEntry = refAggs.reduce((best, cur) => {
			if (!best) return cur;
			const bestVal = best.agg.maxThroughput ?? 0;
			const curVal = cur.agg.maxThroughput ?? 0;
			if (curVal > bestVal) return cur;
			if (Math.abs(curVal - bestVal) <= EPS) {
				// tie - deterministic by filename
				const a = (cur.file.fileName || '').toString();
				const b = (best.file.fileName || '').toString();
				return a.localeCompare(b) < 0 ? cur : best;
			}
			return best;
		}, null as { file: ParsedFile; agg: any } | null);
	}
	const topFileName = topEntry?.file?.fileName ?? 'unknown';
	const topBatch = topEntry?.agg?.maxThroughputRow?.BatchSize ?? 'unknown';

	const reasons: string[] = [];

	// Throughput contribution (40%) - higher is better
	const t = targetAgg.maxThroughput ?? 0;
	const throughputScore = bestThroughput > 0 ? clamp01(t / bestThroughput) : 0;
	if (t === 0 || t == null) reasons.push('Missing throughput data, reduces confidence.');

	// User-facing explanation when fallback was used (single-file profile)
	if (useGlobalFallback) {
		reasons.unshift('Comparison used all uploaded files because this profile had only one uploaded file; upload more files with the same profile for profile-relative scoring.');
	}

	// RPM contribution (20%) - higher better
	const r = targetAgg.avgRPM ?? 0;
	const rpmScore = bestRPM > 0 ? clamp01(r / bestRPM) : 0;
	if (r === 0 || r == null) reasons.push('Missing RPM data, reduces confidence.');

	// Gen speed contribution (20%) - higher better
	const g = targetAgg.avgGen ?? 0;
	const genScore = bestGen > 0 ? clamp01(g / bestGen) : 0;

	// TTFT contribution (20%) - lower better
	const tt = targetAgg.medianTTFT;
	// TTFT is lower-better; to avoid divide-by-zero, guard bestTTFT
	const safeBestTTFT = bestTTFT === 0 ? Number.EPSILON : bestTTFT;
	const ttftScore = tt == null || !isFinite(safeBestTTFT) ? 0 : clamp01(safeBestTTFT / tt);
	if (tt == null) reasons.push('Missing TTFT data, reduces confidence.');

	// Stability bonus: use throughputVariance if available
	const throughputs = target.rows.map((r) => r.Throughput).filter((v) => v != null) as number[];
	let stabilityBonus = 0;
	if (throughputs.length >= 2) {
		const mean = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
		const variance = throughputs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / throughputs.length;
		const cv = Math.sqrt(variance) / (mean || 1);
		stabilityBonus = Math.max(0, 0.05 * (1 - clamp01(cv)));
	}

	// Compose weighted score (0..1 before converting to 0..100 points)
	const weighted = 0.4 * throughputScore + 0.2 * rpmScore + 0.2 * genScore + 0.2 * ttftScore + stabilityBonus;
	let score = Math.round(weighted * 100);

	// Penalize missing metrics heavily
	const missingCount = reasons.length;
	if (missingCount > 0) score = Math.max(0, score - missingCount * 8);

	let status: ScoreResult['status'] = 'NO-GO';
	if (score >= 75) status = 'GO';
	else if (score >= 50) status = 'CAUTION';

	// Build detailed, human-friendly reasons (more explicit)
	const contributions = {
		throughput: throughputScore,
		rpm: rpmScore,
		genSpeed: genScore,
		ttft: ttftScore,
		stabilityBonus,
	};

	// Also compute contributions as points out of 100 so we can show "contributes X points to final score"
	const contributionsToScore = {
		throughput: Math.round(throughputScore * 0.4 * 100),
		rpm: Math.round(rpmScore * 0.2 * 100),
		genSpeed: Math.round(genScore * 0.2 * 100),
		ttft: Math.round(ttftScore * 0.2 * 100),
		stabilityBonus: Math.round(stabilityBonus * 100),
	};

	// Highest-level summary
	if (score >= 75) reasons.unshift('High overall score — meets GO thresholds.');
	else if (score >= 50) reasons.unshift('Moderate score — exercise caution.');
	else reasons.unshift('Low score — recommended NO-GO.');

	// Per-metric explanations, with raw numbers when available
	if (t && bestThroughput > 0) {
		const pct = Math.round((throughputScore * 100));
		const batch = (targetAgg as any).maxThroughputRow?.BatchSize ?? 'unknown';
		reasons.push(`Throughput: ${t} t/s (top model: ${bestThroughput} t/s from ${topFileName}) — ${pct}% of best; peak at batch ${batch}.`);
	} else {
		reasons.push('Throughput data missing or invalid.');
	}

	if (r && bestRPM > 0) {
		const pct = Math.round((rpmScore * 100));
		reasons.push(`RPM (avg): ${r} — ${pct}% of best among compared models.`);
	}

	if (g && bestGen > 0) {
		const pct = Math.round((genScore * 100));
		reasons.push(`Gen speed (avg): ${g} t/s/user — ${pct}% of best.`);
	}

	if (tt != null && isFinite(tt)) {
		const pct = Math.round((ttftScore * 100));
		reasons.push(`TTFT (median): ${tt} ms — ${pct}% relative to best (lower is better).`);
	}

	if (stabilityBonus > 0) reasons.push(`Stability bonus applied (+${(stabilityBonus * 100).toFixed(1)}% of score).`);

	// Reorder reasons: keep summary at top already inserted, keep detailed ones below

	// ensure score does not exceed 100 after bonuses
	if (score > 100) score = 100;

	// Build plain-language explanation for non-technical users
	const plainParts: string[] = [];
	plainParts.push(`${status} — score ${score}/100.`);
	if (t && bestThroughput > 0) {
		const pct = Math.round(throughputScore * 100);
		plainParts.push(`Peak throughput ${t} t/s (${pct}% of top model), observed at batch ${((targetAgg as any).maxThroughputRow?.BatchSize ?? 'unknown')}.`);
	}
	if (tt != null && isFinite(tt)) {
		plainParts.push(`Median response time ${tt} ms (lower is better).`);
	}
	if (r) {
		plainParts.push(`Average RPM ${r}.`);
	}
	if (reasons.length > 1) {
		// include top short reason for layman
		plainParts.push(reasons.slice(1, 3).join(' '));
	}
	const plainExplanation = plainParts.join(' ');

	return {
		score,
		status,
		reasons,
		metrics: {
			throughput: targetAgg.maxThroughput ?? undefined,
			rpm: targetAgg.avgRPM ?? undefined,
			genSpeed: targetAgg.avgGen ?? undefined,
			ttft: targetAgg.medianTTFT ?? undefined,
		},
		contributions,
		contributionsToScore,
		plainExplanation,
	};
}

export function scoreAll(parsed: ParsedFile[]) {
	return parsed.map((p) => ({ file: p, result: scoreModel(p, parsed, { allowGlobalFallback: false }) }));
}

export function scoreAllWithMode(parsed: ParsedFile[], mode: ScoringMode = 'absolute') {
	return parsed.map((p) => ({ file: p, result: scoreModel(p, parsed, { mode, allowGlobalFallback: false }) }));
}
