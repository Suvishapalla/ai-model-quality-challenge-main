import React from 'react';
import { ParsedFile, ScoreResult, Anomaly } from '../types';
import RecommendationCards from './RecommendationCards';
import MetricCharts from './MetricCharts';
import ExecutiveInsights from './ExecutiveInsights';
import compareFilesByProfile from '../lib/compare';
import { formatNumberCompact } from '../utils/format';
import { aggregateModel } from '../lib/normalize';

interface Props {
  files: ParsedFile[];
  scores: { file: ParsedFile; result: ScoreResult }[];
  onWhy: (file: ParsedFile, score: ScoreResult, anomalies: Anomaly[]) => void;
  anomaliesMap: Map<string, Anomaly[]>;
}

const CustomerView: React.FC<Props> = ({ files, scores, onWhy, anomaliesMap }) => {
  if (!files || files.length === 0) return <div>Please upload one or more perf sweep .xlsx files to begin.</div>;

  const ranked = [...scores].sort((a, b) => {
    // Put indeterminate results at the bottom
    if (a.result.indeterminate && !b.result.indeterminate) return 1;
    if (!a.result.indeterminate && b.result.indeterminate) return -1;
    return (b.result.score ?? 0) - (a.result.score ?? 0);
  });
  const comparisons = compareFilesByProfile(files);

  const top = files
    .map((f) => ({ f, t: (aggregateModel(f.rows as any).maxThroughput ?? 0) }))
    .reduce((best, cur) => (cur.t > (best.t ?? -Infinity) ? cur : best), { f: null as any, t: -Infinity } as any);
  const benchmarkText = top && top.f ? `📊 Benchmark: ${top.f.fileName} — ${formatNumberCompact(top.t)} t/s peak throughput (reference for all comparisons)` : null;

  return (
    <div>
      <ExecutiveInsights files={files} scores={scores} anomaliesMap={anomaliesMap} />

      <h2>Recommendations</h2>
      {benchmarkText && (
        <div style={{ padding: 8, background: '#eef6ff', border: '1px solid #d0e6ff', borderRadius: 6, marginBottom: 12 }}>{benchmarkText}</div>
      )}

      {ranked.map((s) => (
        <div key={s.file.id ?? s.file.fileName}>
          <RecommendationCards
            file={s.file}
            score={s.result}
            anomalies={anomaliesMap.get(s.file.id ?? s.file.fileName) || []}
            onWhy={() => onWhy(s.file, s.result, anomaliesMap.get(s.file.id ?? s.file.fileName) || [])}
            onCompareGlobal={() => (window as any).__compareGlobally && (window as any).__compareGlobally(s.file)}
          />
        </div>
      ))}

      <h3>Same-profile Comparisons</h3>
      {Object.keys(comparisons).map((p) => {
        const comp = comparisons[p];
        return (
          <div key={p} style={{ border: '1px solid #eee', padding: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>Profile:</strong> {comp.profile} {comp.workloadLabel ? `— ${comp.workloadLabel}` : ''}
                <div style={{ fontSize: 13 }}>Files compared: {comp.entries.map((e) => e.fileName).join(', ')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>Best throughput: <strong>{comp.bestThroughput ?? '—'}</strong></div>
                <div>Best latency: <strong>{comp.bestTTFT ?? '—'}</strong></div>
                <div>Best RPM: <strong>{comp.bestRPM ?? '—'}</strong></div>
                <div>Best stability: <strong>{comp.bestStability ?? '—'}</strong></div>
              </div>
            </div>
          </div>
        );
      })}

      <h3>Charts</h3>
      <MetricCharts files={files} anomaliesMap={anomaliesMap} scores={scores} />
    </div>
  );
};

export default CustomerView;
