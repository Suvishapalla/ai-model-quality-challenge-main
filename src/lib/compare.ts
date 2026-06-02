import { ParsedFile } from '../types';
import { aggregateModel } from './normalize';

export interface ProfileComparison {
  profile: string;
  workloadLabel?: string;
  entries: Array<{
    fileName: string;
    model: string;
    agg: any;
  }>;
  bestThroughput?: string;
  bestTTFT?: string;
  bestRPM?: string;
  bestStability?: string;
}

// Group files by profile (exact match) and compute per-profile winners
export function compareFilesByProfile(files: ParsedFile[]): Record<string, ProfileComparison> {
  const groups: Record<string, ProfileComparison> = {};
  for (const f of files) {
    const profile = f.profile || f.profileName || 'profile_unknown';
    if (!groups[profile]) groups[profile] = { profile, workloadLabel: f.workloadLabel, entries: [] };
    const agg = aggregateModel(f.rows as any);
    groups[profile].entries.push({ fileName: f.fileName, model: f.model, agg });
    // prefer the first non-empty workloadLabel
    if (!groups[profile].workloadLabel && (f.workloadLabel as any)) groups[profile].workloadLabel = f.workloadLabel;
  }

  // compute winners per group
  for (const p of Object.keys(groups)) {
    const g = groups[p];
    let bestThroughput = -Infinity;
    let bestTTFT = Infinity;
    let bestRPM = -Infinity;
    let bestStability = -Infinity;
    for (const e of g.entries) {
      const t = e.agg.maxThroughput ?? -Infinity;
      const tt = e.agg.medianTTFT ?? Infinity;
      const r = e.agg.avgRPM ?? -Infinity;
      const stability = e.agg.stabilityScore ?? -Infinity;
      if (t > bestThroughput) bestThroughput = t, g.bestThroughput = e.fileName;
      if (tt < bestTTFT) bestTTFT = tt, g.bestTTFT = e.fileName;
      if (r > bestRPM) bestRPM = r, g.bestRPM = e.fileName;
      if (stability > bestStability) bestStability = stability, g.bestStability = e.fileName;
    }
  }

  return groups;
}

export default compareFilesByProfile;
