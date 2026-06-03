import React from 'react';
import { Anomaly, ParsedFile, ScoreResult } from '../types';
import { aggregateModel } from '../lib/normalize';
import { formatNumber, formatNumberCompact } from '../utils/format';

interface Props {
  files: ParsedFile[];
  scores: { file: ParsedFile; result: ScoreResult }[];
  anomaliesMap: Map<string, Anomaly[]>;
}

type MetricKey = 'score' | 'throughput' | 'ttft' | 'rpm' | 'genSpeed' | 'stability';

interface InsightRow {
  file: ParsedFile;
  score: ScoreResult;
  label: string;
  scoreValue: number;
  throughput: number | null;
  ttft: number | null;
  rpm: number | null;
  genSpeed: number | null;
  stability: number | null;
  confidence: number | null;
  anomalies: Anomaly[];
  hasMultipleBatchData: boolean;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #d8e3ef',
  borderRadius: 8,
  padding: 12,
  background: '#fff',
  minHeight: 92,
};

const heatCellBase: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  fontWeight: 700,
  textAlign: 'center',
  fontSize: 13,
};

function fileKey(file: ParsedFile) {
  return file.id ?? file.fileName;
}

function displayName(file: ParsedFile) {
  return `${file.model || file.fileName} — ${file.profile || 'profile'}`;
}

function getScoreForFile(scores: Props['scores'], file: ParsedFile) {
  return scores.find((s) => fileKey(s.file) === fileKey(file) || s.file.fileName === file.fileName)?.result;
}

function bestBy<T>(items: T[], value: (item: T) => number | null | undefined) {
  return items.reduce<T | null>((best, item) => {
    const currentValue = value(item);
    if (currentValue == null || !Number.isFinite(currentValue)) return best;
    if (!best) return item;
    const bestValue = value(best);
    return bestValue == null || currentValue > bestValue ? item : best;
  }, null);
}

function lowestBy<T>(items: T[], value: (item: T) => number | null | undefined) {
  return items.reduce<T | null>((best, item) => {
    const currentValue = value(item);
    if (currentValue == null || !Number.isFinite(currentValue)) return best;
    if (!best) return item;
    const bestValue = value(best);
    return bestValue == null || currentValue < bestValue ? item : best;
  }, null);
}

function heatLabel(value: number | null, best: number | null, higherIsBetter = true) {
  if (value == null || best == null || !Number.isFinite(value) || !Number.isFinite(best) || best <= 0) {
    return { label: 'Watch', color: '#fff4d6', text: '#7a5200' };
  }

  const ratio = higherIsBetter ? value / best : best / value;
  if (ratio >= 0.9) return { label: 'Strong', color: '#dff6e8', text: '#126b36' };
  if (ratio >= 0.7) return { label: 'Good', color: '#e8f1ff', text: '#165aa7' };
  if (ratio >= 0.45) return { label: 'Watch', color: '#fff4d6', text: '#7a5200' };
  return { label: 'Weak', color: '#ffe7e7', text: '#9b1c1c' };
}

function hasMultipleBatchData(file: ParsedFile) {
  const batches = new Set(
    (file.rows || [])
      .filter((row) => row.BatchSize != null && row.Throughput != null)
      .map((row) => row.BatchSize)
  );
  return batches.size > 1;
}

