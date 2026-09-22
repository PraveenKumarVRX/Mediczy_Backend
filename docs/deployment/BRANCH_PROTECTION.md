# Branch protection for `main` (WP-0.6)

**Status: written, not applied.** Applying it needs `gh` authenticated as an account with admin
rights on `MySmartHealth/Mediczy` (`gh auth login`) — this session doesn't have that. Run the
script below once you do.

## What it sets

`scripts/ops/apply-branch-protection.sh` calls the GitHub branch-protection API for `main` and turns on:

| Setting | Value | Why |
|---|---|---|
| Required status checks | `Server tests (no new failures)`, `Client build and tests`, `Secret scan (commits in this pull request)` — the three non-advisory jobs in `.github/workflows/ci.yml` | A PR can't merge with a red build or a leaked secret. |
| Strict status checks | on | The branch must be up to date with `main` before merging — no merging a PR built against a stale base. |
| Required approvals | 1 | A second pair of eyes on every change. Raise `REQUIRED_APPROVALS` once the team is bigger. |
| Dismiss stale reviews | on | A new commit after approval needs re-approval — an approval can't cover code nobody looked at. |
| Require CODEOWNERS review | on | See `CODEOWNERS` at the repo root — it lists migrations, auth/RLS, clinical safety, money and SaMD-governance paths. **Edit that file's `@mediczy-owner` placeholders to real GitHub usernames/teams first — an unresolved owner is silently ignored.** |
| Require conversation resolution | on | Every review comment thread must be resolved, not just approved past. |
| Force-push / branch deletion | blocked | `main`'s history can't be rewritten or the branch removed by accident. |
| Enforce for admins | on by default | Admins follow the same rules too. Set `ENFORCE_ADMINS=false` if that's wrong for a small team right now — but that also means an admin can push straight past a failing CI run, so treat it as temporary. |

Linear history is left OFF (merge commits allowed) — set `REQUIRE_LINEAR_HISTORY=true` to require
rebase/squash merges if you'd rather keep `main`'s history linear.

## Running it

```bash
gh auth login                                    # once, as an account with admin on the repo
bash scripts/ops/apply-branch-protection.sh --dry-run   # see the exact payload first
bash scripts/ops/apply-branch-protection.sh              # apply it
```

It's idempotent: re-running it with the same settings is a no-op change on GitHub's side.

## After enabling it

- The first PR after this is enabled will need the three named checks to report before it can
  merge. `ci.yml`'s own header notes it "has not yet run on GitHub" as of when it was written —
  expect to tune the first real run (missing CI env vars, runner differences) before trusting it
  as a hard gate. Watch the first PR closely.
- If a `ci.yml` job's `name:` ever changes, branch protection keeps looking for the OLD name and
  the check will never appear as satisfied — re-run this script (or update it) whenever a job is
  renamed.
- `workflow_dispatch` / `[deploy-prod]` production deploys (`.github/workflows/deploy-with-checks.yml`)
  are a separate workflow from `ci.yml` and are not gated by branch protection — they run whenever
  triggered, on whatever is already on `main`. Branch protection's job is to keep bad code off
  `main` in the first place.
