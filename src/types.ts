export type RawRow = Record<string, any>;

export interface NormalizedRow {
	InputLength: number;
	OutputLength: number;
	CachePct: number | null;
	BatchSize: number;
	Throughput: number | null;
	UncachedThroughput?: number | null;
	CachedThroughput?: number | null;
	PromptOnlyThroughput?: number | null;
	GenOnlyThroughput?: number | null;
	ThroughputPerBox?: number | null;
	UncachedThroughputPerBox?: number | null;
	CachedThroughputPerBox?: number | null;
	maxLatencyMs?: number | null;
	targetMaxLatencyMs?: number | null;
	TTFT: number | null;
	GenSpeed?: number | null;
	RPM?: number | null;
	// metadata to be added per-row for exports (filled by uploader)
	modelName?: string;
	profileName?: string;
	profileNumber?: number;
	workloadLabel?: string;

	// derived boolean flags
	isLongContext?: boolean;
	isGenerationHeavy?: boolean;
	isPromptHeavy?: boolean;
	isCacheHeavy?: boolean;
	isLatencySensitive?: boolean;

	// diagnostics / scores (profile-level, attached to each row)
	riskLevel?: 'low' | 'medium' | 'high';
	confidenceScore?: number | null; // 0..1
	stabilityScore?: number | null; // 0..1
	saturationDetected?: boolean;
}

export interface ParsedFile {
	fileName: string;
	model: string; // e.g. Model A or Model_L
	profile: string; // e.g. profile_1
	rowsRaw: RawRow[];
	rows: NormalizedRow[];
	missingColumns?: string[];
    // optional friendly workload label (e.g., "Interactive Chat", "Summarization")
    workloadLabel?: string;
    // optional numeric profile index if detected (e.g., 1 for profile_1)
    profileNumber?: number;
	// unique id assigned at upload to avoid key collisions
	id?: string;
}

export type Severity = 'info' | 'warning' | 'error';

export interface Anomaly {
	type: string;
	message: string;
	severity: Severity;
	meta?: Record<string, any>;
}

export interface ScoreResult {
	score: number; // 0-100
	status: 'GO' | 'CAUTION' | 'NO-GO';
	reasons: string[]; // human-readable reasons for the score
	metrics: {
		throughput?: number;
		rpm?: number;
		genSpeed?: number;
		ttft?: number;
	};
	// optional breakdown of how much each metric contributed (0-1)
	contributions?: {
		throughput?: number;
		rpm?: number;
		genSpeed?: number;
		ttft?: number;
		stabilityBonus?: number;
	};
	// human-friendly one-paragraph explanation intended for non-technical users
	plainExplanation?: string;
	// contributions expressed as points (0-100) toward the final score
	contributionsToScore?: {
		throughput?: number;
		rpm?: number;
		genSpeed?: number;
		ttft?: number;
		stabilityBonus?: number;
	};
	// when true, the score is indeterminate because there were insufficient
	// same-profile samples to compare; UI should show a descriptive message
	indeterminate?: boolean;
	// indicates the scoring used the global fallback reference set
	usedGlobalFallback?: boolean;
}
