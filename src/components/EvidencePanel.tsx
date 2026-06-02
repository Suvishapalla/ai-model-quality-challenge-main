import React from 'react';
import { ScoreResult, Anomaly } from '../types';
import { formatNumber, formatNumberCompact } from '../utils/format';

interface Props {
	open: boolean;
	onClose: () => void;
	score?: ScoreResult;
	anomalies?: Anomaly[];
	file?: any;
	why?: string;
}

export const EvidencePanel: React.FC<Props> = ({ open, onClose, score, anomalies = [], file, why }) => {
	if (!open) return null;
	return (
		<div style={{ position: 'fixed', right: 12, top: 72, width: 420, maxHeight: '70vh', overflow: 'auto', background: '#fff', border: '1px solid #ddd', padding: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<h4 style={{ margin: 0 }}>Evidence</h4>
				<button onClick={onClose}>Close</button>
			</div>
			<div style={{ marginTop: 8 }}>
				<strong>Score:</strong> {score ? (score.indeterminate ? 'Insufficient samples (no profile-relative score)' : `${score.score} (${score.status})`) : '—'}
			</div>

			{why && (
				<div style={{ marginTop: 8, background: '#f0f7ff', padding: 8, borderRadius: 6 }}>
					<strong>Why this model is recommended:</strong>
					<p style={{ margin: '6px 0 0 0' }}>{why}</p>
				</div>
			)}

			{score?.plainExplanation && (
				<div style={{ marginTop: 8, background: '#f7f9fb', padding: 8, borderRadius: 6 }}>
					<strong>Quick summary (plain):</strong>
					<p style={{ margin: '6px 0 0 0' }}>{score.plainExplanation}</p>
				</div>
			)}
					<div style={{ marginTop: 8 }}>
						<strong>Reasons:</strong>
						<ul>
							{score?.reasons.map((r, i) => (
								<li key={i}>{r}</li>
							))}
						</ul>
					</div>

					{score && !score.indeterminate && score.contributions && (
						<div style={{ marginTop: 8 }}>
							<strong>Score breakdown:</strong>
							<ul>
								<li>Throughput: {Math.round((score.contributions.throughput ?? 0) * 100)}% of top in profile</li>
								<li>RPM: {Math.round((score.contributions.rpm ?? 0) * 100)}% of top in profile</li>
								<li>Gen speed: {Math.round((score.contributions.genSpeed ?? 0) * 100)}% of top in profile</li>
								<li>TTFT: {Math.round((score.contributions.ttft ?? 0) * 100)}% of top in profile</li>
								{score.contributions.stabilityBonus ? <li>Stability bonus: {(score.contributions.stabilityBonus * 100).toFixed(1)}%</li> : null}
							</ul>
							<div style={{ fontSize: 12, color: '#666' }}>Each metric shows this model's value as a % of the top performer in the same profile. These are independent scores, not components that sum to 100%.</div>
							<div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Score weights: Throughput 40% · RPM 20% · Gen Speed 20% · TTFT 20% (stability bonus applied separately)</div>
						</div>
					)}

					{/* show metric numbers so a non-technical reviewer understands */}
					<div style={{ marginTop: 8 }}>
						<strong>Metrics (aggregated):</strong>
						<ul>
							<li>Throughput (peak): {formatNumberCompact(score?.metrics.throughput ?? undefined) || '—'} t/s</li>
							<li>TTFT (median): {typeof score?.metrics.ttft === 'number' ? formatNumber(score!.metrics.ttft, 1) + ' ms' : '—'}</li>
							<li>RPM (avg): {typeof score?.metrics.rpm === 'number' ? formatNumber(score!.metrics.rpm, 1) : '—'}</li>
							<li>Gen speed (avg): {typeof score?.metrics.genSpeed === 'number' ? formatNumber(score!.metrics.genSpeed, 2) + ' t/s/user' : '—'}</li>
						</ul>
					</div>
			<div style={{ marginTop: 8 }}>
				<strong>Anomalies:</strong>
				<ul>
					{anomalies.length === 0 && <li>No anomalies detected.</li>}
					{anomalies.map((a, i) => (
						<li key={i}>{a.severity.toUpperCase()}: {a.message}</li>
					))}
				</ul>
			</div>
		</div>
	);
};

export default EvidencePanel;
