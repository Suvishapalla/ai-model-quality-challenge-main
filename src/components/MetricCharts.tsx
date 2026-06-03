import React, { useState, useMemo, useEffect } from 'react';
import { ParsedFile, Anomaly } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { formatNumber, formatNumberCompact, computeMedian } from '../utils/format';

interface Props {
	files: ParsedFile[];
	anomaliesMap?: Map<string, Anomaly[]>;
	scores?: any[];
}

export const MetricCharts: React.FC<Props> = ({ files, anomaliesMap, scores }) => {
	const [selected, setSelected] = useState<{ metric: string; name: string; value: number } | null>(null);
	const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

	// prepare data for charts: compare max throughput, ttft, rpm, gen speed per model
	const summary = files.map((f) => {
		const throughputs = f.rows.map((r) => (Number.isFinite(r.Throughput as number) ? (r.Throughput as number) : null)).filter((v) => v != null) as number[];
		const ttfts = f.rows.map((r) => (Number.isFinite(r.TTFT as number) ? (r.TTFT as number) : null)).filter((v) => v != null) as number[];
		const rpms = f.rows.map((r) => (Number.isFinite(r.RPM as number) ? (r.RPM as number) : null)).filter((v) => v != null) as number[];
		const gens = f.rows.map((r) => (Number.isFinite(r.GenSpeed as number) ? (r.GenSpeed as number) : null)).filter((v) => v != null) as number[];
		const modelLabel = (f.model || '').toString();
		// derive short name like 'A' or 'ModelA-p1'
		let short = modelLabel;
		const m = modelLabel.match(/Model\s*([A-Za-z0-9_\-]+)/i);
		if (m && m[1]) short = m[1];
		const profNumMatch = (f.profile || '').toString().match(/(\d+)/);
		if (profNumMatch) short = `${short}-p${profNumMatch[1]}`;

		return {
			// use model + profile for clear labels
			name: `${f.model} — ${f.profile ?? 'profile_unknown'}`,
			shortName: short,
			id: f.id,
			fileName: f.fileName,
			model: f.model,
			throughput: throughputs.length ? Math.max(...throughputs) : 0,
			ttft: ttfts.length ? computeMedian(ttfts) : null,
			rpm: rpms.length ? rpms.reduce((a, b) => a + b, 0) / rpms.length : null,
			gen: gens.length ? gens.reduce((a, b) => a + b, 0) / gens.length : null,
		};
	});

	// build profile list for profile-wise comparisons
	const profiles = useMemo(() => Array.from(new Set(files.map((f) => f.profile))).filter(Boolean), [files]);
	useEffect(() => {
		if (!selectedProfile && profiles.length > 0) setSelectedProfile(profiles[0]);
	}, [profiles, selectedProfile]);

	return (
		<div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
				<div style={{ fontSize: 14, fontWeight: 600 }}>Model metric summaries</div>
				<div style={{ fontSize: 13, color: '#666' }}>Click a bar to see the numeric value.</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
				<div style={{ height: 260, background: '#fff', padding: 8 }}>
					<h4>Max Throughput</h4>
					<div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
						What it shows: the highest measured throughput (requests per second) the model reached across tested batch sizes. Higher is better for batch workloads.
					</div>
					<ResponsiveContainer width="100%" height={160}>
							<BarChart data={summary}>
								<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
								<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
								<Tooltip formatter={(value: any) => typeof value === 'number' ? formatNumber(value as number, 2) : value} labelFormatter={(label) => {
									const s = summary.find((x) => x.shortName === label);
									return s ? `${s.name}` : label;
								}} />
								<Legend />
									<Bar name="Throughput" dataKey="throughput" onClick={(d: any) => { const payload = d && d.payload ? d.payload : d; setSelected({ metric: 'throughput', name: payload.name, value: payload.throughput }); }}>
										{summary.map((entry, idx) => {
											const anomalies = anomaliesMap ? anomaliesMap.get(entry.id ?? entry.fileName) || [] : [];
											const hasError = anomalies.some((a: Anomaly) => a.severity === 'error');
											const hasWarn = anomalies.some((a: Anomaly) => a.severity === 'warning');
											const color = hasError ? '#ff5c5c' : hasWarn ? '#ffc658' : '#8884d8';
											return <Cell key={`cell-${idx}`} fill={color} />;
										})}
									</Bar>
						</BarChart>
					</ResponsiveContainer>
					{selected && selected.metric === 'throughput' && (
						<div style={{ marginTop: 6, fontSize: 13 }}>Value for <strong>{selected.name}</strong>: {selected.value ?? '—'}</div>
					)}
					</div>

				<div style={{ height: 260, background: '#fff', padding: 8 }}>
					<h4>Median TTFT</h4>
					<div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
						What it shows: the median Time-To-First-Token (ms) across inputs. Lower is better — this reflects how responsive the model is for interactive use.
					</div>
					<ResponsiveContainer width="100%" height={160}>
							<BarChart data={summary}>
								<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
								<YAxis tickFormatter={(v) => formatNumber(v as number, 1)} />
								<Tooltip formatter={(value: any) => typeof value === 'number' ? formatNumber(value as number, 1) : value} labelFormatter={(label) => {
									const s = summary.find((x) => x.shortName === label);
									return s ? `${s.name}` : label;
								}} />
								<Legend />
							<Bar name="TTFT (ms)" dataKey="ttft" onClick={(d: any) => { const payload = d && d.payload ? d.payload : d; setSelected({ metric: 'ttft', name: payload.name, value: payload.ttft }); }}>
								{summary.map((entry, idx) => {
									const anomalies = anomaliesMap ? anomaliesMap.get(entry.id ?? entry.fileName) || [] : [];
									const hasError = anomalies.some((a: Anomaly) => a.severity === 'error');
									const hasWarn = anomalies.some((a: Anomaly) => a.severity === 'warning');
									const color = hasError ? '#ff5c5c' : hasWarn ? '#ffc658' : '#82ca9d';
									return <Cell key={`cell-ttft-${idx}`} fill={color} />;
								})}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
					{selected && selected.metric === 'ttft' && (
						<div style={{ marginTop: 6, fontSize: 13 }}>Value for <strong>{selected.name}</strong>: {selected.value ?? '—'}</div>
					)}
					</div>

				<div style={{ height: 260, background: '#fff', padding: 8 }}>
					<h4>RPM (avg)</h4>
					<div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
						What it shows: average requests per minute estimated from the projection. Higher indicates better throughput for user-facing traffic patterns.
					</div>
					<ResponsiveContainer width="100%" height={160}>
							<BarChart data={summary}>
								<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
								<YAxis tickFormatter={(v) => formatNumberCompact(v as number)} />
								<Tooltip formatter={(value: any) => typeof value === 'number' ? formatNumber(value as number, 1) : value} labelFormatter={(label) => {
									const s = summary.find((x) => x.shortName === label);
									return s ? `${s.name}` : label;
								}} />
								<Legend />
							<Bar name="RPM" dataKey="rpm" onClick={(d: any) => { const payload = d && d.payload ? d.payload : d; setSelected({ metric: 'rpm', name: payload.name, value: payload.rpm }); }}>
								{summary.map((entry, idx) => {
									const anomalies = anomaliesMap ? anomaliesMap.get(entry.id ?? entry.fileName) || [] : [];
									const hasError = anomalies.some((a: Anomaly) => a.severity === 'error');
									const hasWarn = anomalies.some((a: Anomaly) => a.severity === 'warning');
									const color = hasError ? '#ff5c5c' : hasWarn ? '#ffc658' : '#ffc658';
									return <Cell key={`cell-rpm-${idx}`} fill={color} />;
								})}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
					{selected && selected.metric === 'rpm' && (
						<div style={{ marginTop: 6, fontSize: 13 }}>Value for <strong>{selected.name}</strong>: {selected.value ?? '—'}</div>
					)}
					</div>

				<div style={{ height: 260, background: '#fff', padding: 8 }}>
					<h4>Gen Speed (avg)</h4>
					<div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
						What it shows: token generation speed per user (t/s/user). Higher is better for interactive throughput per user.
					</div>
					<ResponsiveContainer width="100%" height={160}>
							<BarChart data={summary}>
								<XAxis dataKey="shortName" interval={0} angle={-45} textAnchor="end" tick={{ fontSize: 11 }} height={64} />
								<YAxis tickFormatter={(v) => formatNumber(v as number, 2)} />
								<Tooltip formatter={(value: any) => typeof value === 'number' ? formatNumber(value as number, 2) : value} labelFormatter={(label) => {
									const s = summary.find((x) => x.shortName === label);
									return s ? `${s.name}` : label;
								}} />
								<Legend />
							<Bar name="Gen Speed" dataKey="gen" onClick={(d: any) => { const payload = d && d.payload ? d.payload : d; setSelected({ metric: 'gen', name: payload.name, value: payload.gen }); }}>
								{summary.map((entry, idx) => {
									const anomalies = anomaliesMap ? anomaliesMap.get(entry.id ?? entry.fileName) || [] : [];
									const hasError = anomalies.some((a: Anomaly) => a.severity === 'error');
									const hasWarn = anomalies.some((a: Anomaly) => a.severity === 'warning');
									const color = hasError ? '#ff5c5c' : hasWarn ? '#ffc658' : '#8884d8';
									return <Cell key={`cell-gen-${idx}`} fill={color} />;
								})}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
					{selected && selected.metric === 'gen' && (
						<div style={{ marginTop: 6, fontSize: 13 }}>Value for <strong>{selected.name}</strong>: {selected.value ?? '—'}</div>
					)}
					</div>
			</div>
		</div>
	);
};

export default MetricCharts;
