# Training GitGrade On Open-Source Commit Data

## Goal

Train a baseline classifier that predicts commit quality labels from public commit history features.

## Dataset format

Use JSONL with one labeled commit per line:

```json
{
  "repo": "owner/repo",
  "sha": "abc123",
  "message": "Fix token refresh race condition",
  "files_changed": 4,
  "lines_added": 42,
  "lines_deleted": 18,
  "source_files_changed": 3,
  "test_files_changed": 1,
  "docs_files_changed": 0,
  "generated_files_changed": 0,
  "config_files_changed": 0,
  "vague_message": false,
  "issue_reference": true,
  "tiny_diff": false,
  "whitespace_only": false,
  "repeated_message": false,
  "label": "high_value"
}
```

## Current labels

- `high_value`
- `medium_value`
- `low_value`
- `noise`

## Recommended collection workflow

1. Export commits from selected public repositories.
2. Compute structural features from diffs.
3. Weak-label obvious examples with rules.
4. Manually review uncertain commits and a random validation slice.
5. Retrain and compare the model against the rule baseline.

## Collection command

```bash
cd services/analyzer
.venv\Scripts\python scripts/collect_open_source_data.py --per-repo 25
```

If GitHub API rate limits are too tight, use local git history instead:

```bash
cd services/analyzer
.venv\Scripts\python scripts/collect_from_git_repos.py --max-repos 3 --commits-per-repo 75
```

If you want a larger prebuilt open-source corpus, sync and import CommitSuite:

```bash
cd services/analyzer
.venv\Scripts\python scripts/import_commitsuite.py --sync-repo --limit 2000
```

The importer pulls from `https://github.com/security-pride/CommitSuite` and reads `Ten-category-eval_dataset/all_data.json` from that repo.

To add your own GitHub public history:

```bash
cd services/analyzer
.venv\Scripts\python scripts/collect_from_github_user.py --username aaravhmodi
```

To add local repos on disk:

```bash
cd services/analyzer
.venv\Scripts\python scripts/collect_from_local_repos.py --repos C:\path\to\repo1 C:\path\to\repo2
```

## Current status

- `datasets/seed_open_source_commits.jsonl` is a tiny seed dataset for pipeline validation.
- `datasets/open_source_repo_manifest.json` lists candidate public repositories to expand next.
- `scripts/collect_open_source_data.py` fetches public commit data from GitHub and exports weak labels.
- `scripts/collect_from_git_repos.py` clones public repos and builds a larger local training dataset from git history.
- `scripts/import_commitsuite.py` converts CommitSuite records into GitGrade-compatible JSONL.
- `scripts/collect_from_github_user.py` pulls likely user-authored commits from public GitHub-owned repos.
- `scripts/collect_from_local_repos.py` collects commits from specified local repositories.
- `scripts/merge_datasets.py` combines multiple dataset files into one training set.
- `scripts/build_review_queue.py` samples commits into a manual review queue.
- `scripts/build_focus_review_queue.py` creates a harder queue concentrated on noise and boundary cases.
- `scripts/review_labels.py` runs a terminal labeling workflow and saves review overrides.
- `scripts/error_report.py` shows which manually reviewed commits the model still gets wrong.
- `scripts/train_model.py` trains the first baseline classifier.

## Next step

Keep the merged training corpus fresh by re-importing CommitSuite, re-running review on borderline commits, and retraining from `datasets/training_combined_with_local.jsonl`.
