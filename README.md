# CV Analyzer & Job Matcher

A full-stack web app that compares a CV against a job description and returns a structured match report: overall score, skill gaps, strengths, risks, and CV presentation feedback.

**Live repo:** [github.com/Farah-Tarek101/CV-Analyser](https://github.com/Farah-Tarek101/CV-Analyser)

---

## Features

- **CV input:** upload PDF or `.txt`, or paste plain text
- **Job description analysis:** paste full job post (requirements, responsibilities, nice-to-haves)
- **Match score:** weighted overlap across required skills, experience/tools, and nice-to-have terms
- **Job Match Quality (3D):**
  - Skills — can you do the job today?
  - Judgment — decision quality and evidence
  - Initiative & Adaptability — growth and self-direction signals
- **CV Presentation (5D):** structure, evidence quality, achievement clarity, quantification, ATS readiness
- **Strengths & blockers:** actionable narrative bullets
- **Missing / matched keywords:** section-aware gaps
- **PDF report export:** download analysis from the UI
- **Hybrid AI mode (optional):** OpenAI enrichment on top of rule-based scoring, with automatic fallback

---

## Tech Stack

| Layer    | Stack                                      |
|----------|--------------------------------------------|
| Frontend | React 18, Vite                           |
| Backend  | Node.js, Express                         |
| Parsing  | `multer`, `pdf-parse`                      |
| AI (opt) | OpenAI Chat Completions (`gpt-4o-mini`)   |

---

## Project Structure

```
cv-analyzer/
├── client/                 # React + Vite UI
│   └── src/
│       ├── components/     # CvInputCard, JobDescriptionCard, ResultsCard
│       └── utils/          # scoreBand, pdfReport
├── server/                 # Express API + NLP / AI logic
│   ├── index.js
│   └── uploads/            # temporary file uploads (not persisted)
└── README.md
```

---

## How Scoring Works

### Rule-based engine (default)

1. **Clean & normalize** CV and job text (lowercase, stopwords, aliases like `js → javascript`, `k8s → kubernetes`)
2. **Extract terms** — single words + 2–3 word phrases
3. **Bucket job description** into:
   - Required skills (50%)
   - Experience / tools (30%)
   - Nice-to-have (20%)
4. **Compute coverage** — how many weighted job terms appear in the CV
5. **Build narrative** — 3D match dimensions + 5D CV presentation subscores from structure and writing signals (numbers, action verbs, sections)

### Hybrid AI mode (optional)

When `OPENAI_API_KEY` is set, the API:

1. Runs the rule-based engine first (stable baseline)
2. Sends CV + job + baseline to OpenAI with a **strict JSON schema**
3. Blends AI narrative and refined scores (65% AI job-match quality, 35% rule-based)
4. Falls back to rule-based output if the AI call fails or times out

Response includes `stats.analysisEngine`: `rule_based` or `hybrid_ai`.

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Clone & install

```bash
git clone https://github.com/Farah-Tarek101/CV-Analyser.git
cd CV-Analyser

cd server && npm install
cd ../client && npm install
```

### 2. (Optional) Enable AI

```bash
cd server
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
```

### 3. Run backend

```bash
cd server
npm start
```

API: `http://localhost:3001`  
If port 3001 is busy, the server tries the next free port and writes `.api-port` for the client proxy.

### 4. Run frontend

```bash
cd client
npm run dev
```

Open: `http://localhost:5173`

---

## API Endpoints

| Method | Path                 | Description                          |
|--------|----------------------|--------------------------------------|
| GET    | `/health`            | Health check                         |
| POST   | `/upload`            | Upload CV file only (preview)        |
| POST   | `/api/analyze`       | Multipart: `cv` + `jobDescription` |
| POST   | `/api/analyze-json`  | JSON: `{ cvText, jobDescription }` |

### Example (`analyze-json`)

```bash
curl -X POST http://localhost:3001/api/analyze-json \
  -H "Content-Type: application/json" \
  -d "{\"cvText\":\"React TypeScript Node.js\",\"jobDescription\":\"Required: React, TypeScript, Node.js\"}"
```

---

## Environment Variables

| Variable         | Where   | Description                          |
|------------------|---------|--------------------------------------|
| `PORT`           | server  | API port (default `3001`)            |
| `OPENAI_API_KEY` | server  | Enables hybrid AI mode               |
| `AI_MODEL`       | server  | OpenAI model (default `gpt-4o-mini`) |
| `VITE_API_TARGET`| client  | Override API URL for Vite proxy      |

Never commit `.env` files or API keys.

---

## Privacy

- Uploaded files are processed in memory / temp storage and removed after parsing
- No database persistence in the current MVP
- For production, add explicit retention policy and HTTPS

---

## Roadmap Ideas

- LLM-only deep analysis mode with caching
- Saved analysis history
- Multi-job comparison
- Section-aware CV parsing (skills / experience / education)
- Deploy frontend + API (Render, Railway, Vercel + Fly.io, etc.)

---

## Author

**Farah Tarek** — [Farah-Tarek101](https://github.com/Farah-Tarek101)

---

## License

MIT — see [LICENSE](LICENSE).
