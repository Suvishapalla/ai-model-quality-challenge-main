import React, { useState, useEffect } from 'react';
import FileUploader from './components/FileUploader';
import CustomerView from './components/CustomerView';
import EngineerView from './components/EngineerView';
import EvidencePanel from './components/EvidencePanel';
import { ParsedFile, Anomaly } from './types';
import { scoreAllWithMode, scoreModel, ScoringMode } from './lib/scoring';
import { detectAll } from './lib/anomalies';
import { DEFAULT_PERFORMANCE_FILE_NAMES, loadDefaultPerformanceFiles } from './lib/defaultPerformanceData';

function mergeParsedFiles(existing: ParsedFile[], incoming: ParsedFile[]) {
  const existingNames = new Set(existing.map((f) => (f.fileName || '').toLowerCase()));
  const toAdd: ParsedFile[] = [];
  for (const parsedFile of incoming) {
    const name = (parsedFile.fileName || '').toLowerCase();
    if (!name || existingNames.has(name)) continue;
    existingNames.add(name);
    toAdd.push(parsedFile);
  }

  return [...existing, ...toAdd];
}

export const App: React.FC = () => {
  // Simple Error Boundary to catch rendering errors and show a helpful message
  class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { error: Error | null }> {
    constructor(props: any) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
      return { error };
    }
    componentDidCatch(error: Error, info: any) {
      // log to console so it's visible in the dev server terminal overlay
      console.error('React render error:', error, info);
    }
    render() {
      if (this.state.error) {
        return (
          <div style={{ padding: 24 }}>
            <h2>Application error</h2>
            <div style={{ whiteSpace: 'pre-wrap', color: '#900' }}>{String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)}</div>
            <div style={{ marginTop: 12 }}>
              Try refreshing the page or check the browser console for more details.
            </div>
          </div>
        );
      }
      return this.props.children as any;
    }
  }
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  // default to relative scoring as requested
  const [scoringMode, setScoringMode] = useState<ScoringMode>('relative');
  const [tab, setTab] = useState<'customer' | 'engineer'>('customer');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceData, setEvidenceData] = useState<{ score?: any; anomalies?: Anomaly[]; file?: ParsedFile; why?: string } | null>(null);
  const [defaultDataLoading, setDefaultDataLoading] = useState(true);
  const [defaultDataError, setDefaultDataError] = useState<string | null>(null);

  const [anomaliesMap, setAnomaliesMap] = useState<Map<string, Anomaly[]>>(new Map());

  const handleUpload = (parsed: ParsedFile[]) => {
    // Merge newly uploaded files into the current files state using functional update
    setFiles((prev) => {
      console.log('Merging uploaded parsed files; incoming:', parsed.length, 'existing:', prev.length);
      const merged = mergeParsedFiles(prev, parsed);
      setEvidenceData(null);
      console.log('Files after merge:', merged.length);
      return merged;
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadDefaults() {
      try {
        const defaultFiles = await loadDefaultPerformanceFiles();
        if (cancelled) return;
        setFiles((prev) => mergeParsedFiles(prev, defaultFiles));
        setDefaultDataError(null);
      } catch (err) {
        console.error('Failed to load default performance data:', err);
        if (!cancelled) setDefaultDataError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setDefaultDataLoading(false);
      }
    }

    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  // recompute anomalies when files change
  useEffect(() => {
    const m = new Map<string, Anomaly[]>();
    for (const p of files) {
      const a = detectAll(p.rows, p.missingColumns || []);
      m.set(p.id ?? p.fileName, a);
    }
    setAnomaliesMap(m);
  }, [files]);

  // recompute scores whenever files or scoringMode change
  useEffect(() => {
    if (!files || files.length === 0) {
      setScores([]);
      return;
    }
    try {
      console.log('Computing scores for', files.length, 'files (mode=', scoringMode, ')');
      const scored = scoreAllWithMode(files, scoringMode);
      setScores(scored);
      console.log('Scoring complete. Results:', scored.map(s => ({ file: s.file.fileName, score: s.result.score, indeterminate: s.result.indeterminate })));
    } catch (err) {
      console.error('Error computing scores:', err);
      try {
        (window as any).__showFatalError && (window as any).__showFatalError(err && err.stack ? err.stack : String(err));
      } catch (e) {
        // ignore
      }
    }
  }, [files, scoringMode]);

  // Compare a single file against the global set explicitly (used by UI action 'Compare globally')
  const compareGlobally = (file: ParsedFile) => {
    const result = scoreModel(file, files, { mode: scoringMode, allowGlobalFallback: true });
    setScores((prev) => prev.map((s) => ({ ...s, result: s.file.id === file.id || s.file.fileName === file.fileName ? result : s.result })));
  };
  // expose for simple wiring from child components that don't receive props
  // (CustomerView buttons call window.__compareGlobally for minimal changes)
  (window as any).__compareGlobally = compareGlobally;

  const buildWhy = (file: ParsedFile, score: any) => {
    const parts: string[] = [];
    if (score?.indeterminate) {
      parts.push(`${file.model} ${file.profile ? `(${file.profile})` : ''} has insufficient samples for a profile-relative score.`);
      if (score?.metrics && (score.metrics.throughput || score.metrics.ttft)) {
        if (score.metrics.throughput) parts.push(`Peak throughput ${score.metrics.throughput} t/s.`);
        if (score.metrics.ttft != null) parts.push(`Median response time ${score.metrics.ttft} ms (lower is better).`);
      }
      parts.push('You can upload another file with the same profile or choose "Compare globally" to score against all uploaded files.');
      return parts.join(' ');
    }

    const parts2: string[] = [];
    parts2.push(`${file.model} ${file.profile ? `(${file.profile})` : ''} scored ${score.score}/100 and is rated ${score.status}.`);
    if (score.metrics && score.metrics.throughput) {
      parts2.push(`Peak throughput ${score.metrics.throughput} t/s.`);
    }
    if (score.metrics && score.metrics.ttft != null) parts.push(`Median response time ${score.metrics.ttft} ms (lower is better).`);
    if ((file as any).workloadLabel) parts.push(`Profile appears to be '${(file as any).workloadLabel}', suitable for ${((file as any).workloadLabel).toLowerCase()}.`);
    if (score.contributionsToScore) {
      const contribs = [] as string[];
      if (score.contributionsToScore.throughput) contribs.push(`throughput +${score.contributionsToScore.throughput} pts`);
      if (score.contributionsToScore.ttft) contribs.push(`latency +${score.contributionsToScore.ttft} pts`);
      if (score.contributionsToScore.rpm) contribs.push(`rpm +${score.contributionsToScore.rpm} pts`);
      if (score.contributionsToScore.genSpeed) contribs.push(`gen speed +${score.contributionsToScore.genSpeed} pts`);
      if (contribs.length) parts.push(`Score makeup: ${contribs.join(', ')}.`);
    }
    return parts2.concat(parts.slice(parts2.length)).join(' ');
  };

  const onWhy = (file: ParsedFile, score: any, anomalies: Anomaly[]) => {
    const why = buildWhy(file, score);
    setEvidenceData({ score, anomalies, file, why });
    setEvidenceOpen(true);
  };

  return (
    <div style={{ padding: 16, fontFamily: 'Inter, system-ui, Arial' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Task 1 — Performance Dashboard</h1>
        <div>
          <button onClick={() => setTab('customer')} style={{ marginRight: 8, background: tab === 'customer' ? '#007acc' : 'transparent', color: tab === 'customer' ? '#fff' : undefined, border: tab === 'customer' ? 'none' : undefined, padding: '8px 12px', borderRadius: 6 }}>Customer View</button>
          <button onClick={() => setTab('engineer')} style={{ background: tab === 'engineer' ? '#007acc' : 'transparent', color: tab === 'engineer' ? '#fff' : undefined, border: tab === 'engineer' ? 'none' : undefined, padding: '8px 12px', borderRadius: 6 }}>Engineer View</button>
        </div>
      </header>
      {/* Scoring mode is fixed to 'relative' per user preference. */}

      <main style={{ marginTop: 12 }}>
        <div style={{ padding: 8, marginBottom: 8, background: '#f7fbff', border: '1px solid #d8ebff', borderRadius: 6 }}>
          {defaultDataLoading
            ? `Loading ${DEFAULT_PERFORMANCE_FILE_NAMES.length} default performance models...`
            : defaultDataError
              ? `Default performance data could not be loaded: ${defaultDataError}`
              : `${DEFAULT_PERFORMANCE_FILE_NAMES.length} default performance models are loaded. Upload more .xlsx files to add additional models or profiles.`}
        </div>
        <FileUploader onUpload={handleUpload} />

        <div style={{ marginTop: 12 }}>
          {tab === 'customer' ? (
            <CustomerView files={files} scores={scores} onWhy={onWhy} anomaliesMap={anomaliesMap} />
          ) : (
            <EngineerView files={files} anomaliesMap={anomaliesMap} />
          )}
        </div>
      </main>

      <EvidencePanel
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        score={evidenceData?.score}
        anomalies={evidenceData?.anomalies}
        file={evidenceData?.file}
        why={evidenceData?.why}
      />
    </div>
  );
};

export default App;
