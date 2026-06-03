# Task 1 — Performance Dashboard UI

Live Demo: [ai-model-quality-challenge-main-azure.vercel.app](https://ai-model-quality-challenge-main-azure.vercel.app/)

## Overview

This project converts Cerebras-style `.xlsx` performance sweep files into a visual dashboard for:

* Customers / Product Managers
* Internal Engineers

Users can upload one or more `.xlsx` files and compare model performance across workloads.

---

## Features

### Customer View

* GO / CAUTION / NO-GO recommendations
* Best model recommendations
* Workload labels
* Simple visual charts
* Recommendation reasoning

### Engineer View

* Throughput charts
* TTFT charts
* RPM comparison
* Cached vs uncached throughput
* Same-profile model comparison
* Risk and stability indicators
* Normalized CSV export

---

## Important Note

Profiles represent workload scenarios.

Correct comparison:

* Model A profile 1 vs Model B profile 1

Incorrect comparison:

* Model A profile 1 vs Model A profile 7

Different profiles represent different workloads.

---

## Tech Stack

* React
* TypeScript
* Vite
* Recharts
* SheetJS (`xlsx`)

---

## Run Locally

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

---

## Build

```bash
npm run build
```

---

## Deployment

Deployed using Vercel.

The app is fully client-side and requires no backend.

---

## Supported Metrics

The dashboard analyzes:

* Throughput
* Cached Throughput
* Uncached Throughput
* TTFT
* RPM
* Batch Size
* Cache Percentage
* Input Length
* Output Length

---

## Assumptions

* Profiles represent workload types.
* Some profiles may contain only one batch row.
* All parsing happens in the browser.
* No backend services are used.


## Task 2 — Evalscope Fork
https://github.com/Suvishapalla/evalscope
Developed against commit: 7042e59c54637788a18a0642e86bd59608c4bd4d
