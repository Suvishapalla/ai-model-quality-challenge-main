# Task 1 UI — Install & Run

This repository contains a client-side React + TypeScript app for Task 1 (source under `src/`). The UI lets a reviewer upload one or more `.xlsx` perf sweep files (parsed in-browser) and view:

- **Customer View:** go / caution / no-go recommendations, ranked models, and comparison charts.
- **Engineer View:** schema validation warnings, anomalies, raw normalized data, and diagnostic charts.

Quick start (from project root):

1. Install dependencies (Node 18+ recommended):

```bash
cd /path/to/repo
npm install
```

2. Run the dev server (Vite):

```bash
npm run dev
```

3. Open the UI at `http://localhost:5173`.

Build for production:

```bash
npm run build
```

Deploy to Vercel (recommended free):

1. Create a Vercel project and link this repository.
2. Ensure the project root (where `package.json` lives) is selected.
3. Vercel will run `npm run build` and deploy the static output.

Notes & assumptions
- The app parses the `Summary` sheet in each `.xlsx`, or the first sheet if `Summary` doesn't exist.
- Column names are resolved heuristically (case-insensitive) to the expected contract: Input Length, Output Length, Cache %, Batch Size, Throughput (t/s), Uncached/Cached Throughput (t/s), TTFT (ms), Gen Speed (t/s/user), RPM.
- Model and profile are detected from filenames such as `Model_A_profile_1.xlsx`, `Model A profile 1.xlsx`, or `Model L profile 7.xlsx`. New models (e.g., Model L) are supported dynamically — no code changes required.
- All parsing and scoring happen in-browser; this is a purely client-side app with no backend.

Required packages (add via `npm install`):
- `xlsx` — parse Excel files in-browser
- `recharts` — charts

If you'd like I can also:
- Add a minimal `package.json` and Vite config in the repo root if missing.
- Deploy a demo to Vercel and paste the public URL into this README.
