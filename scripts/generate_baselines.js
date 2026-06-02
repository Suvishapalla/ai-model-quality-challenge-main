const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(walk(full));
    else if (/\.xlsx?$/.test(file)) results.push(full);
  });
  return results;
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

function extractValuesFromWorkbook(file) {
  try {
    const wb = XLSX.readFile(file);
    const sheetName = wb.SheetNames.includes('Summary') ? 'Summary' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    // find header row similar to parser
    const headerKeywords = ['input','output','cache','batch','throughput','ttft','gen','rpm'];
    const normalize = (c) => (c == null ? '' : String(c).trim().toLowerCase());
    let bestRow = 0; let bestScore = 0; const scan = Math.min(10, data.length);
    for (let i=0;i<scan;i++){
      const row = data[i] || [];
      let score = 0;
      for (const cell of row){
        const s = normalize(cell);
        for (const kw of headerKeywords) if (s.includes(kw)){ score++; break; }
      }
      if (score>bestScore){ bestScore=score; bestRow=i; }
    }
    if (bestScore===0){ for (let i=0;i<scan;i++){ const row=data[i]||[]; if (row.some(c=>normalize(c)!='')){bestRow=i;break;} } }
    const headers = (data[bestRow]||[]).map((h,idx)=> (h==null||String(h).trim()==='')?`col_${idx}`:String(h).trim());
    const rows = XLSX.utils.sheet_to_json(ws, { header: headers, range: bestRow, defval: null });
    // map headers to canonical keys
    const canonical = {
      'throughput':'Throughput','uncached throughput':'UncachedThroughput','cached throughput':'CachedThroughput',
      'ttft':'TTFT','rpm':'RPM','gen speed':'GenSpeed'
    };
    const headerKeys = Object.keys(rows[0]||{});
    const mapped = {};
    const canonicalKeys = Object.keys(canonical).sort((a,b)=>b.length-a.length);
    function nk(s){return String(s||'').trim().toLowerCase();}
    for (const k of headerKeys){
      const n = nk(k);
      for (const can of canonicalKeys){ if (n.includes(can) || can.includes(n)){ mapped[canonical[can]] = k; break; } }
    }
    // collect numeric values
    const vals = { throughput: [], rpm: [], gen: [], ttft: [] };
    for (const r of rows){
      const read = (c) => { const k = mapped[c]; return k? r[k]: null };
      const t = toNumber(read('Throughput')); if (t!=null) vals.throughput.push(t);
      const rp = toNumber(read('RPM')); if (rp!=null) vals.rpm.push(rp);
      const g = toNumber(read('GenSpeed')); if (g!=null) vals.gen.push(g);
      const tt = toNumber(read('TTFT')); if (tt!=null) vals.ttft.push(tt);
    }
    return vals;
  } catch (e){ return null; }
}

function main(){
  const root = path.join(__dirname, '..', 'perf_data');
  if (!fs.existsSync(root)){
    console.error('perf_data directory not found, skipping baseline generation.');
    process.exit(0);
  }
  const files = walk(root);
  const all = { throughput: [], rpm: [], gen: [], ttft: [] };
  for (const f of files){
    const v = extractValuesFromWorkbook(f);
    if (!v) continue;
    all.throughput.push(...v.throughput);
    all.rpm.push(...v.rpm);
    all.gen.push(...v.gen);
    all.ttft.push(...v.ttft);
  }
  const bestThroughput = all.throughput.length ? Math.max(...all.throughput) : 1;
  const bestRPM = all.rpm.length ? Math.max(...all.rpm) : 1;
  const bestGen = all.gen.length ? Math.max(...all.gen) : 1;
  const bestTTFT = all.ttft.length ? Math.min(...all.ttft) : 1;

  const out = { bestThroughput, bestRPM, bestGen, bestTTFT };
  const outPath = path.join(__dirname, '..', 'src', 'lib', 'baselines.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote baselines to', outPath, out);
}

main();
