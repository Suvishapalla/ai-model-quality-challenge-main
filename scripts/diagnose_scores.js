const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function detectModelAndProfile(fileName) {
  const base = fileName.replace(/\.xlsx?$/i, '');
  const rx1 = /Model[_ ]?([A-Za-z0-9-]+)[_ ]*profile[_ ]*(\d+)/i;
  const rx2 = /([A-Za-z0-9]+)[_ ]*profile[_ ]*(\d+)/i;
  const rx3 = /Model[_ ]?([A-Za-z0-9-]+)/i;
  let model = 'Unknown';
  let profile = 'profile_unknown';
  let m = base.match(rx1);
  if (m) {
    model = `Model ${m[1]}`;
    profile = `profile_${m[2]}`;
    return { model, profile };
  }
  m = base.match(rx2);
  if (m) {
    model = m[1].startsWith('Model') ? m[1] : `Model ${m[1]}`;
    profile = `profile_${m[2]}`;
    return { model, profile };
  }
  m = base.match(rx3);
  if (m) {
    model = `Model ${m[1]}`;
    return { model, profile };
  }
  const rxWords = /Model\s+([A-Za-z0-9-]+).*profile\s*(\d+)/i;
  m = base.match(rxWords);
  if (m) {
    model = `Model ${m[1]}`;
    profile = `profile_${m[2]}`;
  }
  return { model, profile };
}

function normalizeCell(c) {
  return c == null ? '' : String(c).trim().toLowerCase();
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').replace(/%/g, '').trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function detectHeaderRow(worksheet) {
  const dataRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  const headerKeywords = ['input','output','cache','batch','throughput','uncached','cached','ttft','gen','rpm','milliseconds'];
  const scanRows = Math.min(20, dataRows.length);
  let bestRowIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < scanRows; i++) {
    const row = dataRows[i] || [];
    let score = 0;
    for (const cell of row) {
      const s = normalizeCell(cell);
      for (const kw of headerKeywords) if (s.includes(kw)) { score++; break; }
    }
    if (score > bestScore) { bestScore = score; bestRowIdx = i; }
  }
  if (bestScore === 0) {
    for (let i = 0; i < scanRows; i++) {
      const row = dataRows[i] || [];
      if (row.some((c) => normalizeCell(c) !== '')) { bestRowIdx = i; break; }
    }
  }
  return { headerRow: bestRowIdx, header: dataRows[bestRowIdx] || [] };
}

function parseFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  let sheetName = 'Summary';
  if (!workbook.SheetNames.includes('Summary')) sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const { headerRow, header } = detectHeaderRow(ws);
  const headers = header.map((h, idx) => (h == null || String(h).trim() === '' ? `col_${idx}` : String(h).trim()));
  const range = headerRow + 1;
  const rows = XLSX.utils.sheet_to_json(ws, { header: headers, range, defval: null, blankrows: true });
  return rows;
}

function aggregateRows(rows) {
  const throughputVals = [];
  const rpmVals = [];
  const genVals = [];
  const ttftVals = [];
  for (const r of rows) {
    for (const key of Object.keys(r)) {
      const lk = key.trim().toLowerCase();
      const v = toNumber(r[key]);
      if (v == null) continue;
      if (lk.includes('throughput')) throughputVals.push(v);
      else if (lk.includes('rpm')) rpmVals.push(v);
      else if (lk.includes('gen speed') || (lk.includes('gen') && lk.includes('speed')) || lk.includes('gen speed')) genVals.push(v);
      else if (lk.includes('ttft') || lk.includes('response time') || lk.includes('milliseconds')) ttftVals.push(v);
    }
  }
  const maxThroughput = throughputVals.length ? Math.max(...throughputVals) : null;
  const avgRPM = rpmVals.length ? rpmVals.reduce((a,b)=>a+b,0)/rpmVals.length : null;
  const avgGen = genVals.length ? genVals.reduce((a,b)=>a+b,0)/genVals.length : null;
  const medianTTFT = ttftVals.length ? (()=>{ const s=ttftVals.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; })() : null;
  return { maxThroughput, avgRPM, avgGen, medianTTFT };
}

