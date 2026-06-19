# GitGrade

GitGrade scores GitHub work by engineering signal instead of raw commit volume.

## What it is

- `apps/web` is the Next.js dashboard.
- `services/analyzer` is the Python scoring API.
- `datasets` holds training and review data.
- `reports` holds sample outputs.

## Local run

Web:

```bash
npm install
npm run dev:web
```

Analyzer:

```bash
cd services/analyzer
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload
```

## Required env

- Web app:
  - `ANALYZER_URL`
  - `GITGRADE_PUBLIC_URL`
  - `GITHUB_APP_ID`
  - `GITHUB_APP_CLIENT_ID`
  - `GITHUB_APP_CLIENT_SECRET`
  - `GITHUB_APP_PRIVATE_KEY`
  - `GITHUB_APP_WEBHOOK_SECRET`
  - `GITHUB_APP_SLUG`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Analyzer:
  - `REDIS_URL`
  - `ANALYZER_CACHE_TTL_SECONDS`
  - `ANALYZER_CACHE_VERSION`
  - `GITHUB_TOKEN` if you want higher GitHub API limits
  - `POSTHOG_API_KEY` and `POSTHOG_HOST` if you want analytics

## Deployment

- Web app deploys on Vercel.
- Analyzer deploys on Render as a Python web service.
- Redis should be a separate Render Key Value resource, with its connection URL copied into `REDIS_URL`.
- GitHub App callback URL: `https://gitgradebyaarav.xyz/api/github/callback`
- GitHub App webhook URL: `https://gitgradebyaarav.xyz/api/github/webhooks`
- Web app base URL: `https://gitgradebyaarav.xyz`

## API

- `GET /health`
- `GET /sample-report`
- `POST /analyze/repo`
- `POST /analyze/user`

Example payloads:

```json
{ "repo": "vercel/next.js", "commit_limit": 40 }
```

```json
{ "username": "aaravhmodi", "repo_limit": 6, "commits_per_repo": 30 }
```

## Training

- The analyzer uses hybrid scoring: deterministic impact rules plus a trained classifier.
- Training and review scripts live under `services/analyzer/scripts`.
- Keep the report schema stable before changing the model logic.
