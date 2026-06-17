# GitGrade

GitGrade is an open-source tool that evaluates GitHub commit history by engineering signal instead of raw commit volume.

## Monorepo layout

- `apps/web` - Next.js dashboard and report viewer
- `services/analyzer` - Python analyzer and future ML/API service
- `datasets` - labeled commit datasets and repository manifests for training
- `reports` - sample and generated report artifacts

## Development

### Web app

```bash
npm install
npm run dev:web
```

### Analyzer

```bash
cd services/analyzer
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload
```

### Model training

```bash
cd services/analyzer
python -m venv .venv
.venv\Scripts\activate
pip install -e .
python scripts/train_model.py --dataset ..\..\datasets\seed_open_source_commits.jsonl
```

### Initial product direction

1. Build the rule-based analyzer first.
2. Export stable JSON reports.
3. Visualize those reports in the web app.
4. Add labeled data and ML after the scoring contract is stable.

## Training approach

- Start with labeled open-source commit data in JSONL format.
- Use the rule engine for weak supervision and manual review to expand labels.
- Train a baseline classifier on commit metadata and structural diff features.
- Compare model predictions against the rule-based score before promoting the model into production scoring.
