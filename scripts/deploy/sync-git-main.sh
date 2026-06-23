#!/bin/bash
# Sync production checkout to origin/main (handles divergent local commits).
set -euo pipefail

RESET_TO_ORIGIN_MAIN="${RESET_TO_ORIGIN_MAIN:-false}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
REMOTE_REF="origin/${TARGET_BRANCH}"
STASHED=false

echo "Fetching ${REMOTE_REF}..."
git fetch origin "${TARGET_BRANCH}"

if [ "$RESET_TO_ORIGIN_MAIN" = true ]; then
  echo "RESET_TO_ORIGIN_MAIN=true — resetting hard to ${REMOTE_REF}"
  git checkout "${TARGET_BRANCH}" 2>/dev/null || git checkout -B "${TARGET_BRANCH}" "${REMOTE_REF}"
  git reset --hard "${REMOTE_REF}"
  echo "✓ Reset to $(git rev-parse --short HEAD)"
  exit 0
fi

# Uncommitted edits block merges — stash them so deploy can proceed.
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  STASH_NAME="deploy-sync-$(date +%Y%m%d-%H%M%S)"
  echo "Uncommitted local changes detected — stashing as '${STASH_NAME}'..."
  git stash push -u -m "${STASH_NAME}"
  STASHED=true
fi

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "${REMOTE_REF}")"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "✓ Already on ${REMOTE_REF} ($(git rev-parse --short HEAD))"
elif git merge-base --is-ancestor "$LOCAL_SHA" "$REMOTE_SHA" 2>/dev/null; then
  echo "Fast-forwarding to ${REMOTE_REF}..."
  git merge --ff-only "${REMOTE_REF}"
elif git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA" 2>/dev/null; then
  echo "Local checkout is ahead of ${REMOTE_REF}; merging remote commits..."
  git merge --no-edit "${REMOTE_REF}"
else
  echo "Divergent history detected — merging ${REMOTE_REF} into current branch..."
  if ! git merge --no-edit "${REMOTE_REF}"; then
    echo ""
    echo "❌ Automatic merge failed."
    echo "   Inspect: git status && git log --oneline --graph -10 HEAD ${REMOTE_REF}"
    echo "   To discard local server-only commits and match GitHub main exactly:"
    echo "   RESET_TO_ORIGIN_MAIN=true bash scripts/deploy/deploy-full-prod-s3.sh"
    if [ "$STASHED" = true ]; then
      echo "   Stashed changes preserved — see: git stash list"
    fi
    exit 1
  fi
fi

echo "✓ Synced to $(git rev-parse --short HEAD)"

if [ "$STASHED" = true ]; then
  echo ""
  echo "⚠ Local prod edits were stashed before sync (not lost)."
  echo "   List:  git stash list"
  echo "   Diff:  git stash show -p stash@{0}"
  echo "   Apply: git stash pop   # only if you still need those edits on top of main"
fi
