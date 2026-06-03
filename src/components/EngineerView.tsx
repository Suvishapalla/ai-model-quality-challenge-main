import React, { useState } from 'react';
import { ParsedFile, Anomaly } from '../types';
import RawDataTable from './RawDataTable';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
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

interface Props {
	files: ParsedFile[];
	anomaliesMap: Map<string, Anomaly[]>;
}

export const EngineerView: React.FC<Props> = ({ files, anomaliesMap }) => {
	if (!files || files.length === 0) return <div>Please upload files to see engineer diagnostics.</div>;

	const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

	const [showGuide, setShowGuide] = useState<boolean>(false);

	const profiles = Array.from(new Set(files.map((f) => f.profile))).filter(Boolean);
	if (!selectedProfile && profiles.length > 0) setSelectedProfile(profiles[0]);

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
								<LineChart data={files.filter(f=>f.profile===selectedProfile).map(f => ({ name: f.fileName, throughput: (aggregateModel(f.rows as any).maxThroughput ?? 0) }))}>
									<XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} height={48} />
									<YAxis tickFormatter={(v) => formatYAxisTick(v as number)} />
									<Tooltip />
									<Line type="monotone" dataKey="throughput" stroke="#8884d8" />
								</LineChart>
							</ResponsiveContainer>
						</div>
						<div style={{ background: '#fff', padding: 8 }}>
							<strong>TTFT (median)</strong>
							<ResponsiveContainer width="100%" height={160}>
								<LineChart data={files.filter(f=>f.profile===selectedProfile).map(f => ({ name: f.fileName, ttft: (aggregateModel(f.rows as any).medianTTFT ?? null) }))}>
									<XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} height={48} />
									<YAxis tickFormatter={(v) => formatYAxisTick(v as number)} />
									<Tooltip />
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
								if (stability > bestStability) { bestStability = stability; bestS = f.fileName; }
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
						<span style={{ marginRight: 12 }}>Files: <strong>{files.length}</strong></span>
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
								<div>Stability score: <strong style={{ color: (agg.stabilityScore ?? 0) >= 0.8 ? 'green' : (agg.stabilityScore ?? 0) >= 0.5 ? '#f5a623' : 'red' }}>{agg.stabilityScore != null ? formatNumber(agg.stabilityScore as any, 2) : '—'}</strong></div>
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
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
				{files.map((f) => {
					const data = (f.rows || []).map((r: any) => ({ batch: r.BatchSize ?? 0, throughput: r.Throughput ?? null })).filter((d: any) => d.batch != null);
					return (
						<div key={f.id ?? f.fileName} style={{ background: '#fff', padding: 8 }}>
							<div style={{ fontSize: 13, fontWeight: 600 }}>{f.fileName}</div>
							<ResponsiveContainer width="100%" height={120}>
								<LineChart data={data}>
									<XAxis dataKey="batch" />
									<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
									<Tooltip formatter={(v:any) => formatNumber(v as number, 2)} />
									<Line type="monotone" dataKey="throughput" stroke="#8884d8" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
					);
				})}
			</div>

			<h3>Batch size vs TTFT (per file)</h3>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
				{files.map((f) => {
					const data = (f.rows || []).map((r: any) => ({ batch: r.BatchSize ?? 0, ttft: r.TTFT ?? null })).filter((d: any) => d.batch != null);
					return (
						<div key={f.id ?? f.fileName} style={{ background: '#fff', padding: 8 }}>
							<div style={{ fontSize: 13, fontWeight: 600 }}>{f.fileName}</div>
							<ResponsiveContainer width="100%" height={120}>
								<LineChart data={data}>
									<XAxis dataKey="batch" />
									<YAxis tickFormatter={(v) => formatNumber(v as number, 1)} />
									<Tooltip formatter={(v:any) => formatNumber(v as number, 1)} />
									<Line type="monotone" dataKey="ttft" stroke="#82ca9d" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
					);
				})}
			</div>

			<h3>Cached vs Uncached Throughput (per file)</h3>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
				{files.map((f) => {
					const data = (f.rows || []).map((r: any) => ({ batch: r.BatchSize ?? 0, cached: r.CachedThroughput ?? null, uncached: r.UncachedThroughput ?? null })).filter((d: any) => d.batch != null || d.cached != null || d.uncached != null);
					return (
						<div key={f.id ?? f.fileName} style={{ background: '#fff', padding: 8 }}>
							<div style={{ fontSize: 13, fontWeight: 600 }}>{f.fileName}</div>
							<ResponsiveContainer width="100%" height={120}>
								<BarChart data={data}>
									<XAxis dataKey="batch" />
									<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
									<Tooltip formatter={(v:any) => formatNumberCompact(v as number)} />
									<Bar dataKey="cached" fill="#8884d8" />
									<Bar dataKey="uncached" fill="#ff7300" />
								</BarChart>
							</ResponsiveContainer>
						</div>
					);
				})}
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
