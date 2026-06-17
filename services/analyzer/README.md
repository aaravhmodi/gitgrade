# gitgrade-analyzer

Initial analyzer service for GitGrade.

## Current scope

- stable report models
- hybrid model + deterministic impact scoring
- repo/user analysis API

## Run

```bash
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload
```

## API

- `GET /health`
- `GET /sample-report`
- `POST /analyze/repo`
- `POST /analyze/user`
