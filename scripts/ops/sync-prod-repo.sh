#!/usr/bin/env bash
# Fast-forward EC2 production checkout to origin/main.
# Use when `git pull` fails with "divergent branches".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Syncing $ROOT to origin/main ..."
git fetch origin main

if git merge-base --is-ancestor HEAD origin/main 2>/dev/null && \
   git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  echo "Already up to date with origin/main ($(git rev-parse --short HEAD))"
  exit 0
fi

if git merge --ff-only origin/main; then
  echo "Fast-forwarded to origin/main ($(git rev-parse --short HEAD))"
  exit 0
fi

echo "ERROR: Local branch has diverged from origin/main."
echo ""
git status -sb
echo ""
echo "Recent local commits not on origin/main:"
git log --oneline origin/main..HEAD | head -5 || true
echo ""
echo "To match GitHub main exactly (discards local commits):"
echo "  git reset --hard origin/main"
echo ""
echo "To keep local commits on top of main:"
echo "  git pull --rebase origin main"
exit 1