const ExecutiveInsights: React.FC<Props> = ({ files, scores, anomaliesMap }) => {
  const rows: InsightRow[] = files.map((file) => {
    const aggregate = aggregateModel(file.rows);
    const multipleBatchData = hasMultipleBatchData(file);
    const score = getScoreForFile(scores, file) ?? {
      score: 0,
      status: 'NO-GO',
      reasons: [],
      metrics: {},
      indeterminate: true,
    };

    return {
      file,
      score,
      label: displayName(file),
      scoreValue: score.indeterminate ? 0 : score.score ?? 0,
      throughput: aggregate.maxThroughput,
      ttft: aggregate.medianTTFT,
      rpm: aggregate.avgRPM,
      genSpeed: aggregate.avgGen,
      stability: multipleBatchData ? aggregate.stabilityScore : null,
      confidence: file.rows[0]?.confidenceScore ?? null,
      anomalies: anomaliesMap.get(fileKey(file)) || [],
      hasMultipleBatchData: multipleBatchData,
    };
  });

  if (rows.length === 0) return null;

  const bestOverall = bestBy(rows, (row) => row.score.indeterminate ? null : row.scoreValue);
  const highestThroughput = bestBy(rows, (row) => row.throughput);
  const lowestTtft = lowestBy(rows, (row) => row.ttft);
  const bestRpm = bestBy(rows, (row) => row.rpm);
  const mostStable = bestBy(rows.filter((row) => row.hasMultipleBatchData), (row) => row.stability);
  const lowConfidence = lowestBy(rows.filter((row) => row.confidence != null && row.confidence < 0.6), (row) => row.confidence);
  const anomalyRow = rows.find((row) => row.anomalies.some((a) => a.severity === 'warning' || a.severity === 'error'));

  const bestValues: Record<MetricKey, number | null> = {
    score: bestOverall?.scoreValue ?? null,
    throughput: highestThroughput?.throughput ?? null,
    ttft: lowestTtft?.ttft ?? null,
    rpm: bestRpm?.rpm ?? null,
    genSpeed: bestBy(rows, (row) => row.genSpeed)?.genSpeed ?? null,
    stability: mostStable?.stability ?? null,
  };

  const cards = [
    { title: 'Best overall', row: bestOverall, value: bestOverall ? `${bestOverall.scoreValue}/100` : '—' },
    { title: 'Highest throughput', row: highestThroughput, value: highestThroughput?.throughput != null ? `${formatNumberCompact(highestThroughput.throughput)} t/s` : '—' },
    { title: 'Lowest TTFT', row: lowestTtft, value: lowestTtft?.ttft != null ? `${formatNumber(lowestTtft.ttft, 1)} ms` : '—' },
    { title: 'Best RPM', row: bestRpm, value: bestRpm?.rpm != null ? formatNumber(bestRpm.rpm, 1) : '—' },
    { title: 'Most stable', row: mostStable, value: mostStable?.stability != null ? `${formatNumber(mostStable.stability * 100, 0)}%` : '—' },
  ];

  const findings = [
    bestOverall ? `${bestOverall.label} is the strongest overall choice with a score of ${bestOverall.scoreValue}/100.` : null,
    highestThroughput ? `${highestThroughput.label} has the highest peak throughput for heavier traffic.` : null,
    lowestTtft ? `${lowestTtft.label} has the lowest response delay, making it the best fit for responsiveness.` : null,
    lowConfidence ? `${lowConfidence.label} has low confidence, so its result should be reviewed before making a decision.` : 'No uploaded profile is currently marked as low confidence.',
    anomalyRow ? `${anomalyRow.label} has data warnings that may affect trust in the result.` : 'No uploaded file currently has anomaly warnings.',
  ].filter(Boolean).slice(0, 5);

  const columns: { key: MetricKey; label: string; higherIsBetter?: boolean }[] = [
    { key: 'score', label: 'Score' },
    { key: 'throughput', label: 'Throughput' },
    { key: 'ttft', label: 'TTFT', higherIsBetter: false },
    { key: 'rpm', label: 'RPM' },
    { key: 'genSpeed', label: 'Gen Speed' },
    { key: 'stability', label: 'Stability' },
  ];

  return (
    <section style={{ marginBottom: 18 }}>
      <h2>Executive Insights</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        {cards.map((card) => (
          <div key={card.title} style={cardStyle}>
            <div style={{ fontSize: 12, color: '#596b7d', fontWeight: 700, textTransform: 'uppercase' }}>
              {card.title}
              {card.title === 'Most stable' && (
                <span title="Consistency of throughput across batch sizes. Higher = more predictable." style={{ cursor: 'help', marginLeft: 4, color: '#64748b' }}>ⓘ</span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
            <div style={{ fontSize: 13, color: '#34495e', marginTop: 4 }}>{card.row?.label ?? 'Not available'}</div>
          </div>
        ))}
      </div>

      <h3>Ranked Metric Heatmap</h3>
      <div style={{ overflowX: 'auto', border: '1px solid #d8e3ef', borderRadius: 8, background: '#fff', marginBottom: 14 }}>
        <div style={{ minWidth: 760, display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(6, 1fr)', gap: 8, padding: 10 }}>
          <div style={{ fontWeight: 800, color: '#526273' }}>Model profile</div>
          {columns.map((column) => (
            <div key={column.key} style={{ fontWeight: 800, color: '#526273', textAlign: 'center' }}>{column.label}</div>
          ))}

          {rows
            .slice()
            .sort((a, b) => b.scoreValue - a.scoreValue)
            .map((row) => (
              <React.Fragment key={fileKey(row.file)}>
                <div style={{ fontWeight: 700, color: '#1f2d3d' }}>{row.label}</div>
                {columns.map((column) => {
                  const value = row[column.key];
                  const heat = heatLabel(typeof value === 'number' ? value : null, bestValues[column.key], column.higherIsBetter !== false);
                  return (
                    <div key={column.key} style={{ ...heatCellBase, background: heat.color, color: heat.text }}>
                      {heat.label}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
        </div>
      </div>

      <h3>Key Findings</h3>
      <ul style={{ marginTop: 6, paddingLeft: 20, color: '#243447' }}>
        {findings.map((finding) => (
          <li key={finding} style={{ marginBottom: 6 }}>{finding}</li>
        ))}
      </ul>
    </section>
  );
};

export default ExecutiveInsights;
