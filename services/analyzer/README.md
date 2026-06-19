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

## Redis cache

Set `REDIS_URL` to enable report caching and `ANALYZER_CACHE_TTL_SECONDS` to tune cache lifetime.

Example:

```bash
REDIS_URL=redis://:password@host:6379/0
ANALYZER_CACHE_TTL_SECONDS=900
```

## API

- `GET /health`
- `GET /sample-report`
- `POST /analyze/repo`
- `POST /analyze/user`
