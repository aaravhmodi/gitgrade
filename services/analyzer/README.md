# gitgrade-analyzer

Initial analyzer service for GitGrade.

## Current scope

- stable report models
- rule-based scoring stub
- health and sample analysis API

## Run

```bash
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload
```
