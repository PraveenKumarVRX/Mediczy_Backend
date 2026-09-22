#!/bin/bash
# Apply branch protection to `main` (WP-0.6). Idempotent — safe to re-run.
#
# What this sets, and why:
#   - Required status checks: the ci.yml jobs (server tests, client build) must pass before a PR
#     can merge. `strict: true` also requires the branch be up to date with main first.
#   - Required pull request reviews: at least 1 approval, and CODEOWNERS review for the paths
#     CODEOWNERS lists (see that file's own header — it has no effect until you edit it).
#   - Dismiss stale reviews on new commits, so an approval can't cover code nobody re-reviewed.
#   - No force-push, no branch deletion, and (by default) rules apply to admins too — see the
#     ENFORCE_ADMINS note below if that is not what you want while the team is small.
#   - Linear history is left OFF (not required) — flip REQUIRE_LINEAR_HISTORY=true if you want it.
#
# Requires: `gh` CLI, authenticated as an account with admin rights on this repository
#   (gh auth login), or a GITHUB_TOKEN with repo admin scope exported in the environment.
# This was written and reviewed but NOT run — the agent that wrote it doesn't have gh auth.
#
# Usage:
#   bash scripts/ops/apply-branch-protection.sh                 # apply
#   bash scripts/ops/apply-branch-protection.sh --dry-run        # print the payload, change nothing
#   ENFORCE_ADMINS=false bash scripts/ops/apply-branch-protection.sh   # let admins bypass (not recommended once the team grows)
set -euo pipefail

REPO="${REPO:-MySmartHealth/Mediczy}"
BRANCH="${BRANCH:-main}"
ENFORCE_ADMINS="${ENFORCE_ADMINS:-true}"
REQUIRED_APPROVALS="${REQUIRED_APPROVALS:-1}"
REQUIRE_LINEAR_HISTORY="${REQUIRE_LINEAR_HISTORY:-false}"
# Must match the `name:` of jobs in .github/workflows/ci.yml exactly.
REQUIRED_CHECKS=("Server tests (no new failures)" "Client build and tests" "Secret scan (commits in this pull request)")

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI not found. Install it: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ Not authenticated. Run: gh auth login (needs admin on $REPO)"; exit 1; }

CONTEXTS_JSON="$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s .)"

PAYLOAD="$(jq -n \
  --argjson contexts "$CONTEXTS_JSON" \
  --argjson approvals "$REQUIRED_APPROVALS" \
  --argjson enforce_admins "$ENFORCE_ADMINS" \
  --argjson linear "$REQUIRE_LINEAR_HISTORY" \
  '{
    required_status_checks: { strict: true, contexts: $contexts },
    enforce_admins: $enforce_admins,
    required_pull_request_reviews: {
      required_approving_review_count: $approvals,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true
    },
    restrictions: null,
    required_linear_history: $linear,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  }')"

echo "Target: $REPO@$BRANCH"
echo "$PAYLOAD" | jq .

if [ "$DRY_RUN" = true ]; then
  echo "(--dry-run: nothing changed)"
  exit 0
fi

echo "$PAYLOAD" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/branches/$BRANCH/protection" \
  --input -

echo "✓ Branch protection applied to $REPO@$BRANCH"
echo "  Required checks are matched by JOB NAME (the 'name:' field in ci.yml), not the workflow file name."
echo "  If ci.yml's job names change later, re-run this script (or GitHub will just never see a matching check)."
