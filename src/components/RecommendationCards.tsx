import React from 'react';
import { ScoreResult, Anomaly } from '../types';
import { formatNumberCompact, formatNumber } from '../utils/format';

interface Props {
	score: ScoreResult;
	file?: { fileName?: string; model?: string; profile?: string };
	onWhy?: () => void;
	// optional action to explicitly compare this file against all uploaded files
	onCompareGlobal?: () => void;
    anomalies?: Anomaly[];
}

export const RecommendationCards: React.FC<Props> = ({ score, onWhy, file, anomalies, onCompareGlobal }) => {
	const color = score.indeterminate ? '#888' : score.score >= 75 ? '#0b8' : score.score >= 50 ? '#f5a623' : '#ff5c5c';
	const bestFor = (file:any, m: ScoreResult['metrics']) => {
		// Prefer explicit workload label from file if present
		const wl = file?.workloadLabel || (file?.profile ?? '').toString();
		const map: Record<string,string> = {
			'Interactive Chat': 'Latency / responsiveness',
			'Extreme Long Context Retrieval': 'Long context retrieval',
			'Long Document Summarization': 'Throughput / generation speed',
			'Long Context QA': 'Low latency / high throughput',
			'Assistant / RAG': 'Latency + RPM balance',
			'Long Generation': 'Generation speed',
			'General Workload': 'General purpose',
		};
		if (wl && map[wl]) return map[wl];
		if (!m) return 'General purpose';
		const { throughput, rpm, genSpeed, ttft } = m;
		if ((throughput ?? 0) >= (genSpeed ?? 0) && (throughput ?? 0) >= (rpm ?? 0)) return 'Batch / throughput';
		if ((genSpeed ?? 0) >= (throughput ?? 0)) return 'Interactive / low-latency';
		if ((ttft ?? 999999) < 200) return 'Long-context / Interactive';
		return 'General purpose';
	};

	return (
		<div style={{ border: `2px solid ${color}`, padding: 12, borderRadius: 8, marginBottom: 12 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div>
					<h3 style={{ margin: 0 }}>{score.indeterminate ? 'Insufficient samples' : score.status}</h3>
					<div style={{ color: '#333' }}>{score.indeterminate ? 'No numeric score — upload another file with same profile or compare globally' : `Score: ${score.score} / 100`}</div>
					<div style={{ fontSize: 12, color: '#666' }}>{file?.fileName ?? ''} {file?.profile ? `— ${file.profile}` : ''}</div>
				</div>
				<div>
					<div style={{ fontSize: 12, color: '#666' }}>Best for</div>
					<div style={{ fontWeight: 600 }}>{bestFor(file, score.metrics)}</div>
				</div>
			</div>
			<div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div style={{ color: '#444' }}>{/* show short formatted summary under badge */}
					{(() => {
						const parts: string[] = [];
						if (score.metrics?.throughput) parts.push(`Throughput: ${formatNumberCompact(score.metrics.throughput)} t/s`);
						if (score.metrics?.ttft != null) parts.push(`TTFT: ${formatNumber(score.metrics.ttft, 1)} ms`);
						if (score.metrics?.rpm) parts.push(`RPM: ${formatNumber(score.metrics.rpm, 1)}`);
						return parts.join(' — ');
					})()
				}</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					{anomalies && anomalies.length > 0 && (
						<div style={{ padding: '4px 8px', background: '#ffecec', border: '1px solid #ffb4b4', borderRadius: 6, fontSize: 12 }}>
							{anomalies.length} {anomalies.length === 1 ? 'anomaly' : 'anomalies'}
						</div>
					)}
						{score.indeterminate ? (
							<>
								<button onClick={onWhy}>Why?</button>
								<button onClick={onCompareGlobal} style={{ marginLeft: 8 }}>Compare globally</button>
							</>
						) : (
							<button onClick={onWhy}>Why?</button>
						)}
				</div>
			</div>
		</div>
	);
};

export default RecommendationCards;
