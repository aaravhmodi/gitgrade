# gitgrade-analyzer

GitGrade scoring API.

## Run

```bash
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload
```

## Redis cache

Set `REDIS_URL` to enable report caching.

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
