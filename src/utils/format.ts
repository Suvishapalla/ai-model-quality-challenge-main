export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(value);
}

export function formatNumberCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const v = Math.abs(value as number);
  if (v >= 1_000_000) return ((value as number) / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return ((value as number) / 1_000).toFixed(1) + 'K';
  return formatNumber(value as number, 2);
}

export function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function sanitizeFileName(name: string): string {
  if (!name) return 'download';
  // remove extension-like parts and replace spaces/illegal chars with underscores
  const withoutExt = name.replace(/\.xlsx?$|\.csv$|\.json$/i, '');
  return withoutExt.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function formatYAxisTick(v: number | undefined | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Math.abs(v as number);
  if (n >= 1_000_000) return `${(v as number / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round((v as number) / 1_000)}K`;
  return (Math.round((v as number) * 10) / 10).toString();
}
