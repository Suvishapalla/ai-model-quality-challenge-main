import React, { useMemo, useState } from 'react';
import { ParsedFile, Anomaly } from '../types';
import RawDataTable from './RawDataTable';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { aggregateModel } from '../lib/normalize';
import { formatNumber, formatNumberCompact, sanitizeFileName, formatYAxisTick } from '../utils/format';

function downloadJSON(filename: string, data: any) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadCSV(filename: string, rows: any[], meta?: Record<string, unknown>) {
  if (!rows || rows.length === 0) return;

  const flatRows = rows.map((r) => {
    const out: Record<string, unknown> = {};

    if (meta) {
      for (const k of Object.keys(meta)) out[k] = meta[k];
    }

    for (const k of Object.keys(r)) {
      if (k === "__orig") continue;
      const v = r[k];
      out[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }

    return out;
  });

  const keys = Array.from(new Set(flatRows.flatMap((r) => Object.keys(r))));

  const csvLines = [
    keys.map(escapeCsvValue).join(","),
    ...flatRows.map((row) =>
      keys.map((key) => escapeCsvValue(row[key])).join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

const MODEL_COLORS = [
	'#2563eb',
	'#16a34a',
	'#dc2626',
	'#9333ea',
	'#ea580c',
	'#0891b2',
	'#ca8a04',
	'#db2777',
	'#4f46e5',
	'#059669',
	'#b91c1c',
	'#7c3aed',
	'#0f766e',
	'#475569',
];

type ModelSeries = {
	key: string;
	label: string;
	profile: string;
	color: string;
	file: ParsedFile;
};

function buildSeries(files: ParsedFile[]): ModelSeries[] {
	return files.map((file, index) => ({
		key: `model_${index}`,
		label: `${file.model || file.fileName} — ${file.profile || 'profile'}`,
		profile: file.profile || 'profile_unknown',
		color: MODEL_COLORS[index % MODEL_COLORS.length],
		file,
	}));
}

function shortModelProfileLabel(file: ParsedFile) {
	const model = (file.model || file.fileName || '').toString();
	const modelMatch = model.match(/Model\s*([A-Za-z0-9_-]+)/i);
	const modelShort = modelMatch?.[1] || model.replace(/^model[_\s-]*/i, '').slice(0, 8) || 'model';
	const profileMatch = (file.profile || '').toString().match(/(\d+)/);
	return profileMatch ? `${modelShort}-p${profileMatch[1]}` : modelShort;
}

function hasMultipleBatchData(file: ParsedFile) {
	const batches = new Set(
		(file.rows || [])
			.filter((row) => row.BatchSize != null && row.Throughput != null)
			.map((row) => row.BatchSize)
	);
	return batches.size > 1;
}

function buildMetricData(series: ModelSeries[], metric: 'Throughput' | 'TTFT', positiveOnly = false) {
	const rowsByBatch = new Map<number, Record<string, number | null>>();

	for (const model of series) {
		for (const row of model.file.rows || []) {
			const batch = row.BatchSize ?? null;
			const value = row[metric] ?? null;
			if (batch == null || value == null || (positiveOnly && value <= 0)) continue;
			if (!rowsByBatch.has(batch)) rowsByBatch.set(batch, { batch });
			rowsByBatch.get(batch)![model.key] = value;
		}
	}

	return Array.from(rowsByBatch.values()).sort((a, b) => Number(a.batch) - Number(b.batch));
}

function buildCachedData(series: ModelSeries[]) {
	const rowsByBatch = new Map<number, Record<string, number | null>>();

	for (const model of series) {
		for (const row of model.file.rows || []) {
			const batch = row.BatchSize ?? null;
			if (batch == null) continue;
			if (!rowsByBatch.has(batch)) rowsByBatch.set(batch, { batch });
			const dataRow = rowsByBatch.get(batch)!;
			if (row.CachedThroughput != null) dataRow[`${model.key}_cached`] = row.CachedThroughput;
			if (row.UncachedThroughput != null) dataRow[`${model.key}_uncached`] = row.UncachedThroughput;
		}
	}

	return Array.from(rowsByBatch.values()).sort((a, b) => Number(a.batch) - Number(b.batch));
}

function DiagnosticsTooltip({ active, payload, label, valueFormatter }: any) {
	if (!active || !payload || payload.length === 0) return null;
	return (
		<div style={{ background: '#fff', border: '1px solid #d8e3ef', borderRadius: 6, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
			<div style={{ fontWeight: 700, marginBottom: 6 }}>Batch size: {label}</div>
			{payload
				.filter((entry: any) => entry.value != null)
				.map((entry: any) => (
					<div key={entry.dataKey} style={{ color: entry.color, fontSize: 13 }}>
						{entry.name}: <strong>{valueFormatter(entry.value)}</strong>
					</div>
				))}
		</div>
	);
}

function ModelToggleLegend({
	series,
	hiddenModels,
	onToggle,
}: {
	series: ModelSeries[];
	hiddenModels: Set<string>;
	onToggle: (key: string) => void;
}) {
	const grouped = series.reduce<Record<string, ModelSeries[]>>((acc, model) => {
		if (!acc[model.profile]) acc[model.profile] = [];
		acc[model.profile].push(model);
		return acc;
	}, {});

	return (
		<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, margin: '8px 0 12px' }}>
			{Object.entries(grouped).map(([profile, models]) => (
				<div key={profile} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: '#fff' }}>
					<div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{profile}</div>
					{models.map((model) => (
						<label key={model.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4, cursor: 'pointer' }}>
							<input
								type="checkbox"
								checked={!hiddenModels.has(model.key)}
								onChange={() => onToggle(model.key)}
							/>
							<span style={{ width: 10, height: 10, borderRadius: 2, background: model.color, display: 'inline-block' }} />
							<span>{model.label}</span>
						</label>
					))}
				</div>
			))}
		</div>
	);
}

interface Props {
	files: ParsedFile[];
	anomaliesMap: Map<string, Anomaly[]>;
}

export const EngineerView: React.FC<Props> = ({ files, anomaliesMap }) => {
	if (!files || files.length === 0) return <div>Please upload files to see engineer diagnostics.</div>;

	const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

	const [showGuide, setShowGuide] = useState<boolean>(false);
	const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

	const profiles = Array.from(new Set(files.map((f) => f.profile))).filter(Boolean);
	if (!selectedProfile && profiles.length > 0) setSelectedProfile(profiles[0]);
	const uploadedFileCount = files.length;
	const diagnosticSeries = useMemo(() => buildSeries(files), [files]);
	const throughputOverlayData = useMemo(() => buildMetricData(diagnosticSeries, 'Throughput'), [diagnosticSeries]);
	const ttftOverlayData = useMemo(() => buildMetricData(diagnosticSeries, 'TTFT', true), [diagnosticSeries]);
	const cachedOverlayData = useMemo(() => buildCachedData(diagnosticSeries), [diagnosticSeries]);
	const toggleModel = (key: string) => {
		setHiddenModels((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	return (
		<div>
			<h3>Cross-model same-profile comparison</h3>
			{profiles.length > 0 && (
				<div style={{ marginBottom: 12 }}>
					<label style={{ marginRight: 8 }}>Select profile:</label>
					<select value={selectedProfile ?? ''} onChange={(e) => setSelectedProfile(e.target.value)}>
						{profiles.map((p) => (
							<option key={p} value={p}>{p}</option>
						))}
					</select>
				</div>
			)}

			{selectedProfile && (
				<div style={{ marginBottom: 16 }}>
					<h4>Profile: {selectedProfile}</h4>
					{/* comparison bars: throughput, ttft, rpm, stability */}
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
						<div style={{ background: '#fff', padding: 8 }}>
							<strong>Throughput (peak)</strong>
							<ResponsiveContainer width="100%" height={160}>
								<LineChart data={files.filter(f=>f.profile===selectedProfile).map(f => ({ name: f.fileName, shortName: shortModelProfileLabel(f), throughput: (aggregateModel(f.rows as any).maxThroughput ?? 0) }))}>
									<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
									<YAxis tickFormatter={(v) => formatYAxisTick(v as number)} />
									<Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? label} />
									<Line type="monotone" dataKey="throughput" stroke="#8884d8" />
								</LineChart>
							</ResponsiveContainer>
						</div>
						<div style={{ background: '#fff', padding: 8 }}>
							<strong>TTFT (median)</strong>
							<ResponsiveContainer width="100%" height={160}>
								<LineChart data={files.filter(f=>f.profile===selectedProfile).map(f => ({ name: f.fileName, shortName: shortModelProfileLabel(f), ttft: (aggregateModel(f.rows as any).medianTTFT ?? null) }))}>
									<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
									<YAxis tickFormatter={(v) => formatYAxisTick(v as number)} />
									<Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? label} />
									<Line type="monotone" dataKey="ttft" stroke="#82ca9d" />
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					{/* winner badges */}
					<div style={{ marginTop: 8 }}>
						{(() => {
							const group = files.filter(f => f.profile === selectedProfile);
							if (group.length === 0) return null;
							// compute winners
							let bestThroughput = -Infinity, bestTTFT = Infinity, bestRPM = -Infinity, bestStability = -Infinity;
							let bestT=''; let bestLat=''; let bestR=''; let bestS='';
							for (const f of group) {
								const agg = aggregateModel(f.rows as any);
								const t = agg.maxThroughput ?? -Infinity;
								const lat = agg.medianTTFT ?? Infinity;
								const r = agg.avgRPM ?? -Infinity;
								const mean = agg.throughputMean ?? 0;
								const varr = agg.throughputVariance ?? 0;
								const stability = mean && varr ? (mean / (Math.sqrt(varr) || 1)) : 0;
								if (t > bestThroughput) { bestThroughput = t; bestT = f.fileName; }
								if (lat < bestTTFT) { bestTTFT = lat; bestLat = f.fileName; }
								if (r > bestRPM) { bestRPM = r; bestR = f.fileName; }
								if (hasMultipleBatchData(f) && stability > bestStability) { bestStability = stability; bestS = f.fileName; }
							}
							return (
								<div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
									<div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>Best throughput: <strong>{bestT || '—'}</strong></div>
									<div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>Best latency: <strong>{bestLat || '—'}</strong></div>
									<div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>Best RPM: <strong>{bestR || '—'}</strong></div>
									<div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>Best stability: <strong>{bestS || '—'}</strong></div>
								</div>
							);
						})()}
					</div>
				</div>
			)}

			<h3>Uploaded files</h3>
			{/* top-level anomalies summary */}
			{(() => {
				const allAnomalies = files.flatMap((f) => anomaliesMap.get(f.id ?? f.fileName) || []);
				const errorCount = allAnomalies.filter((a) => a.severity === 'error').length;
				const warnCount = allAnomalies.filter((a) => a.severity === 'warning').length;
				return (
					<div style={{ marginBottom: 8 }}>
						<span style={{ marginRight: 12 }}>Files: <strong>{uploadedFileCount}</strong></span>
						<span style={{ marginRight: 12 }}>Errors: <strong style={{ color: errorCount ? 'red' : undefined }}>{errorCount}</strong></span>
						<span>Warnings: <strong style={{ color: warnCount ? '#b85' : undefined }}>{warnCount}</strong></span>
					</div>
				);
			})()}

			<ul>
				{files.map((f) => (
					<li key={f.id ?? f.fileName}>{f.fileName} — {f.model} / {f.profile} {((anomaliesMap.get(f.id ?? f.fileName) || []).length > 0) ? `• ${ (anomaliesMap.get(f.id ?? f.fileName) || []).length } anomalies` : ''}</li>
				))}
			</ul>

			<h3>Schema & anomalies</h3>
			{files.map((f) => {
				const agg = aggregateModel(f.rows as any);
				const anomalies = anomaliesMap.get(f.id ?? f.fileName) || [];
				return (
					<div key={f.fileName} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
							<div>
								<div><strong>{f.fileName}</strong></div>
								<div>Detected model: {f.model} — profile: {f.profile}</div>
								<div style={{ fontSize: 12, color: '#666' }}>Missing columns: { (f.missingColumns && f.missingColumns.length) ? f.missingColumns.join(', ') : 'none' }</div>
							</div>
							<div style={{ textAlign: 'right' }}>
									{(() => {
										const base = sanitizeFileName(`${f.model}_${f.profile}` || f.fileName);
										return (
											<>
												<button onClick={() => downloadJSON(`${base}_normalized.json`, { meta: { model: f.model, profile: f.profile }, rows: f.rows })}>Download JSON</button>
												<button style={{ marginLeft: 8 }} onClick={() => downloadCSV(`${base}_normalized.csv`, f.rows, { modelName: f.model, profile: f.profile, profileNumber: (f as any).profileNumber, workloadLabel: (f as any).workloadLabel })}>Download CSV</button>
											</>
										);
									})()}
								</div>
						</div>

							<div style={{ marginTop: 8 }}>
								{(anomalies).map((a, i) => (
									<div key={i} style={{ color: a.severity === 'error' ? 'red' : '#b85' }}>{a.severity.toUpperCase()}: {a.message}</div>
								))}
							</div>

						<div style={{ marginTop: 8 }}>
							<strong>Aggregate summary</strong>
							<div style={{ fontSize: 13 }}>
								<div>Peak throughput: {formatNumberCompact(agg.maxThroughput as any)} t/s (at batch { (agg as any).maxThroughputRow?.BatchSize ?? '—' })</div>
								<div>Median TTFT: {formatNumber(agg.medianTTFT as any, 1)} ms</div>
								<div>Avg RPM: {formatNumber(agg.avgRPM as any, 1)}</div>
								<div>Gen speed (avg): {formatNumber(agg.avgGen as any, 2)} t/s/user</div>
								<div>Avg throughput: {formatNumberCompact(agg.throughputMean as any)}</div>
								<div>
									Stability score{' '}
									<span title="Consistency of throughput across batch sizes. Higher = more predictable." style={{ cursor: 'help', color: '#64748b' }}>ⓘ</span>
									: <strong style={{ color: (agg.stabilityScore ?? 0) >= 0.8 ? 'green' : (agg.stabilityScore ?? 0) >= 0.5 ? '#f5a623' : 'red' }}>{agg.stabilityScore != null ? formatNumber(agg.stabilityScore as any, 2) : '—'}</strong>
								</div>
								<div>Confidence: {((f.rows as any)[0]?.confidenceScore == null) ? '—' : `${formatNumber(((f.rows as any)[0]?.confidenceScore ?? 0) * 100, 1)}%`}</div>
								<div>Risk level: <strong style={{ color: (f.rows as any)[0]?.riskLevel === 'high' ? 'red' : (f.rows as any)[0]?.riskLevel === 'medium' ? '#f5a623' : 'green' }}>{(f.rows as any)[0]?.riskLevel ?? 'low'}</strong></div>
								{agg.saturationFlag ? <div style={{ color: 'red' }}>⚠ Saturation detected — model may be hitting performance limits</div> : null}
								{(agg.maxThroughputRow as any)?.maxLatencyMs != null && (agg.maxThroughputRow as any)?.targetMaxLatencyMs != null && ((agg.maxThroughputRow as any).maxLatencyMs === (agg.maxThroughputRow as any).targetMaxLatencyMs) ? <div style={{ color: 'red' }}>⚠ At latency limit (maxLatency = targetLatency)</div> : null}
							</div>
						</div>

						<div style={{ marginTop: 8 }}>
							<RawDataTable rows={f.rows} />
						</div>
					</div>
				);
			})}

			<h3>Diagnostics — all files</h3>
			<div style={{ marginTop: 8, marginBottom: 8 }}>
				<div style={{ marginBottom: 8 }}>
					<button onClick={() => setShowGuide((s) => !s)} style={{ background: 'transparent', border: 'none', color: '#007acc', cursor: 'pointer' }}>{showGuide ? '▼' : '▶'} How to read these charts</button>
				</div>
				{showGuide && (
					<div style={{ fontSize: 13, color: '#444', background: '#fafafa', padding: 8, borderRadius: 6 }}>
						- Batch size vs Throughput: how throughput scales with batch size. Look for monotonic scaling or drops indicating inefficiency.
						<br />- Batch size vs TTFT: how latency to first token changes with batch size; spikes may indicate performance cliffs.
						<br />- Cached vs Uncached throughput: how caching affects throughput; large gaps may indicate warmup effects.
					</div>
				)}
			</div>

			<h3>Batch size vs Throughput (per file)</h3>
			<ModelToggleLegend series={diagnosticSeries} hiddenModels={hiddenModels} onToggle={toggleModel} />
			<div style={{ background: '#fff', padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
				<ResponsiveContainer width="100%" height={340}>
					<LineChart data={throughputOverlayData}>
						<XAxis dataKey="batch" />
						<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
						<Tooltip content={<DiagnosticsTooltip valueFormatter={(v: number) => `${formatNumber(v, 2)} t/s`} />} />
						<Legend />
						{diagnosticSeries.map((model) => (
							<Line
								key={model.key}
								type="monotone"
								dataKey={model.key}
								name={model.label}
								stroke={model.color}
								strokeWidth={2}
								dot={false}
								hide={hiddenModels.has(model.key)}
								connectNulls
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</div>

			<h3>Batch size vs TTFT (per file)</h3>
			<div style={{ background: '#fff', padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
				<div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
					Log scale keeps lower-latency profiles readable when another profile has much larger TTFT values.
				</div>
				<ResponsiveContainer width="100%" height={340}>
					<LineChart data={ttftOverlayData}>
						<XAxis dataKey="batch" />
						<YAxis scale="log" domain={['auto', 'auto']} tickFormatter={(v) => formatNumber(v as number, 1)} />
						<Tooltip content={<DiagnosticsTooltip valueFormatter={(v: number) => `${formatNumber(v, 1)} ms`} />} />
						<Legend />
						{diagnosticSeries.map((model) => (
							<Line
								key={model.key}
								type="monotone"
								dataKey={model.key}
								name={model.label}
								stroke={model.color}
								strokeWidth={2}
								dot={false}
								hide={hiddenModels.has(model.key)}
								connectNulls
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</div>

			<h3>Cached vs Uncached Throughput (per file)</h3>
			<div style={{ background: '#fff', padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
				<div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
					Solid lines show cached throughput. Dashed lines show uncached throughput.
				</div>
				<ResponsiveContainer width="100%" height={360}>
					<LineChart data={cachedOverlayData}>
						<XAxis dataKey="batch" />
						<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
						<Tooltip content={<DiagnosticsTooltip valueFormatter={(v: number) => `${formatNumberCompact(v)} t/s`} />} />
						<Legend />
						{diagnosticSeries.map((model) => (
							<React.Fragment key={model.key}>
								<Line
									type="monotone"
									dataKey={`${model.key}_cached`}
									name={`${model.label} cached`}
									stroke={model.color}
									strokeWidth={2}
									dot={false}
									hide={hiddenModels.has(model.key)}
									connectNulls
								/>
								<Line
									type="monotone"
									dataKey={`${model.key}_uncached`}
									name={`${model.label} uncached`}
									stroke={model.color}
									strokeWidth={2}
									strokeDasharray="5 4"
									dot={false}
									hide={hiddenModels.has(model.key)}
									connectNulls
								/>
							</React.Fragment>
						))}
					</LineChart>
				</ResponsiveContainer>
			</div>

			<div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 6 }}>
				<strong>How to read these diagnostics</strong>
				<ol>
					<li>Check schema & anomalies — fix or re-export source if required.</li>
					<li>Confirm peak throughput and batch size where it occurs; use that batch for capacity planning.</li>
					<li>Use TTFT median to assess interactive latency; investigate spikes in TTFT vs batch size.</li>
					<li>Compare cached vs uncached to estimate warmup and caching impact.</li>
				</ol>
			</div>
		</div>
	);
};

export default EngineerView;