function main() {
  const folder = path.join(__dirname, '..', 'perf_data', 'all_xlsx_files');
  const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.xlsx'));
  const data = [];
  for (const f of files) {
    try {
      const p = path.join(folder, f);
      const rows = parseFile(p);
      const agg = aggregateRows(rows);
      const { model, profile } = detectModelAndProfile(f);
      data.push({ fileName: f, model, profile, agg });
    } catch (e) {
      console.error('Failed to parse', f, e && e.message);
    }
  }

  // group by profile
  const groups = {};
  for (const d of data) {
    groups[d.profile] = groups[d.profile] || [];
    groups[d.profile].push(d);
  }

  const EPS = 1e-6;
  const baselines = require(path.join(__dirname, '..', 'src', 'lib', 'baselines.json'));
  for (const [profile, items] of Object.entries(groups)) {
    console.log('Profile:', profile, 'files:', items.length);
    const bestThroughput = Math.max(...items.map(i => i.agg.maxThroughput ?? 0));
    const bestRPM = Math.max(...items.map(i => i.agg.avgRPM ?? 0));
    const bestGen = Math.max(...items.map(i => i.agg.avgGen ?? 0));
    const bestTTFT = Math.min(...items.map(i => (i.agg.medianTTFT == null ? Infinity : i.agg.medianTTFT)));

    const tTies = items.filter(i => Math.abs((i.agg.maxThroughput ?? 0) - bestThroughput) <= EPS).map(i=>i.fileName);
    const rTies = items.filter(i => Math.abs((i.agg.avgRPM ?? 0) - bestRPM) <= EPS).map(i=>i.fileName);
    const gTies = items.filter(i => Math.abs((i.agg.avgGen ?? 0) - bestGen) <= EPS).map(i=>i.fileName);
    const ttTies = items.filter(i => {
      const v = i.agg.medianTTFT;
      if (bestTTFT === Infinity || v == null) return false;
      return Math.abs(v - bestTTFT) <= EPS;
    }).map(i=>i.fileName);

    console.log('  Best throughput:', bestThroughput, 'ties:', tTies.length, tTies.slice(0,5).join(', '));
    console.log('  Best RPM:', bestRPM, 'ties:', rTies.length, rTies.slice(0,5).join(', '));
    console.log('  Best Gen:', bestGen, 'ties:', gTies.length, gTies.slice(0,5).join(', '));
    console.log('  Best TTFT:', bestTTFT === Infinity ? 'n/a' : bestTTFT, 'ties:', ttTies.length, ttTies.slice(0,5).join(', '));
  }

  // Now run a simplified scoring pass (no stability bonus) to count 100% and status distribution
  const globalAgg = data.map(d => ({ file: d.fileName, agg: d.agg, profile: d.profile }));
  let total = 0, total100 = 0;
  const statusCounts = { GO: 0, CAUTION: 0, 'NO-GO': 0 };

  for (const d of data) {
    total++;
    const group = data.filter(x => x.profile === d.profile);
    const useGlobal = group.length <= 1;
    const ref = useGlobal ? globalAgg : group.map(g => ({ file: g.fileName, agg: g.agg }));

    const hasBaseT = Number.isFinite(baselines.bestThroughput) && baselines.bestThroughput > 0;
    const hasBaseR = Number.isFinite(baselines.bestRPM) && baselines.bestRPM > 0;
    const hasBaseG = Number.isFinite(baselines.bestGen) && baselines.bestGen > 0;
    const hasBaseTT = Number.isFinite(baselines.bestTTFT) && baselines.bestTTFT > 0;

    const bestT = hasBaseT ? baselines.bestThroughput : Math.max(...ref.map(a => a.agg.maxThroughput ?? 0));
    const bestR = hasBaseR ? baselines.bestRPM : Math.max(...ref.map(a => a.agg.avgRPM ?? 0));
    const bestG = hasBaseG ? baselines.bestGen : Math.max(...ref.map(a => a.agg.avgGen ?? 0));
    const bestTT = hasBaseTT ? baselines.bestTTFT : Math.min(...ref.map(a => (a.agg.medianTTFT == null ? Infinity : a.agg.medianTTFT)));

    const t = d.agg.maxThroughput ?? 0;
    const r = d.agg.avgRPM ?? 0;
    const g = d.agg.avgGen ?? 0;
    const tt = d.agg.medianTTFT;

    const throughputScore = bestT > 0 ? Math.max(0, Math.min(1, t / bestT)) : 0;
    const rpmScore = bestR > 0 ? Math.max(0, Math.min(1, r / bestR)) : 0;
    const genScore = bestG > 0 ? Math.max(0, Math.min(1, g / bestG)) : 0;
    const safeBestTT = bestTT === 0 ? Number.EPSILON : bestTT;
    const ttScore = tt == null || !isFinite(safeBestTT) ? 0 : Math.max(0, Math.min(1, safeBestTT / tt));

    const weighted = 0.4 * throughputScore + 0.2 * rpmScore + 0.2 * genScore + 0.2 * ttScore;
    let score = Math.round(weighted * 100);
    // missing penalty
    const missingCount = (t === 0 || t == null ? 1 : 0) + (r === 0 || r == null ? 1 : 0) + (g === 0 || g == null ? 1 : 0) + (tt == null ? 1 : 0);
    if (missingCount > 0) score = Math.max(0, score - missingCount * 8);
    if (score > 100) score = 100;
    if (score === 100) total100++;
    let status = 'NO-GO';
    if (score >= 75) status = 'GO';
    else if (score >= 50) status = 'CAUTION';
    statusCounts[status]++;
  }

  console.log('\nSummary across all files:');
  console.log('  Total files:', total);
  console.log('  100% scores:', total100);
  console.log('  Status counts:', statusCounts);
}

main();
