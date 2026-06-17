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

Example API payloads:

```json
POST /analyze/repo
{
  "repo": "vercel/next.js",
  "commit_limit": 40
}
```

```json
POST /analyze/user
{
  "username": "aaravhmodi",
  "repo_limit": 6,
  "commits_per_repo": 30
}
```

### Model training

```bash
cd services/analyzer
python -m venv .venv
.venv\Scripts\activate
pip install -e .
python scripts/train_model.py --dataset ..\..\datasets\seed_open_source_commits.jsonl
```

### Manual review

```bash
cd services/analyzer
.venv\Scripts\python scripts/build_review_queue.py --dataset ..\..\datasets\open_source_commits_git.jsonl --per-label 25
.venv\Scripts\python scripts/review_labels.py --reviewer your-name
```

### User-specific data collection

```bash
cd services/analyzer
.venv\Scripts\python scripts/collect_from_github_user.py --username aaravhmodi
.venv\Scripts\python scripts/collect_from_local_repos.py --repos C:\path\to\repo1 C:\path\to\repo2
.venv\Scripts\python scripts/merge_datasets.py --inputs ..\..\datasets\commitsuite_gitgrade.jsonl ..\..\datasets\github_user_commits.jsonl --output ..\..\datasets\training_combined.jsonl
```

### Error analysis

```bash
cd services/analyzer
.venv\Scripts\python scripts/error_report.py --dataset ..\..\datasets\training_combined_with_local.jsonl
.venv\Scripts\python scripts/build_focus_review_queue.py --dataset ..\..\datasets\user_history_combined.jsonl --target-total 100
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
