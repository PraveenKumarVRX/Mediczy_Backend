# Secret History Cleanup Runbook

## Purpose
Purge previously committed secrets from repository history and complete coordinated credential rotation.

## Scope
- Firebase service account files
- Any committed API keys, tokens, and private keys
- Generated test files containing credentials

## Preconditions
- All impacted credentials have already been rotated in vendor systems.
- Team leads are informed that a force-push history rewrite will occur.
- A maintenance window is scheduled.

## Step 1: Freeze New Pushes
1. Announce temporary push freeze.
2. Pause CI workflows if they auto-push tags or artifacts.

## Step 2: Mirror Clone
```bash
cd /tmp
git clone --mirror git@github.com:MySmartHealth/Mediczy.git mediczy-cleanup.git
cd mediczy-cleanup.git
```

## Step 3: Install Cleanup Tool
Use one tool only.

Option A: git-filter-repo (recommended)
```bash
python3 -m pip install --user git-filter-repo
```

Option B: BFG
```bash
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
```

## Step 4: Rewrite History
Option A: git-filter-repo
```bash
git filter-repo \
  --path config/firebase-service-account-ios.json --invert-paths
```

Repeat for every sensitive path that was ever committed.

Option B: BFG
```bash
java -jar /tmp/bfg-1.14.0.jar --delete-files firebase-service-account-ios.json .
```

## Step 5: Expire Old Objects
```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Step 6: Verify Secret Removal
```bash
git log --all -- config/firebase-service-account-ios.json
git grep -n "BEGIN PRIVATE KEY" $(git rev-list --all) || true
```

Both checks should return no secret content.

## Step 7: Force Push Clean History
```bash
git push --force --all
git push --force --tags
```

## Step 8: Team Recovery Steps
1. Every developer deletes old local clones.
2. Re-clone from remote.
3. Re-apply any unmerged local work manually.

## Step 9: Post-Cleanup Controls
- Keep all secret files in .gitignore.
- Enforce secret scanning in GitHub Advanced Security or equivalent.
- Block pushes containing private keys and known token patterns.
- Move runtime secrets to a managed secret store.

## Quick Checklist
- [ ] Credentials rotated in vendors
- [ ] Freeze announced
- [ ] History rewritten
- [ ] Force push complete
- [ ] Team re-cloned
- [ ] Secret scanning enabled
